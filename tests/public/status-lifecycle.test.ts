// @vitest-environment node

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { __fetchCoffeeDetailUncached } from "@/lib/public/coffees";
import { __fetchOriginDetailUncached } from "@/lib/public/origins";
import { CATALOGUE_SLUGS, assertCatalogueFixturesPresent, loadPublicTestEnvironment } from "@/tests/public/fixture-catalogue";

beforeAll(async () => {
  loadPublicTestEnvironment();
  await assertCatalogueFixturesPresent();
});

describe("T039 — public status lifecycle", () => {
  it("exposes only the published coffee and active origin through the anonymous read boundary", async () => {
    await expect(__fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeePublished)).resolves.not.toBeNull();
    for (const slug of [CATALOGUE_SLUGS.coffeeDraft, CATALOGUE_SLUGS.coffeeArchived, "public-test-coffee-unknown"]) {
      await expect(__fetchCoffeeDetailUncached(slug), `coffee ${slug}`).resolves.toBeNull();
    }

    await expect(__fetchOriginDetailUncached(CATALOGUE_SLUGS.originActive)).resolves.not.toBeNull();
    for (const slug of [CATALOGUE_SLUGS.originInactive, CATALOGUE_SLUGS.originArchived, "public-test-origin-unknown"]) {
      await expect(__fetchOriginDetailUncached(slug), `origin ${slug}`).resolves.toBeNull();
    }
  });

  it("uses the same notFound path for unavailable and unknown detail routes without lifecycle redirects", () => {
    for (const file of ["src/app/(public)/coffee/[slug]/page.tsx", "src/app/(public)/origins/[slug]/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("if (!");
      expect(source).toContain("notFound()");
    }
  });
});
