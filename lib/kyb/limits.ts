/**
 * The approved KYB evidence MIME/size contract (RUN DB `attach_kyb_document`,
 * `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §3), as PURE, side-effect-free
 * constants — no `@/lib/supabase/server`, no `next/headers`, no other import.
 *
 * Deliberately split out of `lib/kyb/documents.ts` (which re-exports these same two names for every
 * existing server-side caller) so that:
 *   - `next.config.ts` can import the canonical max size directly, at Next.js config-load time,
 *     without pulling in a server-only Supabase client module it has no business touching.
 *   - a Client Component (`components/account/kyb-document-row.tsx`) can pre-validate a selected
 *     file against the SAME numbers the server enforces, without risking the exact bundling error
 *     this file's sibling split (`lib/agreements/acceptance-records.ts` vs `acceptance-status.ts`)
 *     was already introduced to prevent — importing a server-only module from a Client Component is
 *     a hard Next.js build-time rejection, not just a style concern.
 */

export const KYB_EVIDENCE_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const KYB_EVIDENCE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
