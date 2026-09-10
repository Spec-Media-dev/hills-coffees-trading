import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/public/site";

/**
 * Public robots policy (Feature 002 T027 — FR-008, FR-009, SC-003).
 *
 * Disallows every private or internal-infrastructure prefix: `/dashboard`, `/dashboard-admin`
 * (authorized Member/Admin shells), `/foundation-status` (Feature 001's cache/revalidation proof
 * route — live, crawlable, and carried no `robots` metadata until T028), and `/internal-test/` (the
 * T031a cache-proof namespace fixed by `contracts/public-cache-policy.md` §5.3). None of these
 * exposes private data — this is about keeping internal infrastructure out of search results, not
 * access control; `robots.txt` is never treated as an authorization boundary (T028 adds
 * route-level `noindex` metadata as defence in depth on top of this).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/dashboard-admin", "/foundation-status", "/internal-test/"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
