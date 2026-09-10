import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type {
  OperationalRole,
  OrganizationMembership,
  RequestIdentity,
} from "@/lib/auth/types";

/**
 * Cookie holding the caller's chosen acting-organization id (003, T002). This is a PREFERENCE
 * pointer only, never authorization truth by itself: every read below re-verifies the pointed-at id
 * against this same request's own fresh, RLS-scoped membership rows before trusting it, so a forged
 * or stale cookie value can, at worst, fail to resolve an acting organization — never grant one the
 * caller does not actually belong to. Set only by `lib/auth/eligibility.ts#setActingOrganization`.
 */
export const ACTING_ORGANIZATION_COOKIE = "hills-acting-org";

/**
 * Data Access Layer — the platform's single per-request authorization resolver.
 *
 * SECURITY CONTRACT (Constitution Principle VIII, NON-NEGOTIABLE; research.md §1 and §3):
 *
 * 1. Identity comes from `supabase.auth.getUser()`, which verifies the JWT against the Supabase Auth
 *    server. `getSession()` is NEVER used as authorization truth — it only decodes the local cookie
 *    without server verification, which is exactly the stale/forgeable claim this contract forbids.
 * 2. Capabilities and operational roles come from the approved SECURITY DEFINER functions in the
 *    audited database baseline. The application never re-derives "ACTIVE + approved KYB", never
 *    reads `can_buy`/`can_sell` columns directly, and never maintains a parallel rule set.
 * 3. `cache()` is React's PER-REQUEST memoization only. It de-duplicates calls within a single
 *    render pass; it does NOT persist across requests. A suspended organization or a revoked
 *    `can_sell` is therefore reflected on the very next request, with no invalidation mechanism to
 *    maintain and no session-attached capability snapshot to go stale.
 * 4. Every read runs through the request-scoped, RLS-respecting server client (lib/supabase/server).
 *    The service-role key is never used here — none of this resolution requires it. That client
 *    imports `next/headers`, so this module is structurally server-only: any attempt to pull it into
 *    a Client Component fails at build time.
 * 5. Every failure path fails CLOSED: an error resolving a capability yields `false`, and an error
 *    resolving membership yields `organization: null`. A fault never widens access.
 *
 * This function is the root of every later feature's authorization. Changes here have platform-wide
 * blast radius — treat modifications as security changes.
 */

/** Maps each approved role function to the role it attests. Order is stable for readability. */
const ROLE_FUNCTIONS: ReadonlyArray<{ fn: string; role: OperationalRole }> = [
  { fn: "is_super_admin", role: "SUPER_ADMIN" },
  { fn: "is_platform_admin", role: "ADMIN" },
  { fn: "is_compliance_operator", role: "COMPLIANCE" },
  { fn: "is_warehouse_operator", role: "WAREHOUSE" },
  { fn: "is_finance_operator", role: "FINANCE" },
  { fn: "is_auditor", role: "AUDITOR" },
];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Calls a no-argument boolean RPC, failing closed (`false`) on any error.
 * Errors are deliberately not logged with their payload (FR-027: no sensitive data in logs).
 */
async function callBooleanRpc(
  supabase: SupabaseServerClient,
  fn: string,
  args?: Record<string, string>
): Promise<boolean> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return false;
  return data === true;
}

async function resolveOperationalRoles(
  supabase: SupabaseServerClient
): Promise<OperationalRole[]> {
  const results = await Promise.all(
    ROLE_FUNCTIONS.map(async ({ fn, role }) =>
      (await callBooleanRpc(supabase, fn)) ? role : null
    )
  );
  return results.filter((role): role is OperationalRole => role !== null);
}

