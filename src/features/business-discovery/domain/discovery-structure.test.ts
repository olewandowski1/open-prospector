import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import {
  type DiscoveryStructure,
  decodeDiscoveryStructure,
  discoveryStructureJsonSchema,
  type StructuredBusiness,
  verifyAgainstReport,
} from "@/features/business-discovery/domain/discovery-structure"

const REPORT = [
  "Salon fryzjerski Justyna: Reda.",
  "  https://www.facebook.com/fryzjerjustynareda",
  "  Telephone written on the page: 504 713 619. No website of its own.",
  "",
  "Salon fryzjerski Bellezza: Reda.",
  "  https://www.facebook.com/p/Salon-fryzjerski-Bellezza-61579265013667",
  "  No telephone was published. No website of its own.",
  "",
  "Fryzjernia Krasa: Reda.",
  "  https://www.fryzjerniakrasa.pl/",
  "  https://www.fryzjerniakrasa.pl/kontakt",
  "  Telephone 794 002 525, email kontakt@fryzjerniakrasa.pl.",
].join("\n")

const isPublicUrl = (value: string) => /^https:\/\//u.test(value)

describe("discovery structure verification", () => {
  it("gives strict runtimes a required nullable website", async () => {
    const schema = JSON.stringify(discoveryStructureJsonSchema)
    expect(schema).toContain('"websiteUrl"')
    expect(schema).toMatch(/"required":\[[^\]]*"websiteUrl"/u)

    const decoded = await Effect.runPromise(
      decodeDiscoveryStructure({
        schemaVersion: "discovery-structure-v1",
        businesses: [
          {
            ...business({ name: "No Website", sourceUrls: ["https://example.com/business"] }),
            websiteUrl: null,
          },
        ],
      }),
    )
    expect(decoded.businesses[0]).not.toHaveProperty("websiteUrl")
  })

  it("keeps what the report supports", () => {
    const { businesses, rejections } = verify([
      business({
        name: "Fryzjernia Krasa",
        websiteUrl: "https://www.fryzjerniakrasa.pl/",
        sourceUrls: ["https://www.fryzjerniakrasa.pl/", "https://www.fryzjerniakrasa.pl/kontakt"],
        presences: [{ type: "Website", url: "https://www.fryzjerniakrasa.pl/" }],
        contacts: [
          {
            type: "BusinessTelephone",
            value: "+48794002525",
            sourceUrl: "https://www.fryzjerniakrasa.pl/kontakt",
          },
          {
            type: "GenericEmail",
            value: "kontakt@fryzjerniakrasa.pl",
            sourceUrl: "https://www.fryzjerniakrasa.pl/kontakt",
          },
        ],
      }),
    ])

    expect(rejections).toEqual([])
    expect(businesses).toHaveLength(1)
    expect(businesses[0]?.contacts.map((contact) => contact.value)).toEqual([
      "+48794002525",
      "kontakt@fryzjerniakrasa.pl",
    ])
  })

  // The spread of the claim kept an unverified websiteUrl even when this branch set it to none.
  it("drops a website the report does not support", () => {
    const { businesses, rejections } = verify([
      business({
        name: "Fryzjernia Krasa",
        websiteUrl: "https://invented.example/krasa",
        sourceUrls: ["https://www.fryzjerniakrasa.pl/"],
      }),
    ])

    expect(businesses[0]).not.toHaveProperty("websiteUrl")
    expect(rejections).toContainEqual(
      expect.objectContaining({ kind: "website", reason: "not-in-report" }),
    )
  })

  it("drops a website that is not a public address", () => {
    const { businesses, rejections } = verify([
      business({
        name: "Fryzjernia Krasa",
        websiteUrl: "fryzjerniakrasa.pl",
        sourceUrls: ["https://www.fryzjerniakrasa.pl/"],
      }),
    ])

    expect(businesses[0]).not.toHaveProperty("websiteUrl")
    expect(rejections).toContainEqual(
      expect.objectContaining({ kind: "website", reason: "not-public-http" }),
    )
  })

  // The failure that made this necessary: one salon's telephone shown against another salon.
  it("drops a contact the report never wrote down", () => {
    const { businesses, rejections } = verify([
      business({
        name: "Salon fryzjerski Bellezza",
        sourceUrls: ["https://www.facebook.com/p/Salon-fryzjerski-Bellezza-61579265013667"],
        contacts: [
          {
            type: "BusinessTelephone",
            value: "+48504713619",
            sourceUrl: "https://www.facebook.com/p/Salon-fryzjerski-Bellezza-61579265013667",
          },
        ],
      }),
    ])

    expect(businesses[0]?.contacts).toEqual([])
    expect(rejections).toContainEqual(
      expect.objectContaining({ kind: "contact", reason: "not-beside-its-source" }),
    )
  })

  it("refuses a nine-digit run taken out of a page id", () => {
    const { businesses, rejections } = verify([
      business({
        name: "Salon fryzjerski Bellezza",
        sourceUrls: ["https://www.facebook.com/p/Salon-fryzjerski-Bellezza-61579265013667"],
        contacts: [
          {
            type: "BusinessTelephone",
            value: "+48265013667",
            sourceUrl: "https://www.facebook.com/p/Salon-fryzjerski-Bellezza-61579265013667",
          },
        ],
      }),
    ])

    expect(businesses[0]?.contacts).toEqual([])
    expect(rejections).toContainEqual(
      expect.objectContaining({ reason: "prefix-not-in-numbering-plan" }),
    )
  })

  it("drops a source the model introduced by itself", () => {
    const { businesses, rejections } = verify([
      business({
        name: "Salon fryzjerski Justyna",
        sourceUrls: [
          "https://www.facebook.com/fryzjerjustynareda",
          "https://invented.example/justyna",
        ],
      }),
    ])

    expect(businesses[0]?.sourceUrls).toEqual(["https://www.facebook.com/fryzjerjustynareda"])
    expect(rejections).toContainEqual(
      expect.objectContaining({ kind: "source", reason: "not-in-report" }),
    )
  })

  it("drops a business whose every source was unverifiable", () => {
    const { businesses } = verify([
      business({ name: "Nowhere", sourceUrls: ["https://invented.example/a"] }),
    ])

    expect(businesses).toEqual([])
  })

  it("refuses a non-public address", () => {
    const { rejections } = verify([
      business({ name: "Local", sourceUrls: ["http://127.0.0.1/admin"] }),
    ])

    expect(rejections).toContainEqual(
      expect.objectContaining({ kind: "source", reason: "not-public-http" }),
    )
  })

  // Contacts remain attributable when a business report spans several headings.
  it("keeps a contact written further down the business's own section", () => {
    const report = [
      "1) Kwiaciarnia Emi",
      "",
      "Pages read about it:",
      "https://emikwiaciarnia.pl/",
      "",
      "Contacts seen:",
      '- On its own site: "Szybki kontakt: 509 758 700"',
      "",
      "2) Kwiaciarnia Fedde",
      "",
      "Pages read about it:",
      "https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html",
      "",
      "Contacts seen:",
      '- On trojmiasto.pl: "tel: 58 677-00-13"',
    ].join("\n")

    const { businesses, rejections } = verifyAgainstReport(
      {
        schemaVersion: "discovery-structure-v1",
        businesses: [
          business({
            name: "Kwiaciarnia Emi",
            sourceUrls: ["https://emikwiaciarnia.pl/"],
            contacts: [
              {
                type: "BusinessTelephone",
                value: "509 758 700",
                sourceUrl: "https://emikwiaciarnia.pl/",
              },
            ],
          }),
          business({
            name: "Kwiaciarnia Fedde",
            sourceUrls: ["https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html"],
            contacts: [
              {
                type: "BusinessTelephone",
                value: "58 677-00-13",
                sourceUrl: "https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html",
              },
            ],
          }),
        ],
      },
      report,
      "PL",
      isPublicUrl,
    )

    expect(rejections).toEqual([])
    expect(businesses.map((entry) => entry.contacts.map((contact) => contact.value))).toEqual([
      ["509 758 700"],
      ["58 677-00-13"],
    ])
  })

  // The section rule must not become "anywhere in the report" for the business listed last.
  it("still refuses a neighbour's telephone claimed from its own source", () => {
    const report = [
      "1) Kwiaciarnia Emi",
      "https://emikwiaciarnia.pl/",
      "Telephone: 509 758 700",
      "",
      "2) Kwiaciarnia Fedde",
      "https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html",
      "No telephone was published.",
    ].join("\n")

    const { businesses, rejections } = verifyAgainstReport(
      {
        schemaVersion: "discovery-structure-v1",
        businesses: [
          business({ name: "Kwiaciarnia Emi", sourceUrls: ["https://emikwiaciarnia.pl/"] }),
          business({
            name: "Kwiaciarnia Fedde",
            sourceUrls: ["https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html"],
            contacts: [
              {
                type: "BusinessTelephone",
                value: "509 758 700",
                sourceUrl: "https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html",
              },
            ],
          }),
        ],
      },
      report,
      "PL",
      isPublicUrl,
    )

    expect(businesses[1]?.contacts).toEqual([])
    expect(rejections).toContainEqual(
      expect.objectContaining({ kind: "contact", reason: "not-beside-its-source" }),
    )
  })

  // The name is written with quotation marks the structured record drops, so no section is found.
  it("refuses a neighbour's telephone when the report spells the name differently", () => {
    const report = [
      "1) Kwiaciarnia Zuza",
      "https://www.facebook.com/kwiaciarnia-zuza",
      "Telephone: 604 173 591",
      "",
      '2) Kwiaciarnia "Orchidea"',
      "https://kwiaciarniaorchidea.com/",
      "Telephone: 774 669 976",
    ].join("\n")

    const { businesses, rejections } = verifyAgainstReport(
      {
        schemaVersion: "discovery-structure-v1",
        businesses: [
          business({
            name: "Kwiaciarnia Orchidea",
            sourceUrls: ["https://kwiaciarniaorchidea.com/"],
            contacts: [
              {
                type: "BusinessTelephone",
                value: "774 669 976",
                sourceUrl: "https://kwiaciarniaorchidea.com/",
              },
              {
                type: "BusinessTelephone",
                value: "604 173 591",
                sourceUrl: "https://www.facebook.com/kwiaciarnia-zuza",
              },
            ],
          }),
        ],
      },
      report,
      "PL",
      isPublicUrl,
    )

    expect(businesses[0]?.contacts.map((contact) => contact.value)).toEqual(["774 669 976"])
    expect(rejections).toContainEqual(
      expect.objectContaining({ value: "604 173 591", reason: "not-beside-its-source" }),
    )
  })

  // A report that covers one business twice must not hand its second entry to the business before.
  it("gives every mention of a business to that business", () => {
    const report = [
      "1) Kwiaciarnia Emi",
      "https://emikwiaciarnia.pl/",
      "",
      "2) Kwiaciarnia Fedde",
      "https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html",
      "No telephone was published.",
      "",
      "Kwiaciarnia Emi (second listing)",
      "https://emikwiaciarnia.pl/",
      "Telephone: 509 758 700",
    ].join("\n")

    const { businesses } = verifyAgainstReport(
      {
        schemaVersion: "discovery-structure-v1",
        businesses: [
          business({
            name: "Kwiaciarnia Emi",
            sourceUrls: ["https://emikwiaciarnia.pl/"],
            contacts: [
              {
                type: "BusinessTelephone",
                value: "509 758 700",
                sourceUrl: "https://emikwiaciarnia.pl/",
              },
            ],
          }),
          business({
            name: "Kwiaciarnia Fedde",
            sourceUrls: ["https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html"],
            contacts: [
              {
                type: "BusinessTelephone",
                value: "509 758 700",
                sourceUrl: "https://www.trojmiasto.pl/Kwiaciarnia-Fedde-o39147.html",
              },
            ],
          }),
        ],
      },
      report,
      "PL",
      isPublicUrl,
    )

    expect(businesses[0]?.contacts.map((contact) => contact.value)).toEqual(["509 758 700"])
    expect(businesses[1]?.contacts).toEqual([])
  })

  it("rejects output that strays outside the structuring stage", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
        decodeDiscoveryStructure({
          schemaVersion: "discovery-structure-v1",
          businesses: [],
          opportunities: [],
        }),
      ),
    )

    expect(failure.code).toBe("out-of-stage-output")
  })
})

function verify(businesses: readonly StructuredBusiness[]) {
  const structure: DiscoveryStructure = { schemaVersion: "discovery-structure-v1", businesses }
  return verifyAgainstReport(structure, REPORT, "PL", isPublicUrl)
}

function business(overrides: Partial<StructuredBusiness> & { name: string }): StructuredBusiness {
  return {
    locality: "Reda",
    decisionScope: "Local",
    centrallyControlled: false,
    onlineOnly: false,
    sourceUrls: [],
    presences: [],
    contacts: [],
    ...overrides,
  }
}
