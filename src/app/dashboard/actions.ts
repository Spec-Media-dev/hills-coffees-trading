"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { AGREEMENT_TYPES, getCurrentAgreement, type AgreementType } from "@/lib/auth/agreements";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 003 Phase 6 (T024) — agreement acceptance Server Action.
 *
 * NO NEW RPC, NO SERVICE ROLE. `agreement_acceptances`' own live, applied RLS INSERT policy
 * (`agreement_accept`, `with check`: `user_id = auth.uid() AND is_org_member(organization_id) AND
 * NOT is_blocked_user()`) already IS the complete security boundary this action needs — own user,
 * own org membership, not blocked, all enforced by Postgres itself on every insert attempt,
 * independent of whatever this file does. This is a direct table INSERT through the request-scoped,
 * RLS-respecting server client, the same pattern `lib/agreements/acceptance-status.ts` already
 * documents for the read side.
 *
 * TRUSTED FIELDS ARE SERVER-DERIVED, NEVER CLIENT INPUT:
 *   - `organization_id` / `user_id` — from `getRequestIdentity()`'s fresh acting-organization
 *     resolution, never a hidden form field. `user_id` is additionally re-enforced by the RLS
 *     policy's own `with check` regardless of what this action sends.
 *   - `agreement_version` / `document_hash` — from `getCurrentAgreement(type)`
 *     (`lib/auth/agreements.ts`'s registry), never from the form. The client submits ONLY
 *     `agreementType` (which of the five closed types); everything else about "what the current
 *     version/hash is" is this server's own authority.
 *   - `accepted_at` — the column's own `default now()`; never supplied here at all.
 *   - `ip_address` / `user_agent` — read from THIS request's own headers, never from form input.
 *
 * IP EVIDENCE HONESTY: this repository has no documented, established trusted-reverse-proxy
 * contract (`src/proxy.ts` explicitly reads nothing but cookie presence, for exactly this reason —
 * see its own header comment). `x-forwarded-for`/`x-real-ip` are therefore captured as BEST-AVAILABLE
 * EVIDENCE only (industry-standard practice for legal acceptance records — an IP address is always
 * "what the request claimed," never a cryptographic proof, even in a fully trusted deployment) and
 * are never used for any authorization decision anywhere in this codebase. When neither header is
 * present (e.g. a direct local connection with no proxy in front), `ip_address` is honestly `null` —
 * the column is nullable for exactly this reason — never a fabricated value.
 */
export async function acceptAgreement(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const typeRaw = formData.get("agreementType");
  if (typeof typeRaw !== "string" || !(AGREEMENT_TYPES as readonly string[]).includes(typeRaw)) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }
  const agreementType = typeRaw as AgreementType;

  // 2. AUTHENTICATE + 3. AUTHORIZE (fresh acting organization; RLS re-enforces both independently)
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") {
    return { ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED };
  }
  if (identity.organization === null || identity.requiresOrganizationSelection) {
    return { ok: false, code: ACTION_FEEDBACK.AGREEMENT_ACCEPT_FAILED };
  }

  // 4. CONTROLLED DATA ACCESS — server-derived current version/hash; server-derived request evidence.
  const current = getCurrentAgreement(agreementType);
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null;
  const userAgent = requestHeaders.get("user-agent");

  const supabase = await createClient();
  const { error } = await supabase.from("agreement_acceptances").insert({
    organization_id: identity.organization.organizationId,
    user_id: identity.userId,
    agreement_type: agreementType,
    agreement_version: current.version,
    document_hash: current.documentHash,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  // 5. SAFE ERROR MAPPING
  if (error) {
    // 23505 = unique_violation on (organization_id, user_id, agreement_type, agreement_version) —
    // this exact (org, user, type, CURRENT version) was already accepted. Idempotent success, not
    // an error: the caller's goal ("this agreement is accepted") is already true.
    if (error.code !== "23505") {
      return { ok: false, code: ACTION_FEEDBACK.AGREEMENT_ACCEPT_FAILED };
    }
  }

  // 6. REVALIDATE — the acting organization's gate is evaluated on /dashboard/.
  revalidatePath("/dashboard/");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.AGREEMENT_ACCEPTED };
}
