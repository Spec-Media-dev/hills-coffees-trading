import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Canonical public URLs carry an enforced trailing slash (Feature 002, T004 — FR-026, SC-010;
   * SRS §5.1; `specs/002-public-website/contracts/public-route-lifecycle.md` §5).
   *
   * THIS SETTING IS GLOBAL — it is not scoped to the public site. Next.js now 308-redirects every
   * unslashed path to its slashed form, which includes Feature 001's already-verified protected
   * surfaces (`/dashboard*`, `/dashboard-admin*`). Enabling it therefore required re-running the
   * full Feature 001 authorization regression across BOTH URL forms of every protected route, for
   * anonymous, member and cross-surface identities, and confirming the redirect hop does not skip
   * `src/proxy.ts` or the layout guard.
   *
   * `/` is unaffected (it is already the slashed form).
   *
   * This is the ONLY change this feature makes to this file. No cache flag is added here — Feature
   * 001 remains the platform-wide caching authority and its pinned API is used unchanged
   * (`specs/002-public-website/contracts/public-cache-policy.md` §1).
   */
  trailingSlash: true,
};

export default nextConfig;
