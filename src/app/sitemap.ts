import type { MetadataRoute } from "next";

import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { getPublicOriginIndex } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public sitemap (Feature 002 T026 — FR-008, FR-026, SC-003).
 *
 * Generated from the SAME public read layer every page uses (`getPublicCoffeeIndex`,
 * `getPublicOriginIndex`) — `PUBLISHED` coffees and `ACTIVE` origins only, because that gate lives
 * in the read layer's own query. There is no separate/broader sitemap-only read.
 *
 * Every URL is built through `canonicalUrl`, the SAME function every page's own
 * `alternates.canonical` uses — so a sitemap entry can never drift from its page's canonical.
 *
 * **Excluded, deliberately**: `/dashboard`, `/dashboard-admin`, `/foundation-status` and
 * `/internal-test/*` (private/internal — T027/T028 own keeping them non-indexable) and
 * `/knowledge/*`/`/legal/*` (CONTENT-01 — not built).
 *
 * `revalidate` must be a literal here (Next.js statically extracts route segment config exports) —
 * it is the same value as `lib/public/cache.ts`'s `CATALOGUE_REVALIDATE_SECONDS`, which this file
 * itself is fed by (`getPublicCoffeeIndex`/`getPublicOriginIndex` already revalidate on that cadence),
 * so this is not a second, independent cache policy.
 */
export const revalidate = 3600;

/** Exported for `tests/public/seo-boundary.test.ts` — see that file for why `sitemap()` itself
 * cannot be called directly under Vitest (it depends on `unstable_cache`, which needs Next's
 * incremental-cache context; the same constraint `lib/public/coffees.ts`'s header documents). */
export const STATIC_ROUTES = [
  "/",
  "/coffee/",
  "/origins/",
  "/sourcing/",
  "/about/",
  "/contact/",
  "/portal-entry/",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [coffees, origins] = await Promise.all([getPublicCoffeeIndex(), getPublicOriginIndex()]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: canonicalUrl(path),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const coffeeEntries: MetadataRoute.Sitemap = coffees.map((coffee) => ({
    url: canonicalUrl(`/coffee/${coffee.slug}/`),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const originEntries: MetadataRoute.Sitemap = origins.map((origin) => ({
    url: canonicalUrl(`/origins/${origin.slug}/`),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...coffeeEntries, ...originEntries];
}
