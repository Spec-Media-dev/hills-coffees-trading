import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 003 RUN A UX refinement verification (post-implementation correction pass, 2026-09-11).
 * Static/contract tests — live rendering/RTL/dark-mode/keyboard behavior for these same surfaces
 * was verified separately via a real browser this run (see the handoff addendum).
 */
const SIGN_IN_PAGE = readFileSync("src/app/(auth)/sign-in/page.tsx", "utf8");
const SIGN_UP_PAGE = readFileSync("src/app/(auth)/sign-up/page.tsx", "utf8");
const SIGN_IN_FORM = readFileSync("components/account/sign-in-form.tsx", "utf8");
const SIGN_UP_FORM = readFileSync("components/account/sign-up-form.tsx", "utf8");
const RESET_CONFIRM_FORM = readFileSync("components/account/reset-password-confirm-form.tsx", "utf8");
const PASSWORD_INPUT = readFileSync("components/ui/password-input.tsx", "utf8");
const SIGN_UP_ACTIONS = readFileSync("src/app/(auth)/sign-up/actions.ts", "utf8");
const SIGN_UP_VALIDATION = readFileSync("lib/validation/sign-up.ts", "utf8");

describe("Sign-In <-> Sign-Up reciprocal navigation", () => {
  it("Sign-In page contains a Create Account link, not only relying on the header", () => {
    expect(SIGN_IN_PAGE).toMatch(/href="\/sign-up\/"/);
    expect(SIGN_IN_PAGE).toMatch(/c\.auth\.signIn\.noAccount/);
    expect(SIGN_IN_PAGE).toMatch(/c\.auth\.signIn\.createAccount/);
  });

  it("Sign-Up page still contains a Sign-In link", () => {
    expect(SIGN_UP_PAGE).toMatch(/href="\/sign-in\/"/);
    expect(SIGN_UP_PAGE).toMatch(/c\.auth\.signUp\.haveAccount/);
  });

  it("Sign-In retains Forgot password, submit button, and the auth layout's Back to Hills Coffee link untouched", () => {
    expect(SIGN_IN_FORM).toMatch(/forgotPassword/);
    expect(SIGN_IN_FORM).toMatch(/type="submit"/);
    const authLayout = readFileSync("src/app/(auth)/layout.tsx", "utf8");
    expect(authLayout).toMatch(/backToSite/);
  });

  it("both reciprocal links use the same footer placement/style (visual symmetry)", () => {
    const signInFooter = SIGN_IN_PAGE.slice(SIGN_IN_PAGE.indexOf("noAccount") - 200, SIGN_IN_PAGE.indexOf("noAccount") + 200);
    const signUpFooter = SIGN_UP_PAGE.slice(SIGN_UP_PAGE.indexOf("haveAccount") - 200, SIGN_UP_PAGE.indexOf("haveAccount") + 200);
    expect(signInFooter).toMatch(/text-center text-\[length:var\(--text-small\)\] text-muted-foreground/);
    expect(signUpFooter).toMatch(/text-center text-\[length:var\(--text-small\)\] text-muted-foreground/);
  });
});