/**
 * Every ACTIVE organization the caller belongs to (003, T002 — supersedes the earlier
 * single-membership foundation, which resolved only the earliest row by `created_at`). RLS
 * (`members_own_org`) already scopes the base read to rows the caller may see; `is_active` mirrors
 * the same condition `is_org_member()` enforces. Each membership is re-verified through the
 * database's own SECURITY DEFINER function rather than trusting the row read alone (defence in
 * depth) — a membership that fails that re-check is dropped, never silently kept.
 */
async function resolveOrganizations(
  supabase: SupabaseServerClient,
  userId: string
): Promise<OrganizationMembership[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, member_role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (membershipError || !memberships || memberships.length === 0) return [];

  const resolved = await Promise.all(
    memberships.map(async (membership) => {
      const organizationId: string = membership.organization_id;

      const isMember = await callBooleanRpc(supabase, "is_org_member", {
        p_organization_id: organizationId,
      });
      if (!isMember) return null;

      const [organizationRow, canBuy, canSell] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, display_name")
          .eq("id", organizationId)
          .maybeSingle(),
        callBooleanRpc(supabase, "organization_can_buy", {
          p_organization_id: organizationId,
        }),
        callBooleanRpc(supabase, "organization_can_sell", {
          p_organization_id: organizationId,
        }),
      ]);

      if (organizationRow.error || !organizationRow.data) return null;

      const result: OrganizationMembership = {
        organizationId,
        displayName: organizationRow.data.display_name ?? "",
        memberRole: membership.member_role ?? "",
        canBuy,
        canSell,
      };
      return result;
    })
  );

  return resolved.filter((membership): membership is OrganizationMembership => membership !== null);
}

/**
 * Resolves the ACTING organization from the caller's full membership list (003, T002).
 *
 * - Zero memberships → `{ organization: null, requiresSelection: false }` (genuinely unattached).
 * - Exactly one → that membership, implicitly — no selection needed or possible.
 * - More than one → the `ACTING_ORGANIZATION_COOKIE` value is honoured ONLY if it matches one of
 *   THIS request's own freshly-resolved `organizations` (never trusted as a bare id); otherwise
 *   `organization: null` and `requiresSelection: true` — the caller must choose explicitly. The
 *   first array element is never chosen as a fallback: an ambiguous acting context is a real
 *   authorization hazard (acting for the wrong organization), not a UX inconvenience to smooth over.
 */
async function resolveActingOrganization(
  organizations: OrganizationMembership[]
): Promise<{ organization: OrganizationMembership | null; requiresSelection: boolean }> {
  if (organizations.length === 0) return { organization: null, requiresSelection: false };
  if (organizations.length === 1) return { organization: organizations[0], requiresSelection: false };

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTING_ORGANIZATION_COOKIE)?.value;
  const matched = requestedId
    ? organizations.find((organization) => organization.organizationId === requestedId)
    : undefined;

  if (matched) return { organization: matched, requiresSelection: false };
  return { organization: null, requiresSelection: true };
}

/**
 * Resolves the current request's identity, membership and operational roles.
 *
 * Returns `{ kind: "anonymous" }` for any request without a server-verified user.
 */
export const getRequestIdentity = cache(async (): Promise<RequestIdentity> => {
  const supabase = await createClient();

  // Server-verified identity. NEVER getSession() — see the security contract above.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { kind: "anonymous" };

  const [profileRow, organizations, isAuthorizedMember, operationalRoles] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", user.id)
      .maybeSingle(),
    resolveOrganizations(supabase, user.id),
    callBooleanRpc(supabase, "is_authorized_member"),
    resolveOperationalRoles(supabase),
  ]);

  const { organization, requiresSelection } = await resolveActingOrganization(organizations);

  return {
    kind: "authenticated",
    userId: user.id,
    profile: {
      fullName: profileRow.data?.full_name ?? null,
      companyName: profileRow.data?.company_name ?? null,
    },
    organizations,
    organization,
    requiresOrganizationSelection: requiresSelection,
    isAuthorizedMember,
    isEmailVerified: user.email_confirmed_at != null,
    operationalRoles,
  };
});
