import { expect, test } from "@playwright/test"

// Opt in with PROSPECTOR_OPENCODE_SMOKE_TEST=1 because this uses the developer workspace.
const enabled = process.env.PROSPECTOR_OPENCODE_SMOKE_TEST === "1"

type SmokeCase = Readonly<{ city: string; category: string; customCategory?: string }>

const cases: readonly SmokeCase[] = [
  { city: "Reda", category: "Beauty salons" },
  { city: "Rumia", category: "Dental clinics" },
  { city: "Miastko", category: "Restaurants" },
  { city: "Koszalin", category: "Construction companies" },
  { city: "Słupsk", category: "Law firms" },
  {
    city: "Zdzieszowice",
    category: "Custom category",
    customCategory: "Pet grooming salons",
  },
]

test.describe.configure({ mode: "serial" })

test.describe("OpenCode discovery smoke", () => {
  test.skip(!enabled, "Runs real discovery jobs; enable with PROSPECTOR_OPENCODE_SMOKE_TEST=1")

  for (const { city, category, customCategory } of cases) {
    test(`discovers ${category === "Custom category" ? customCategory : category} in ${city}`, async ({
      page,
    }) => {
      test.setTimeout(12 * 60_000)
      const act = { timeout: 15_000 }

      await page.goto("/runs")
      await page.getByRole("button", { name: "New Run" }).click()
      await expect(page.getByLabel("City or Municipality")).toBeVisible(act)
      await page.getByLabel("City or Municipality").fill(city)
      await page.getByLabel("Target Businesses").fill("5")

      await page.getByRole("combobox", { name: "Business category" }).click(act)
      if (customCategory) {
        await page.getByRole("option", { name: "Custom category" }).click()
        await page.getByLabel("Custom Category").fill(customCategory)
      } else {
        await page.getByRole("option", { name: category }).click()
      }

      // Match the styled item directly because Base UI combines its accessible labels.
      await page.locator('[data-slot="radio-group-item"][aria-label="Quick"]').click()

      await page.getByRole("combobox", { name: "Subscription Runtime" }).click(act)
      await page.getByRole("option", { name: "OpenCode" }).click()
      // The installed CLI owns the catalog, so assert a model was reported rather than its name.
      await expect(page.getByRole("combobox", { name: "Model" })).not.toContainText(
        "No Models Reported",
      )
      await expect(page.getByRole("combobox", { name: "Model" })).not.toContainText(
        "Select A Model",
      )

      await page.getByRole("button", { name: "Check preflight" }).click()

      // The display name is a sibling of the radio, so select the city option by position.
      const areaRadios = page.locator(
        '[role="radiogroup"][aria-label="Search Area"] [role="radio"]',
      )
      console.log(`[${city}] area radios offered: ${await areaRadios.count()}`)
      const cityArea = areaRadios.first()
      await expect(cityArea).toBeVisible({ timeout: 30_000 })
      await cityArea.click()
      await expect(page.getByText(/^OpenCode: /u)).toBeVisible()

      const confirmButton = page.getByRole("button", { name: "Confirm and create run" })
      await expect(confirmButton).toBeEnabled()
      await confirmButton.click()

      const created = page.getByRole("link", { name: "View Progress" })
      await expect(created).toBeVisible()
      const runUrl = new URL((await created.getAttribute("href")) ?? "", page.url()).toString()
      await created.click()
      await expect(page).toHaveURL(/\/runs\//u)

      await expect(
        page.getByText(/Target Reached|Search Exhausted|Cancelled|Paused|Failed/iu),
      ).toBeVisible({ timeout: 10 * 60_000 })

      const overview = await page
        .getByRole("region", { name: /Run Overview/iu })
        .innerText()
        .catch(() => "(overview region not found)")
      test.info().attach(`${city} settled state`, { body: `${runUrl}\n\n${overview}` })
      console.log(`[${city}] ${runUrl}\n${overview}`)
    })
  }
})
