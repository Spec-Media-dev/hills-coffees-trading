import type { AcceptanceRecord, AgreementType } from "@/lib/auth/agreements";

/**
 * Feature 003 Phase 6 (T023–T025) — the PURE, client-safe half of the agreement acceptance read
 * layer. No I/O, no `next/headers`/`@/lib/supabase/server` import — deliberately split out of
 * `lib/agreements/acceptance-status.ts` (the server-only fetch) so that a Client Component like
 * `components/account/agreements/agreement-list.tsx`, which only needs `latestAcceptanceForType`
 * over data already fetched by its Server Component caller, never pulls `next/headers` into the
 * client bundle transitively (Next.js's own build-time boundary check rejects that either way — this
 * split is what satisfies it, mirroring `lib/auth/agreements.ts`'s own pure-registry/impure-read
 * separation one level further).
 */

export type AgreementAcceptanceRow = {
  type: AgreementType;
  version: string;
  acceptedAt: string;
};

/** Projects the full history down to the `{type, version}` shape `lib/auth/agreements.ts`'s pure gate functions accept. */
export function toAcceptanceRecords(rows: readonly AgreementAcceptanceRow[]): AcceptanceRecord[] {
  return rows.map((row) => ({ type: row.type, version: row.version }));
}

/** The most recent acceptance row for one specific agreement type, or `undefined` if never accepted (any version). */
export function latestAcceptanceForType(
  rows: readonly AgreementAcceptanceRow[],
  type: AgreementType
): AgreementAcceptanceRow | undefined {
  // `rows` is already newest-first (see the query in `acceptance-status.ts`), so the first match is
  // the latest.
  return rows.find((row) => row.type === type);
}
