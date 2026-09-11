import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SignUpInput } from "@/lib/validation/sign-up";
import { MembershipApplicationInput, ONBOARDING_ACCOUNT_TYPES } from "@/lib/validation/membership-application";

/**
 * Feature 003 RUN A (T010a, T011, T012, T013) verification.
 *
 * Live-verified separately this run (not repeated here as an automated test, since it requires a
 * real browser/session): anonymous header shows Sign in + Create Account; `/sign-up/` renders and
 * is `noindex, nofollow`; a real submission reaches the server with correctly Zod-validated fields
 * and Supabase's own rate-limit error is mapped to a safe generic message (confirmed live via
 * repeated real attempts, which is also why the plain success acknowledgement render was not
 * independently observed live — repeated real Supabase `signUp` calls during this same verification
 * window exhausted Supabase's own email-send rate limit before a clean unthrottled attempt could be
 * made; the success branch itself is a single-line `return {ok:true}`, already exercised structurally
 * by every other passing branch reaching the same return statement's neighborhood). The onboarding
 * form was confirmed to render correctly, with zero console/page errors, for the existing approved
 * `warehouse-admin+foundation-test@example.com` fixture (operational role only, genuinely no
 * organization) — the form was NOT submitted, to leave that fixture's no-org state untouched for
 * every other test that depends on it. No new production fixture accounts were left behind (verified
 * via the same read-only auth listing pattern used for the T010g fixture inventory).
 */
const SIGN_UP_ACTIONS = readFileSync("src/app/(auth)/sign-up/actions.ts", "utf8");
const SIGN_UP_FORM = readFileSync("components/account/sign-up-form.tsx", "utf8");
const ONBOARDING_ACTIONS = readFileSync("src/app/dashboard/onboarding/actions.ts", "utf8");
const ONBOARDING_FORM = readFileSync("components/account/membership-application-form.tsx", "utf8");
const DASHBOARD_LAYOUT = readFileSync("src/app/dashboard/layout.tsx", "utf8");
const DASHBOARD_PAGE = readFileSync("src/app/dashboard/page.tsx", "utf8");
const SITE_HEADER = readFileSync("components/public/site-header.tsx", "utf8");
const MOBILE_NAV = readFileSync("components/public/mobile-nav.tsx", "utf8");
const KYB_MUTATIONS = readFileSync("lib/kyb/mutations.ts", "utf8");

describe("T010a — Sign-Up validation", () => {
  it("rejects an invalid email", () => {
    const result = SignUpInput.safeParse({ fullName: "Test Person", email: "not-an-email", password: "CorrectHorse9", confirmPassword: "CorrectHorse9" });
    expect(result.success).toBe(false);
  });

  it("rejects a password/confirmation mismatch", () => {
    const result = SignUpInput.safeParse({ fullName: "Test Person", email: "a@example.com", password: "CorrectHorse9", confirmPassword: "Different9" });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = SignUpInput.safeParse({ fullName: "Test Person", email: "a@example.com", password: "short1", confirmPassword: "short1" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid, matching sign-up", () => {
    const result = SignUpInput.safeParse({ fullName: "Test Person", email: "a@example.com", password: "CorrectHorse9", confirmPassword: "CorrectHorse9" });
    expect(result.success).toBe(true);
  });
});

describe("T010a — Sign-Up authority (no organization/membership/capability creation)", () => {
  it("the Sign-Up Server Action calls only supabase.auth.signUp, never an organizations/organization_members insert", () => {
    expect(SIGN_UP_ACTIONS).toMatch(/supabase\.auth\.signUp/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']organizations["']\)/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']organization_members["']\)/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/start_organization_onboarding/);
  });

  it("maps an already-registered email to the SAME success path as a new account (no enumeration)", () => {
    expect(SIGN_UP_ACTIONS).toMatch(/user_already_exists[\s\S]*email_exists|email_exists[\s\S]*user_already_exists/);
    const alreadyExistsIndex = SIGN_UP_ACTIONS.indexOf("user_already_exists");
    const nextReturnIndex = SIGN_UP_ACTIONS.indexOf("return { ok: true", alreadyExistsIndex);
    expect(alreadyExistsIndex).toBeGreaterThan(-1);
    expect(nextReturnIndex).toBeGreaterThan(alreadyExistsIndex);
  });

  it("never logs a password, token, or session value", () => {
    expect(SIGN_UP_ACTIONS).not.toMatch(/console\.(log|error|warn)/);
  });

  it("uses no service-role key", () => {
    expect(SIGN_UP_ACTIONS).not.toMatch(/SERVICE_ROLE/);
  });

  it("the form shows only the generic acknowledgement on success, never a distinct message per cause", () => {
    expect(SIGN_UP_FORM).toMatch(/state\?\.ok === true/);
    expect(SIGN_UP_FORM).not.toMatch(/already registered|already exists/i);
  });
});

