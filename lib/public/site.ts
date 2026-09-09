/**
 * Canonical public URL construction (Feature 002, Phases 3–4).
 *
 * Every public route emits `<link rel="canonical">` and Open Graph URLs from ONE configured origin,
 * in the enforced trailing-slash form (FR-026, `contracts/public-route-lifecycle.md` §5). Keeping
 * that rule in a single module is what lets the sitemap and the per-page canonical agree exactly
 * later, instead of drifting apart across route files.
 *
 * This is deliberately narrow: it builds URLs and nothing else. Metadata builders and structured
 * data belong to T024's `lib/public/seo.ts`, which this feature has not reached yet.
 */

/** Used only when no site origin is configured — local development and test runs. */
const FALLBACK_ORIGIN = "http://localhost:3000";

/** The configured public origin, without a trailing slash. */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configured && configured !== "" ? configured : FALLBACK_ORIGIN;
  return origin.replace(/\/+$/, "");
}

/**
 * Normalises a public path to the canonical trailing-slash form: a leading slash, a trailing slash,
 * and `/` left exactly as `/`.
 */
export function canonicalPath(path: string): string {
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  if (withLeading === "/") return "/";
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/** An absolute canonical URL for a public path, in trailing-slash form. */
export function canonicalUrl(path: string): string {
  return `${siteOrigin()}${canonicalPath(path)}`;
}
