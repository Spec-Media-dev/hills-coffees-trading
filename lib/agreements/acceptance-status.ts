import { createClient } from "@/lib/supabase/server";
import type { AgreementType } from "@/lib/auth/agreements";

import type { AgreementAcceptanceRow } from "@/lib/agreements/acceptance-records";

export type { AgreementAcceptanceRow } from "@/lib/agreements/acceptance-records";
export { toAcceptanceRecords, latestAcceptanceForType } from "@/lib/agreements/acceptance-records";

/**
 * Feature 003 Phase 6 (T023–T025) — SERVER-ONLY read layer for `public.agreement_acceptances`.
 * Server-only by construction: imports `@/lib/supabase/server`, which imports `next/headers` — never
 * import THIS file from a Client Component (that is exactly what
 * `lib/agreements/acceptance-records.ts` exists to let `agreement-list.tsx` avoid).
 *
 * READS ONLY, direct table read (not an RPC) — safe because the live, applied RLS policy
 * `agreement_read` already scopes it correctly: `is_org_member(organization_id) OR
 * is_compliance_operator() OR is_auditor()`. Every read here goes through the request-scoped,
 * RLS-respecting server client (`lib/supabase/server`), never the service-role key.
 *
 * Every acceptance row (any version, any type) for the (organization, user) pair is returned, most
 * recent first — callers that only need "is the CURRENT version satisfied" pass the mapped
 * `AcceptanceRecord[]` into `lib/auth/agreements.ts`'s pure gate functions; callers that need to
 * show "you previously accepted an older version" (T023's UI) use the full `acceptedAt`/version
 * history this module returns instead.
 */

/**
 * Every acceptance row for this organization+user, newest first. `[]` when the caller has never
 * accepted anything for this organization (a genuinely open, honest state — never inferred as
 * "accepted" from anything else).
 */
export async function getOrganizationAgreementAcceptances(
  organizationId: string,
  userId: string
): Promise<AgreementAcceptanceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agreement_acceptances")
    .select("agreement_type, agreement_version, accepted_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false });

  return (data ?? []).map((row) => ({
    type: row.agreement_type as AgreementType,
    version: row.agreement_version,
    acceptedAt: row.accepted_at,
  }));
}
