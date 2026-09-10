// @vitest-environment node

import { readFileSync } from "node:fs"

import { beforeAll, describe, expect, it } from "vitest"

import { __fetchCoffeeDetailUncached } from "@/lib/public/coffees"
import { __fetchOriginDetailUncached } from "@/lib/public/origins"
import { buildCoffeeJsonLd, buildJsonLdGraph, buildOriginJsonLd, serializeJsonLd } from "@/lib/public/seo"
import { ALL_CANARIES, CATALOGUE_SLUGS, assertCatalogueFixturesPresent, loadPublicTestEnvironment } from "@/tests/public/fixture-catalogue"

const assertClean = (surface: string) => {
  for (const canary of ALL_CANARIES) expect(surface, `leaked ${canary}`).not.toContain(canary)
}

beforeAll(async () => {
  loadPublicTestEnvironment()
  await assertCatalogueFixturesPresent()
})

describe("T037 — emitted public leakage surfaces", () => {
  it("keeps deterministic private canaries out of DTO-derived SSR, Flight and rendered representations", async () => {
    const coffee = await __fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeePublished)
    const origin = await __fetchOriginDetailUncached(CATALOGUE_SLUGS.originActive)
    expect(coffee).not.toBeNull()
    expect(origin).not.toBeNull()
    const ssr = JSON.stringify({ coffee, origin })
    const flight = JSON.stringify({ tree: [coffee, origin] })
    const rendered = [coffee?.name, coffee?.description, origin?.name, origin?.description].join("\n")
    assertClean(ssr)
    assertClean(flight)
    assertClean(rendered)
  })

  it("keeps JSON-LD and route source metadata/sitemap paths free of private canaries", async () => {
    const coffee = await __fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeePublished)
    const origin = await __fetchOriginDetailUncached(CATALOGUE_SLUGS.originActive)
    if (!coffee || !origin) throw new Error("Fixture disappeared after setup")
    assertClean(serializeJsonLd(buildJsonLdGraph([
      buildCoffeeJsonLd(coffee, "https://example.test/coffee/public-test-coffee-published/"),
      buildOriginJsonLd(origin, "https://example.test/origins/public-test-origin-active/"),
    ])))
    for (const file of ["src/app/sitemap.ts", "src/app/page.tsx", "src/app/(public)/coffee/[slug]/page.tsx", "src/app/(public)/origins/[slug]/page.tsx"]) {
      assertClean(readFileSync(file, "utf8"))
    }
  })

  it("fails when a canary is planted into an emitted surface", () => {
    expect(() => assertClean(`<main>${ALL_CANARIES[0]}</main>`)).toThrow(ALL_CANARIES[0])
  })
})
