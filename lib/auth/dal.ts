import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  OperationalRole,
  OrganizationMembership,
  RequestIdentity,
} from "@/lib/auth/types";

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

async function resolveOrganization(
  supabase: SupabaseServerClient,
  userId: string
): Promise<OrganizationMembership | null> {
  // Read the caller's own ACTIVE membership rows. RLS (`members_own_org`) already scopes this to
  // rows the caller may see; `is_active` mirrors the same condition `is_org_member()` enforces.
  //
  // A user may belong to more than one organization. Selecting the ACTING organization for a
  // multi-membership user is explicitly 003-auth-membership-kyb's scope; this foundation resolves
  // the earliest active membership deterministically so behaviour is stable and testable.
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, member_role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (membershipError || !memberships || memberships.length === 0) return null;

  const membership = memberships[0];
  const organizationId: string = membership.organization_id;

  // Defence in depth: re-verify membership through the database's own SECURITY DEFINER function
  // rather than trusting the row read alone.
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

  return {
    organizationId,
    displayName: organizationRow.data.display_name ?? "",
    memberRole: membership.member_role ?? "",
    canBuy,
    canSell,
  };
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

  const [profileRow, organization, operationalRoles] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", user.id)
      .maybeSingle(),
    resolveOrganization(supabase, user.id),
    resolveOperationalRoles(supabase),
  ]);

  return {
    kind: "authenticated",
    userId: user.id,
    profile: {
      fullName: profileRow.data?.full_name ?? null,
      companyName: profileRow.data?.company_name ?? null,
    },
    organization,
    operationalRoles,
  };
});
