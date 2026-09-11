import { createClient } from "@/lib/supabase/server";

/**
 * Thin, server-only wrappers around the RUN DB constrained KYB mutation capabilities
 * (`supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`,
 * `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §1–2).
 *
 * These functions perform NO direct `organizations` / `organization_members` / `kyb_applications`
 * table writes of their own — every mutation goes through the named RPC, which is the only place
 * that owns `PENDING_KYB`, `OWNER` membership creation, `can_buy`/`can_sell` derivation, and the
 * `DRAFT`/`SUBMITTED`/`RESUBMISSION_REQUIRED` state transitions. This module does not (and must
 * not) re-derive any of that authorization truth in TypeScript.
 *
 * NOT a Server Action file — these are plain functions a Server Action (RUN A/B) calls, following
 * 001's contract: validate → authenticate → authorize → controlled data access → safe error →
 * revalidate. The "controlled data access" step for KYB onboarding/mutation is always one call here.
 */

export type StartOrganizationOnboardingInput = {
  legalName: string;
  displayName?: string;
  accountType: "BUYER" | "SELLER";
  countryCode?: string;
  taxNumber?: string;
  registrationNumber?: string;
  email?: string;
  phone?: string;
};

export type StartOrganizationOnboardingResult =
  | { ok: true; organizationId: string; organizationStatus: string; created: true }
  | { ok: true; created: false; conflict: "already_member" }
  | { ok: false; error: string };

/**
 * Calls `start_organization_onboarding`. Never accepts or forwards `status`, `can_buy`, `can_sell`,
 * `created_by`, or any membership/role field from the caller — those are server-owned inside the
 * RPC itself (contract §1). Returns a safe, generic error string on any failure; the raw Postgres
 * error text is never surfaced to a caller.
 *
 * The "already_member" conflict deliberately carries NO organization id/status (migration review
 * fix #7): the RPC itself never picks a specific organization for a multi-org caller, so this
 * wrapper has none to report either. A caller that reaches this conflict should route to the
 * existing acting-organization resolver (`lib/auth/dal.ts` / `lib/auth/eligibility.ts`), never
 * assume "the" organization from this result.
 */
export async function startOrganizationOnboarding(
  input: StartOrganizationOnboardingInput
): Promise<StartOrganizationOnboardingResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_organization_onboarding", {
    p_legal_name: input.legalName,
    p_display_name: input.displayName ?? null,
    p_account_type: input.accountType,
    p_country_code: input.countryCode ?? null,
    p_tax_number: input.taxNumber ?? null,
    p_registration_number: input.registrationNumber ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
  });

  if (error || !data) {
    return { ok: false, error: "We could not start your company onboarding. Please try again." };
  }

  const result = data as { ok: boolean; conflict?: string; organization_id?: string; organization_status?: string };

  if (result.ok === false && result.conflict === "already_member") {
    return { ok: true, created: false, conflict: "already_member" };
  }

  return {
    ok: true,
    created: true,
    organizationId: result.organization_id as string,
    organizationStatus: result.organization_status as string,
  };
}

export type KybMutationResult = { ok: true; applicationId?: string } | { ok: false; error: string };

/** Calls `create_kyb_draft` — idempotent per organization (contract §2). */
export async function createKybDraft(organizationId: string): Promise<KybMutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_kyb_draft", {
    p_organization_id: organizationId,
  });

  if (error || !data) {
    return { ok: false, error: "We could not open a KYB application for this organization." };
  }

  return { ok: true, applicationId: data as string };
}

/**
 * Calls `submit_kyb_application` — allowed only from `DRAFT` (contract §2). This function performs
 * NO evidence-completeness check of its own; that is Phase 4's `lib/kyb/completeness.ts`
 * responsibility and must run before this is called.
 */
export async function submitKybApplication(applicationId: string): Promise<KybMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_kyb_application", {
    p_application_id: applicationId,
  });

  if (error) {
    return { ok: false, error: "We could not submit this application." };
  }

  return { ok: true };
}

/** Calls `resubmit_kyb_application` — allowed only from `RESUBMISSION_REQUIRED` (contract §2). */
export async function resubmitKybApplication(applicationId: string): Promise<KybMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_kyb_application", {
    p_application_id: applicationId,
  });

  if (error) {
    return { ok: false, error: "We could not resubmit this application." };
  }

  return { ok: true };
}

/**
 * Calls `update_kyb_draft` (RUN B, T016 — `supabase/migrations/20260912010000_feature_003_kyb_draft_fields.sql`).
 * UPDATE-only against an application the caller already owns and that is in an editable state
 * (`DRAFT`/`RESUBMISSION_REQUIRED`, enforced server-side). Writes ONLY `registered_address` and
 * `business_activity` — never a status, decision, or membership field.
 */
export async function updateKybDraft(input: {
  applicationId: string;
  registeredAddress: string;
  businessActivity: string;
}): Promise<KybMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_kyb_draft", {
    p_application_id: input.applicationId,
    p_registered_address: input.registeredAddress,
    p_business_activity: input.businessActivity,
  });

  if (error) {
    return { ok: false, error: "We could not save your business details." };
  }

  return { ok: true };
}