describe("Password visibility controls", () => {
  it("PasswordInput exists as a single reusable component (not duplicated per form)", () => {
    expect(PASSWORD_INPUT).toMatch(/export \{ PasswordInput \}/);
  });

  it("the toggle button is type=\"button\" — it cannot submit the form", () => {
    expect(PASSWORD_INPUT).toMatch(/type="button"/);
  });

  it("toggling swaps type=password <-> type=text and the eye/eye-off icon", () => {
    expect(PASSWORD_INPUT).toMatch(/type=\{visible \? "text" : "password"\}/);
    expect(PASSWORD_INPUT).toMatch(/name=\{visible \? "eye-off" : "eye"\}/);
  });

  it("aria-label changes correctly between the two localized labels, never a hardcoded string", () => {
    expect(PASSWORD_INPUT).toMatch(/aria-label=\{visible \? hideLabel : showLabel\}/);
  });

  it("visibility state is local client state only — never sent to the server", () => {
    expect(PASSWORD_INPUT).toMatch(/useState/);
    expect(PASSWORD_INPUT).not.toMatch(/fetch\(|dispatch\(|formData/);
  });

  it("positioned with logical (RTL-safe) properties, never hardcoded left/right", () => {
    expect(PASSWORD_INPUT).toMatch(/\bend-1\b/);
    expect(PASSWORD_INPUT).not.toMatch(/\bleft-\d|\bright-\d/);
  });

  it("Sign-In's password field uses PasswordInput", () => {
    expect(SIGN_IN_FORM).toMatch(/<PasswordInput/);
  });

  it("Sign-Up's password AND confirm-password fields both use PasswordInput", () => {
    const matches = SIGN_UP_FORM.match(/<PasswordInput/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("the existing reset-password confirm form (new password + confirm) also uses PasswordInput", () => {
    const matches = RESET_CONFIRM_FORM.match(/<PasswordInput/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("autoComplete is preserved per field (current-password vs new-password) so password managers keep working", () => {
    expect(SIGN_IN_FORM).toMatch(/autoComplete="current-password"/);
    expect(SIGN_UP_FORM).toMatch(/autoComplete="new-password"/);
    expect(RESET_CONFIRM_FORM).toMatch(/autoComplete="new-password"/);
  });
});

describe("Sign-Up Full Name", () => {
  it("the schema requires a trimmed, length-limited full name", () => {
    expect(SIGN_UP_VALIDATION).toMatch(/fullName: z\s*\n\s*\.string/);
    expect(SIGN_UP_VALIDATION).toMatch(/\.trim\(\)/);
    expect(SIGN_UP_VALIDATION).toMatch(/\.max\(120/);
  });

  it("the form submits fullName and renders it as a field", () => {
    expect(SIGN_UP_FORM).toMatch(/formData\.set\("fullName"/);
    expect(SIGN_UP_FORM).toMatch(/register\("fullName"\)/);
  });

  it("is passed ONLY through signUp's own options.data — never a direct profiles table write", () => {
    expect(SIGN_UP_ACTIONS).toMatch(/options:\s*\{\s*\n\s*data:\s*\{\s*full_name:/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']profiles["']\)/);
  });

  it("the documented full-name-persistence mechanism is present and accurate (RUN B: the profile-bootstrap trigger, not update_my_profile, is now primary)", () => {
    // Superseded by RUN B PART 0 (`supabase/migrations/20260912000000_feature_003_profile_bootstrap.sql`):
    // a fresh signup no longer depends on an UPDATE against a not-yet-existing row — the
    // `on_auth_user_created` trigger creates the `profiles` row itself, from the same `full_name`
    // metadata this action sets. The old wording asserted here described the PRE-bootstrap gap;
    // this test now asserts the accurate post-bootstrap mechanism instead.
    expect(SIGN_UP_ACTIONS).toMatch(/on_auth_user_created/);
    expect(SIGN_UP_ACTIONS).toMatch(/20260912000000_feature_003_profile_bootstrap\.sql/);
    expect(SIGN_UP_ACTIONS).toMatch(/update_my_profile/);
  });
});

describe("Sign-Up page polish", () => {
  it("shows a real supporting sequence note, not a fake percentage", () => {
    expect(SIGN_UP_PAGE).toMatch(/afterSignUpNote/);
    expect(SIGN_UP_PAGE).not.toMatch(/%|percent complete/i);
  });
});

describe("No organization/capability creation at Sign-Up (regression, still holds after refinement)", () => {
  it("Sign-Up still never creates an organization, membership, or capability", () => {
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']organizations["']\)/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']organization_members["']\)/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/can_buy|can_sell/);
  });
});

describe("PENDING_KYB business-module denial (regression, still holds after refinement)", () => {
  it("dashboard/layout.tsx and dashboard/page.tsx still deny an organization that is not yet authorized", () => {
    const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
    const page = readFileSync("src/app/dashboard/page.tsx", "utf8");
    expect(layout).toMatch(/if \(!identity\.isAuthorizedMember\)/);
    expect(page).toMatch(/!identity\.isAuthorizedMember/);
  });
});
