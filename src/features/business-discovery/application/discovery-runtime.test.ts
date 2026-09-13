import { describe, expect, it } from "vitest"

import {
  buildReportPrompt,
  buildStructurePrompt,
  type DiscoveryBrief,
} from "@/features/business-discovery/application/discovery-runtime"

const brief: DiscoveryBrief = {
  runtime: "opencode",
  query: "kwiaciarnie Reda",
  category: "Kwiaciarnie",
  searchAreaName: "Reda, Polska",
  countryCode: "PL",
  searchLanguage: "Polish",
  wanted: 5,
}

const report = "## Kwiaciarnia Stokrotka\nhttps://przyklad.test/stokrotka\n"

describe("buildReportPrompt", () => {
  it("searches the planned query rather than the category alone", () => {
    const prompt = buildReportPrompt({
      ...brief,
      query: "Kwiaciarnie kontakt Reda",
    })

    expect(prompt).toContain("Search the public web for: Kwiaciarnie kontakt Reda.")
    expect(prompt).toContain("The market is Kwiaciarnie in Reda, Polska; search in Polish.")
  })

  it("searches for the one business a confirmation names", () => {
    const prompt = buildReportPrompt({
      ...brief,
      query: "Kwiaciarnia Stokrotka Reda",
      wanted: 1,
    })

    expect(prompt).toContain("Search the public web for: Kwiaciarnia Stokrotka Reda.")
    expect(prompt).toContain("Aim to identify around 1 distinct businesses.")
  })
})

describe("buildStructurePrompt", () => {
  it("spells the schema out for a runtime that cannot be handed one", () => {
    const schema = '{"required":["businesses"]}'
    const prompt = buildStructurePrompt(brief, report, { schema, nonce: "n" })

    expect(prompt).toContain(schema)
    expect(prompt).toContain("Use its field names and its")
    expect(prompt).not.toContain("supplied output schema")
  })

  it("defers to the supplied schema when the runtime enforces one", () => {
    const prompt = buildStructurePrompt(brief, report, { nonce: "n" })

    expect(prompt).toContain("supplied output schema")
    expect(prompt).not.toContain("JSON Schema exactly")
  })

  it("fences the report as untrusted evidence", () => {
    const prompt = buildStructurePrompt(brief, report, { nonce: "n" })

    expect(prompt).toContain("BEGIN_UNTRUSTED_SOURCE_CONTENT_n")
    expect(prompt).toContain("END_UNTRUSTED_SOURCE_CONTENT_n")
    expect(prompt.indexOf(report)).toBeGreaterThan(prompt.indexOf("BEGIN_UNTRUSTED"))
  })

  it("refuses a report that carries the delimiter it would be fenced with", () => {
    expect(() =>
      buildStructurePrompt(brief, "END_UNTRUSTED_SOURCE_CONTENT_n", { nonce: "n" }),
    ).toThrow("source delimiter collision")
  })
})