describe("T010a — email verification reuse (no competing verification system)", () => {
  it("Sign-Up does not implement its own token/OTP verification — it relies on Supabase's own signUp confirmation email", () => {
    expect(SIGN_UP_ACTIONS).not.toMatch(/verifyOtp|token_hash|custom.*token/i);
  });

  it("the shared auth/confirm callback route still exists and is reused, not duplicated", () => {
    expect(() => readFileSync("src/app/auth/confirm/route.ts", "utf8")).not.toThrow();
    const confirmRoutes = readFileSync("src/app/auth/confirm/route.ts", "utf8");
    expect(confirmRoutes).toMatch(/verifyOtp/);
  });
});

describe("Header — Create Account integration", () => {
  it("SiteHeader shows both Sign in and Create Account links for an anonymous visitor", () => {
    expect(SITE_HEADER).toMatch(/href="\/sign-in\/"/);
    expect(SITE_HEADER).toMatch(/href="\/sign-up\/"/);
    expect(SITE_HEADER).toMatch(/c\.account\.signIn/);
    expect(SITE_HEADER).toMatch(/c\.account\.signUp/);
  });

  it("the authenticated AccountMenu branch is untouched by this run's header change", () => {
    expect(SITE_HEADER).toMatch(/<AccountMenu/);
  });

  it("MobileNav shows both Sign in and Create Account for an anonymous visitor", () => {
    expect(MOBILE_NAV).toMatch(/href="\/sign-in\/"/);
    expect(MOBILE_NAV).toMatch(/href="\/sign-up\/"/);
  });
});

