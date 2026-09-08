import { beforeAll, describe, expect, it } from "vitest";

import {
  __fetchCoffeeDetailUncached,
  __fetchCoffeeIndexUncached,
} from "@/lib/public/coffees";
import {
  __fetchOriginDetailUncached,
  __fetchOriginIndexUncached,
} from "@/lib/public/origins";
import { __fetchTaxonomyUncached } from "@/lib/public/taxonomy";
import {
  ALL_CANARIES,
  CATALOGUE_CANARIES,
  CATALOGUE_SLUGS,
  loadPublicTestEnvironment,
} from "@/tests/public/fixture-catalogue";

/**
 * Canary leakage — the PRIMARY public/private boundary proof (Feature 002, T010 — SEC-002, SEC-005,
 * SC-002).
 *
 * WHY THIS AND NOT ONLY THE STRUCTURAL CHECK: a field-name test is defeated by renaming a DTO
 * property. This suite follows the *value*. Each canary is a unique sentinel seeded by T006a into a
 * place it must never escape from, so if the boundary breaks the string turns up in the output
 * whatever the property is called.
 *
 * THE CANARY SET IS EXACTLY WHAT FEATURE 002 IS ALLOWED TO OBTAIN
 * (`contracts/public-dto-allowlist.md` §5):
 *
 *   - the description of each non-public coffee (`DRAFT`, `ARCHIVED`) and non-public origin
 *     (`INACTIVE`, `ARCHIVED`) — proves status gating;
 *   - the certification identifier on the published coffee — proves field-level allowlisting of a
 *     column RLS *does* expose but the DTO contract withholds by default;
 *   - the owner-organization display name already seeded by Feature 001 — no new row.
 *
 * Contract price, reserved quantity, warehouse address and commission percentage are deliberately
 * NOT canaried here: obtaining them would mean creating private trading rows this feature is
 * forbidden to create. Their field *names* stay covered by `dto-structure.test.ts`, and value-level
 * canaries for them belong to the features that own those tables (006/007/008). A canary must never
 * be obtained by manufacturing private business data.
 *
 * WHY THE UNCACHED FETCHERS: `unstable_cache` requires Next.js's incremental-cache context and
 * throws outside a server runtime. The cache stores exactly what the fetcher returns and adds no
 * field, so the fetcher is the publication boundary under test. Cache behaviour is proven separately
 * against a real running server (T031).
 */

/** Serialises a DTO the way any consumer eventually would, so a leak anywhere in it is visible. */
function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

describe("public DTO output carries no private canary", () => {
  beforeAll(() => {
    loadPublicTestEnvironment();
  });

  it("the published coffee is reachable through the public boundary", async () => {
    // If this fails the rest of the suite would "pass" against an empty result set, which would be
    // a false negative — the most dangerous outcome for a leakage test.
    const coffee = await __fetchCoffeeDetailUncached(
      CATALOGUE_SLUGS.coffeePublished
    );
    expect(coffee).not.toBeNull();
    expect(coffee?.slug).toBe(CATALOGUE_SLUGS.coffeePublished);
  });

  it("hides every non-PUBLISHED coffee behind the same null as an unknown slug", async () => {
    expect(
      await __fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeeDraft)
    ).toBeNull();
    expect(
      await __fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeeArchived)
    ).toBeNull();
    expect(
      await __fetchCoffeeDetailUncached("no-such-coffee-slug-at-all")
    ).toBeNull();
  });

  it("hides every non-ACTIVE origin behind the same null as an unknown slug", async () => {
    expect(
      await __fetchOriginDetailUncached(CATALOGUE_SLUGS.originInactive)
    ).toBeNull();
    expect(
      await __fetchOriginDetailUncached(CATALOGUE_SLUGS.originArchived)
    ).toBeNull();
    expect(
      await __fetchOriginDetailUncached("no-such-origin-slug-at-all")
    ).toBeNull();
  });

  it("leaks no canary into any public DTO", async () => {
    const surfaces: Record<string, string> = {
      coffeeIndex: serialize(await __fetchCoffeeIndexUncached()),
      coffeeDetail: serialize(
        await __fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeePublished)
      ),
      originIndex: serialize(await __fetchOriginIndexUncached()),
      originDetail: serialize(
        await __fetchOriginDetailUncached(CATALOGUE_SLUGS.originActive)
      ),
      taxonomy: serialize(await __fetchTaxonomyUncached()),
    };

    for (const [surface, output] of Object.entries(surfaces)) {
      for (const canary of ALL_CANARIES) {
        expect(
          output.includes(canary),
          `${canary} leaked into the ${surface} DTO`
        ).toBe(false);
      }
    }
  });

  it("withholds the certification identifier while still publishing the claim", async () => {
    // The published coffee genuinely has a certification, so this proves field-level allowlisting
    // rather than an empty relation trivially passing.
    const coffee = await __fetchCoffeeDetailUncached(
      CATALOGUE_SLUGS.coffeePublished
    );

    expect(coffee?.certifications.length).toBeGreaterThan(0);
    expect(serialize(coffee?.certifications)).not.toContain(
      CATALOGUE_CANARIES.certificateNumber
    );
  });

  it("emits no internal identifier or bookkeeping column in a published DTO", async () => {
    // A second, shape-level guard on the same output: adding a private field to a DTO would put one
    // of these keys into the serialised form and fail here even if no canary value happened to be
    // attached to it.
    const output = [
      serialize(await __fetchCoffeeIndexUncached()),
      serialize(
        await __fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeePublished)
      ),
      serialize(await __fetchOriginIndexUncached()),
      serialize(
        await __fetchOriginDetailUncached(CATALOGUE_SLUGS.originActive)
      ),
      serialize(await __fetchTaxonomyUncached()),
    ].join("\n");

    for (const forbidden of [
      '"id"',
      '"created_at"',
      '"updated_at"',
      '"created_by"',
      '"updated_by"',
      '"status"',
      '"origin_id"',
      '"region_id"',
      '"parent_origin_id"',
      '"coffee_type_id"',
      '"variety_id"',
      '"processing_method_id"',
      '"packaging_type_id"',
      '"certificate_number"',
      '"file_asset_id"',
    ]) {
      expect(output, `${forbidden} reached a public DTO`).not.toContain(
        forbidden
      );
    }
  });
});
