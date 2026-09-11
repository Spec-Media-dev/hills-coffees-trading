import type { NextConfig } from "next";

import { KYB_EVIDENCE_MAX_SIZE_BYTES } from "./lib/kyb/limits";

/**
 * KYB upload transport limit (post-Phase-6/7 bugfix — real-browser "Body exceeded 1 MB limit."
 * report). Next.js's Server Action request body defaults to 1 MB
 * (`node_modules/next/dist/docs/.../serverActions.md#bodysizelimit`), which is a TRANSPORT limit,
 * not the approved individual-file limit — the two are deliberately kept distinct here. The approved
 * KYB evidence contract already allows files up to `KYB_EVIDENCE_MAX_SIZE_BYTES` (`lib/kyb/
 * limits.ts`, unchanged by this fix); this only raises the transport ceiling enough for exactly that
 * one file to physically reach the server-side validator in `uploadKybDocument`
 * (`src/app/dashboard/kyb/actions.ts`), which remains the real, authoritative size/MIME enforcement.
 * The added headroom covers `multipart/form-data` boundary/part-header overhead plus this form's
 * other small fields (`documentType`, `supersedesDocumentId`) — the docs' own rule of thumb is
 * "an additional 10–20 KB is reasonable"; 256 KiB is deliberately generous relative to that without
 * being an unbounded/excessive limit.
 */
const KYB_UPLOAD_TRANSPORT_OVERHEAD_BYTES = 256 * 1024;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: KYB_EVIDENCE_MAX_SIZE_BYTES + KYB_UPLOAD_TRANSPORT_OVERHEAD_BYTES,
    },
  },
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
   * This was the ONLY change Feature 002 made to this file (the `serverActions.bodySizeLimit` block
   * above is a later, unrelated Feature 003 KYB-upload fix). No cache flag is added here — Feature
   * 001 remains the platform-wide caching authority and its pinned API is used unchanged
   * (`specs/002-public-website/contracts/public-cache-policy.md` §1).
   */
  trailingSlash: true,
};

export default nextConfig;