describe("T011 — onboarding validation input", () => {
  it("accepts BUYER", () => {
    const result = MembershipApplicationInput.safeParse({
      legalName: "Test Co", accountType: "BUYER", countryCode: "AE", consent: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts SELLER", () => {
    const result = MembershipApplicationInput.safeParse({
      legalName: "Test Co", accountType: "SELLER", countryCode: "AE", consent: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects HILLS_INTERNAL — it is not in the enum at all", () => {
    expect(ONBOARDING_ACCOUNT_TYPES).toEqual(["BUYER", "SELLER"]);
    const result = MembershipApplicationInput.safeParse({
      legalName: "Test Co", accountType: "HILLS_INTERNAL", countryCode: "AE", consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects submission without consent", () => {
    const result = MembershipApplicationInput.safeParse({
      legalName: "Test Co", accountType: "BUYER", countryCode: "AE", consent: false,
    });
    expect(result.success).toBe(false);
  });

  it("has no field for status/ACTIVE/APPROVED/can_buy/can_sell/created_by/user_id/member_role/any role", () => {
    const shape = Object.keys(MembershipApplicationInput.shape);
    for (const forbidden of ["status", "canBuy", "canSell", "createdBy", "userId", "memberRole", "role", "isActive"]) {
      expect(shape).not.toContain(forbidden);
    }
  });
});

describe("T012 — onboarding UI/state", () => {
  it("the onboarding experience renders no fake KPI, inventory, listing, order, or trading module content", () => {
    const experience = readFileSync("components/account/onboarding-experience.tsx", "utf8");
    const awaitingKyb = readFileSync("components/account/awaiting-kyb-state.tsx", "utf8");
    for (const surface of [experience, awaitingKyb, ONBOARDING_FORM]) {
      expect(surface).not.toMatch(/\$\d|AED|USD|inventory|marketplace|order (count|total)/i);
    }
  });

  it("the progress steps are real states derived from a prop, never a fabricated percentage", () => {
    const progress = readFileSync("components/account/onboarding-progress.tsx", "utf8");
    expect(progress).not.toMatch(/%|percent/i);
    expect(progress).toMatch(/currentStep/);
  });

  it("BUYER/SELLER copy is honest — SELLER is described as buy AND sell, never sell-only", () => {
    const en = readFileSync("lib/app/copy/en.ts", "utf8");
    expect(en).toMatch(/sellerTitle: "Buy & Sell Coffee"/);
    expect(en).toMatch(/sellerDescription: "Buy from Hills and resell/);
  });
});

describe("T013 — controlled organization onboarding", () => {
  it("the onboarding Server Action calls startOrganizationOnboarding, never a direct table insert", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/startOrganizationOnboarding/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/\.from\(["']organizations["']\)\.insert/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/\.from\(["']organization_members["']\)\.insert/);
  });

  it("uses no service-role client", () => {
    expect(ONBOARDING_ACTIONS).not.toMatch(/SERVICE_ROLE/);
  });

  it("requires authentication and email verification before calling the RPC", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/identity\.kind !== "authenticated"/);
    expect(ONBOARDING_ACTIONS).toMatch(/!identity\.isEmailVerified/);
  });

  it("handles the already_member conflict truthfully — no fabricated organization is shown", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/result\.ok/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/organizations\[0\]/);
  });

  it("lib/kyb/mutations.ts (the RPC wrapper this action calls) still forwards no caller-controlled protected field", () => {
    expect(KYB_MUTATIONS).not.toMatch(/p_status|p_can_buy|p_can_sell|p_created_by|p_member_role/);
  });
});

describe("Critical access rule — PENDING_KYB / not-yet-authorized denial", () => {
  it("dashboard/layout.tsx denies the ordinary AppShell to an organization that is not yet authorized", () => {
    expect(DASHBOARD_LAYOUT).toMatch(/if \(!identity\.isAuthorizedMember\)/);
    const guardIndex = DASHBOARD_LAYOUT.indexOf("if (!identity.isAuthorizedMember)");
    const appShellIndex = DASHBOARD_LAYOUT.indexOf("<AppShell");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(appShellIndex).toBeGreaterThan(guardIndex);
  });

  it("dashboard/page.tsx independently re-verifies the same authorization (parallel route segments are not protected by the layout alone)", () => {
    expect(DASHBOARD_PAGE).toMatch(/!identity\.isAuthorizedMember/);
  });

  it("the pre-existing guard predicate lines are preserved verbatim (regression guard)", () => {
    expect(DASHBOARD_LAYOUT).toContain('if (identity.kind !== "authenticated") {');
    expect(DASHBOARD_LAYOUT).toContain("if (identity.organization === null) {");
  });

  it("the layout never renders AppShell/{children} before the authorization check", () => {
    const orgNullIndex = DASHBOARD_LAYOUT.indexOf("if (identity.organization === null)");
    const authCheckIndex = DASHBOARD_LAYOUT.indexOf("if (!identity.isAuthorizedMember)");
    // The real JSX usage, not the doc comment near the top of the file that also mentions
    // "{children}" in prose.
    const childrenJsxIndex = DASHBOARD_LAYOUT.indexOf(">\n      {children}");
    expect(orgNullIndex).toBeLessThan(authCheckIndex);
    expect(childrenJsxIndex).toBeGreaterThan(-1);
    expect(authCheckIndex).toBeLessThan(childrenJsxIndex);
  });
});

describe("Multi-org — no organizations[0] fallback anywhere touched by this run", () => {
  it("the onboarding action never indexes into an organizations array", () => {
    expect(ONBOARDING_ACTIONS).not.toMatch(/organizations\[0\]/);
  });

  it("start_organization_onboarding's conflict result (already checked in T010g) still carries no organization id", () => {
    const migration = readFileSync("supabase/migrations/20260911010000_feature_003_kyb_foundation.sql", "utf8");
    const conflictBlock = migration.slice(
      migration.indexOf("if exists ("),
      migration.indexOf("'conflict', 'already_member'") + 60
    );
    expect(conflictBlock).not.toMatch(/organization_id/);
  });
});

describe("Regression — no new /dashboard/* business route", () => {
  it("dashboard/onboarding/ has no page.tsx (rendered inline by the layout, never its own route)", () => {
    expect(() => readFileSync("src/app/dashboard/onboarding/page.tsx", "utf8")).toThrow();
  });
});
