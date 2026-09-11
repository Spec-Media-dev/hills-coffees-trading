import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTING_ORGANIZATION_COOKIE, getRequestIdentity } from "@/lib/auth/dal";
import type { RequestIdentity } from "@/lib/auth/types";

// NOTE: this file is deliberately NOT a file-level `"use server"` module — a `"use server"` file may
// export ONLY async functions, and `getEligibility` (a plain synchronous pure function) plus the
// `BlockingReason`/`NextAction`/`Eligibility` type exports below would violate that at request time
// (a defect this exact project hit and fixed in Feature 002 T021 — see that handoff entry). Instead,
// `setActingOrganization`/`clearActingOrganization` each carry their OWN per-function `"use server";`
// directive as the first line of their body, which Next.js treats as an individually-registered
// Server Action without requiring every other export in the module to be async.

/**
 * Eligibility layer (Feature 003, T001/T002 — `contracts` per spec FR-005/FR-006, SC-001).
 *
 * THE SINGLE presentation-translation point from 001's `RequestIdentity` into the answers every
 * later gate/screen asks for. This module NEVER re-derives "organization ACTIVE + KYB APPROVED":
 * `canBuy`/`canSell` are read verbatim from `identity.organization` (itself sourced from
 * `organization_can_buy`/`organization_can_sell` — never a raw `can_buy`/`can_sell` column read),
 * and `canReachTrading` is read verbatim from `identity.isAuthorizedMember`
 * (`is_authorized_member()`). If a value needed here does not already exist on `RequestIdentity`, the
 * fix is to resolve it in `lib/auth/dal.ts` from an approved DB function — never to compute it here.
 *
 * FRESHNESS (spec FR-017, PS6): `getEligibility` is a pure function over an ALREADY-RESOLVED
 * `RequestIdentity` for THIS request. It caches nothing itself, and callers must call
 * `getRequestIdentity()` fresh on every request that needs an authorization decision — a Header's
 * presentation state is not a substitute for a protected Server Action re-resolving eligibility
 * itself (spec SEC-004).
 */

export type BlockingReason =
  | "anonymous"
  | "mfa-step-up-required"
  | "unattached"
  | "organization-selection-required"
  | "not-authorized"
  | "agreements-required"
  | null;

export type NextAction =
  | "sign-in"
  | "step-up-mfa"
  | "choose-organization"
  | "await-onboarding"
  | "await-authorization"
  | "accept-agreements"
  | "none";

export type Eligibility = {
  /** Whole-user, any-organization trading access (`is_authorized_member()`). */
  canReachTrading: boolean;
  /** The ACTING organization's own `organization_can_buy()` result, or `false` with none resolved. */
  canBuy: boolean;
  /** The ACTING organization's own `organization_can_sell()` result, or `false` with none resolved. */
  canSell: boolean;
  blockingReason: BlockingReason;
  nextAction: NextAction;
};

/** Translates a resolved identity into presentation-level eligibility. Pure — no I/O, no caching. */
export function getEligibility(identity: RequestIdentity): Eligibility {
  if (identity.kind !== "authenticated") {
    return {
      canReachTrading: false,
      canBuy: false,
      canSell: false,
      blockingReason: "anonymous",
      nextAction: "sign-in",
    };
  }

  const canBuy = identity.organization?.canBuy ?? false;
  const canSell = identity.organization?.canSell ?? false;
  const canReachTrading = identity.isAuthorizedMember;

  // T033 remediation — checked BEFORE any organization/authorization branch below: a session that
  // must step up is denied uniformly, regardless of how otherwise-eligible the underlying
  // organization is. This is a session-assurance gate, not a KYB/org authorization outcome — it
  // never implies or substitutes for one (canReachTrading/canBuy/canSell below still reflect the
  // real, independent DB truth, not something this branch invents).
  if (identity.requiresMfaStepUp) {
    return {
      canReachTrading,
      canBuy,
      canSell,
      blockingReason: "mfa-step-up-required",
      nextAction: "step-up-mfa",
    };
  }

  if (identity.requiresOrganizationSelection) {
    return {
      canReachTrading,
      canBuy,
      canSell,
      blockingReason: "organization-selection-required",
      nextAction: "choose-organization",
    };
  }

  if (identity.organization === null) {
    return {
      canReachTrading,
      canBuy,
      canSell,
      blockingReason: "unattached",
      nextAction: "await-onboarding",
    };
  }

  if (!canReachTrading) {
    return {
      canReachTrading,
      canBuy,
      canSell,
      blockingReason: "not-authorized",
      nextAction: "await-authorization",
    };
  }

  // Feature 003 T025 — checked ONLY after KYB/organization eligibility already passed
  // (`canReachTrading` true). Agreement acceptance is an ADDITIONAL condition on top of the
  // approved authorization truth, never a substitute for it: a PENDING_KYB/SUBMITTED/UNDER_REVIEW/
  // REJECTED/SUSPENDED organization is denied above by `not-authorized` and never reaches this
  // branch, so agreements are never presented as if accepting them could unlock trading on their
  // own (run directive "UNAPPROVED USERS").
  if (!identity.hasAcceptedCurrentAgreements) {
    return {
      canReachTrading,
      canBuy,
      canSell,
      blockingReason: "agreements-required",
      nextAction: "accept-agreements",
    };
  }

  return { canReachTrading, canBuy, canSell, blockingReason: null, nextAction: "none" };
}

/**
 * Sets the caller's acting-organization preference (T002). SECURITY: the requested id is verified
 * against THIS request's own fresh `organizations` list before anything is written — a raw
 * client-supplied id is never trusted directly, and choosing an organization the caller does not
 * actually (and currently) belong to is refused rather than silently accepted.
 *
 * The cookie this writes is a preference pointer, not authorization truth: every later request
 * re-resolves and re-verifies it against fresh membership rows (`lib/auth/dal.ts`), so a forged or
 * stale value can at worst fail to resolve an acting organization, never grant one.
 */
export async function setActingOrganization(organizationId: string, redirectTo: string): Promise<never> {
  "use server";

  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") {
    redirect(redirectTo);
  }

  const isActualMember = identity.organizations.some(
    (organization) => organization.organizationId === organizationId
  );

  const cookieStore = await cookies();
  if (isActualMember) {
    cookieStore.set(ACTING_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  // A non-member id is silently refused (no cookie written) rather than surfaced as a distinct
  // error: it can only occur from a tampered form value, and the resulting re-render still shows
  // the honest "choose your organization" state, which is the correct outcome either way.

  redirect(redirectTo);
}

/** Clears any acting-organization selection (used on sign-out; see `(auth)/sign-out/actions.ts`). */
export async function clearActingOrganization(): Promise<void> {
  "use server";

  const cookieStore = await cookies();
  cookieStore.delete(ACTING_ORGANIZATION_COOKIE);
}
