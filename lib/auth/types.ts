/**
 * Application-level identity/authorization shapes (data-model.md).
 *
 * These are a typed mirror of a subset of the approved database — they introduce no new tables and
 * no new authorization rules. Every value here is resolved fresh, per request, from the approved
 * SECURITY DEFINER functions and RLS-scoped reads (research.md §3). Nothing here is ever persisted
 * beyond the request or cached across requests.
 */

/**
 * Operational roles attested by the approved database's own role functions.
 *
 * These are capability attestations, not a single "role column" value: the database's functions are
 * hierarchical (`is_platform_admin()` is true for both ADMIN and SUPER_ADMIN rows;
 * `is_compliance_operator()` is true for COMPLIANCE, ADMIN and SUPER_ADMIN). The application
 * surfaces every role the database attests to rather than picking one (data-model.md).
 */
export type OperationalRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "COMPLIANCE"
  | "WAREHOUSE"
  | "FINANCE"
  | "AUDITOR";

/**
 * A subset of `organizations` + `organization_members`.
 *
 * `canBuy`/`canSell` come from `organization_can_buy(id)` / `organization_can_sell(id)` — never from
 * reading the `can_buy`/`can_sell` columns directly — so the "ACTIVE status AND approved KYB (or
 * Hills-internal)" rule those functions already encode is never re-implemented in application code.
 */
export type OrganizationMembership = {
  organizationId: string;
  displayName: string;
  /** `organization_members.member_role` — raw, DB-owned vocabulary (OWNER | MEMBER). */
  memberRole: string;
  /** `organization_can_buy(organizationId)` */
  canBuy: boolean;
  /** `organization_can_sell(organizationId)` — additive on top of `canBuy`. */
  canSell: boolean;
};

/** DTO-limited projection of the caller's own `profiles` row. */
export type RequestProfile = {
  fullName: string | null;
  companyName: string | null;
};

/**
 * Resolved once per request by `lib/auth/dal.ts#getRequestIdentity()`.
 *
 * `organization` and `operationalRoles` are independent: an operator with only a `platform_admins`
 * row and no `organization_members` row has `organization: null` and a non-empty
 * `operationalRoles`, and vice versa. Admin access never implies member access, and member access
 * never implies admin access (spec FR-004, Edge Cases).
 *
 * **Multi-organization acting context (003, T002)**: `organizations` lists EVERY active membership;
 * `organization` is the resolved ACTING one. With exactly one membership it resolves implicitly.
 * With more than one, `organization` is `null` and `requiresOrganizationSelection` is `true` until
 * the user explicitly chooses via `lib/auth/eligibility.ts#setActingOrganization` — never the first
 * row by array/database order. A selection is honoured only after being re-verified against this
 * same request's fresh `organizations` list (never a raw client-supplied id trusted directly).
 */
export type RequestIdentity =
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      /** `auth.uid()` */
      userId: string;
      profile: RequestProfile;
      /** Every organization this user actively belongs to. `[]` is a valid, expected state. */
      organizations: OrganizationMembership[];
      /**
       * The unambiguous acting organization for this request, or `null` when the user has none, or
       * has more than one and has not yet made an explicit, membership-verified selection.
       */
      organization: OrganizationMembership | null;
      /** `true` exactly when `organizations.length > 1` and no valid selection is in effect yet. */
      requiresOrganizationSelection: boolean;
      /**
       * `is_authorized_member()` — whole-user, any-organization trading access (signed in, not
       * blocked, and at least one active membership where `organization_can_buy` is true). Distinct
       * from the ACTING organization's own `canBuy`/`canSell`, which apply only to that org.
       */
      isAuthorizedMember: boolean;
      /** `auth.users.email_confirmed_at !== null` — from the SAME verified `getUser()` call (003 T007). */
      isEmailVerified: boolean;
      /** `[]` when the user has no `platform_admins` row. */
      operationalRoles: OperationalRole[];
      /**
       * Feature 003 Phase 6 (T025) — has the ACTING organization accepted every entry in
       * `lib/auth/agreements.ts`'s `CURRENT_AGREEMENTS` registry, at its current version, for this
       * user? Resolved fresh every request from `agreement_acceptances` (`lib/agreements/
       * acceptance-status.ts`) — never cached, so a registry version bump re-gates the very next
       * request with no re-login required. `true` (vacuously) when there is no acting organization
       * yet — agreements are meaningless without one, and the earlier `organization`/
       * `requiresOrganizationSelection` gates already handle that case before this field is ever
       * consulted (`lib/auth/eligibility.ts#getEligibility`).
       */
      hasAcceptedCurrentAgreements: boolean;
    };
