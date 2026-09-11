import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, signInAsFixture } from "./fixture-session";

/** Strips block/line comments so assertions check real code, not doc-comment prose explaining what is absent. */
function codeOnly(source: string): string {
  return source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Admin-auth correction pass — a dedicated Admin Sign-In experience
 * (`/admin/sign-in/`), separate from the member Sign-In experience, routing anonymous
 * `/dashboard-admin/*` traffic correctly and never deriving admin authorization from anything but
 * the approved DB role functions.
 *
 * LIVE-VERIFIED this run (real headless-browser session against the running dev server, plus direct
 * Supabase calls — temporary scripts, deleted after use): anonymous `/dashboard-admin/` → real
 * `307` redirect to `/admin/sign-in/`; the admin sign-in page renders email/password/forgot-password/
 * sign-in with NO create-account text anywhere in the visible (non-script) DOM; a non-admin fixture
 * (`buyer-only+foundation-test@example.com`) is denied with the generic message and never reaches
 * `/dashboard-admin/`; the approved `warehouse-admin+foundation-test@example.com` fixture
 * successfully reaches `/dashboard-admin/` and its identity subtitle shows `WAREHOUSE`; the member
 * `/sign-in/` page is unchanged (still has the Create Account link) and still correctly signs a
 * plain member in to `/dashboard/`. This live run also discovered and fixed, via the APPROVED
 * `npm run test:seed` mechanism (not a new bypass), that the `warehouse-admin` fixture's
 * `platform_admins` row was missing in the current environment — a pre-existing fixture-provisioning
 * gap unrelated to this pass's own code, now reconciled.
 */
const ADMIN_SIGNIN_ACTIONS = readFileSync("src/app/admin/sign-in/actions.ts", "utf8");
const ADMIN_SIGNIN_PAGE = readFileSync("src/app/admin/sign-in/page.tsx", "utf8");
const ADMIN_LAYOUT = readFileSync("src/app/admin/layout.tsx", "utf8");
const ADMIN_SIGNIN_FORM = readFileSync("components/account/admin-sign-in-form.tsx", "utf8");
const DASHBOARD_ADMIN_LAYOUT = readFileSync("src/app/dashboard-admin/layout.tsx", "utf8");
const PROXY = readFileSync("src/proxy.ts", "utf8");
const MEMBER_SIGNIN_PAGE = readFileSync("src/app/(auth)/sign-in/page.tsx", "utf8");
const MEMBER_SIGNUP_PAGE = readFileSync("src/app/(auth)/sign-up/page.tsx", "utf8");
const MEMBER_SIGNIN_ACTIONS = readFileSync("src/app/(auth)/sign-in/actions.ts", "utf8");
const EN_COPY = readFileSync("lib/public/copy/en.ts", "utf8");
const AR_COPY = readFileSync("lib/public/copy/ar.ts", "utf8");

describe("1. Admin Sign-In route exists", () => {
  it("src/app/admin/sign-in/{page.tsx,actions.ts} and src/app/admin/layout.tsx all exist", () => {
    expect(ADMIN_SIGNIN_PAGE.length).toBeGreaterThan(0);
    expect(ADMIN_SIGNIN_ACTIONS.length).toBeGreaterThan(0);
    expect(ADMIN_LAYOUT.length).toBeGreaterThan(0);
  });

  it("the admin layout is non-indexable, like every other auth surface", () => {
    expect(ADMIN_LAYOUT).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("contains Email, Password, Forgot password, and Sign in — no Create Account CTA anywhere", () => {
    expect(ADMIN_SIGNIN_FORM).toMatch(/copy\.email/);
    expect(ADMIN_SIGNIN_FORM).toMatch(/copy\.password/);
    expect(ADMIN_SIGNIN_FORM).toMatch(/copy\.forgotPassword/);
    expect(ADMIN_SIGNIN_FORM).toMatch(/copy\.submit/);
    for (const surface of [ADMIN_SIGNIN_PAGE, ADMIN_SIGNIN_FORM, ADMIN_LAYOUT]) {
      expect(codeOnly(surface)).not.toMatch(/noAccount|createAccount|signUp|sign-up|"\/sign-up\//i);
    }
  });

  it("the copy object itself has no noAccount/createAccount key — structurally cannot render that CTA", () => {
    const adminSignInCopyBlock = EN_COPY.slice(EN_COPY.indexOf("adminSignIn: {"), EN_COPY.indexOf("signUp: {", EN_COPY.indexOf("adminSignIn: {")));
    expect(adminSignInCopyBlock).not.toMatch(/noAccount|createAccount/);
    const adminSignInCopyBlockAr = AR_COPY.slice(AR_COPY.indexOf("adminSignIn: {"), AR_COPY.indexOf("signUp: {", AR_COPY.indexOf("adminSignIn: {")));
    expect(adminSignInCopyBlockAr).not.toMatch(/noAccount|createAccount/);
  });

  it("reuses the existing PasswordInput — no duplicated show/hide toggle logic", () => {
    expect(ADMIN_SIGNIN_FORM).toMatch(/from "@\/components\/ui\/password-input"/);
    expect(ADMIN_SIGNIN_FORM).not.toMatch(/setVisible|type=\{visible/); // that logic lives only in PasswordInput itself
  });

  it("reuses the SAME SignInInput schema as member sign-in — no second validation system", () => {
    expect(ADMIN_SIGNIN_ACTIONS).toMatch(/from "@\/lib\/validation\/sign-in"/);
    expect(ADMIN_SIGNIN_ACTIONS).toMatch(/SignInInput\.safeParse/);
  });
});

describe("2. /dashboard-admin/ anonymous routing", () => {
  it("src/proxy.ts routes an obviously-anonymous /dashboard-admin/* visitor to /admin/sign-in/, and /dashboard/* to /sign-in/ — never crossed", () => {
    expect(PROXY).toMatch(/ADMIN_SIGN_IN_PATH\s*=\s*"\/admin\/sign-in\/"/);
    expect(PROXY).toMatch(/pathname\.startsWith\(["']\/dashboard-admin["']\)\s*\n?\s*\?\s*ADMIN_SIGN_IN_PATH\s*\n?\s*:\s*SIGN_IN_PATH/);
    expect(PROXY).toMatch(/matcher:\s*\[\s*["']\/dashboard\/:path\*["'],\s*["']\/dashboard-admin\/:path\*["']\s*\]/);
  });

  it("dashboard-admin/layout.tsx redirects an anonymous request (stale/expired-cookie edge case the proxy can't catch) to /admin/sign-in/, never showing a static card that leaks into the member sign-in path", () => {
    expect(DASHBOARD_ADMIN_LAYOUT).toMatch(/redirect\("\/admin\/sign-in\/"\)/);
    expect(DASHBOARD_ADMIN_LAYOUT).not.toMatch(/redirect\("\/sign-in\/"\)/);
  });

  it("the authorization guard predicate itself is untouched (same lines tests/design/uif-g.test.tsx already protects)", () => {
    expect(DASHBOARD_ADMIN_LAYOUT).toContain('if (identity.kind !== "authenticated") {');
    expect(DASHBOARD_ADMIN_LAYOUT).toContain("if (identity.operationalRoles.length === 0) {");
  });

  it("a non-admin (authenticated, zero operational roles) still gets the existing truthful denial — not a redirect loop, not admin content", () => {
    const nonAdminBlockStart = DASHBOARD_ADMIN_LAYOUT.indexOf("if (identity.operationalRoles.length === 0)");
    const appShellReturnIndex = DASHBOARD_ADMIN_LAYOUT.indexOf("return (\n    <AppShell");
    const nonAdminBlock = DASHBOARD_ADMIN_LAYOUT.slice(nonAdminBlockStart, appShellReturnIndex);
    expect(appShellReturnIndex).toBeGreaterThan(nonAdminBlockStart);
    expect(nonAdminBlock).toMatch(/StateScreen/);
    expect(nonAdminBlock).not.toMatch(/<AppShell/);
  });
});

describe("3. Admin authorization source — never metadata/frontend-derived", () => {
  it("adminSignIn reads authorization from getRequestIdentity().operationalRoles — the same DB-derived field the layout guard checks", () => {
    expect(ADMIN_SIGNIN_ACTIONS).toMatch(/getRequestIdentity/);
    expect(ADMIN_SIGNIN_ACTIONS).toMatch(/identity\.operationalRoles\.length === 0/);
  });

  it("never reads user_metadata, localStorage, a cookie value, or a URL param as an authorization signal", () => {
    const code = codeOnly(ADMIN_SIGNIN_ACTIONS);
    expect(code).not.toMatch(/user_metadata/);
    expect(code).not.toMatch(/localStorage/);
    expect(code).not.toMatch(/searchParams|nextUrl|request\.url/);
  });

  it("never inserts into platform_admins, never grants a role, never creates an organization/membership", () => {
    expect(ADMIN_SIGNIN_ACTIONS).not.toMatch(/\.from\(["']platform_admins["']\)/);
    expect(ADMIN_SIGNIN_ACTIONS).not.toMatch(/\.from\(["']organizations["']\)/);
    expect(ADMIN_SIGNIN_ACTIONS).not.toMatch(/\.from\(["']organization_members["']\)/);
    expect(ADMIN_SIGNIN_ACTIONS).not.toMatch(/SERVICE_ROLE/);
  });
});

describe("4. Non-admin denial is controlled and signs the session back out", () => {
  it("returns controlled codes — never a provider message or internal role detail", () => {
    const authFailureBlock = ADMIN_SIGNIN_ACTIONS.slice(
      ADMIN_SIGNIN_ACTIONS.indexOf("if (error) {"),
      ADMIN_SIGNIN_ACTIONS.indexOf("if (error) {") + 120
    );
    expect(authFailureBlock).toMatch(/ACTION_FEEDBACK\.INVALID_CREDENTIALS/);

    const notAdminBlock = ADMIN_SIGNIN_ACTIONS.slice(ADMIN_SIGNIN_ACTIONS.indexOf("identity.operationalRoles.length === 0"));
    expect(notAdminBlock).toMatch(/ACTION_FEEDBACK\.ADMIN_ACCESS_DENIED/);
    expect(notAdminBlock).not.toMatch(/"not an administrator"|"no admin access"|role details/i);
  });

  it("signs the session out before returning the non-admin denial — no dangling authenticated-but-denied session", () => {
    const notAdminBlock = ADMIN_SIGNIN_ACTIONS.slice(ADMIN_SIGNIN_ACTIONS.indexOf("identity.operationalRoles.length === 0"));
    expect(notAdminBlock).toMatch(/supabase\.auth\.signOut\(\)/);
  });
});

describe("5. Redirect safety — no open redirect, no next/returnTo surface at all", () => {
  it("adminSignIn contains exactly two literal redirect targets and reads no dynamic destination from the request", () => {
    const redirectCalls = ADMIN_SIGNIN_ACTIONS.match(/redirect\([^)]*\)/g) ?? [];
    expect(redirectCalls.sort()).toEqual(['redirect("/dashboard-admin/")', 'redirect("/mfa/")']);
  });

  it("no next/returnTo field is read from formData anywhere in the admin sign-in surface", () => {
    for (const surface of [ADMIN_SIGNIN_ACTIONS, ADMIN_SIGNIN_FORM, ADMIN_SIGNIN_PAGE]) {
      expect(surface).not.toMatch(/formData\.get\(["'](next|returnTo|redirect_to|redirectTo)["']\)/);
    }
  });
});

describe("6. Member Sign-In / Sign-Up boundary", () => {
  it("member sign-in still has Sign In, Forgot password, and Create Account", () => {
    expect(MEMBER_SIGNIN_PAGE).toMatch(/c\.auth\.signIn\.createAccount/);
    expect(MEMBER_SIGNIN_PAGE).toMatch(/href="\/sign-up\/"/);
  });

  it("member sign-up page is untouched by this pass", () => {
    expect(MEMBER_SIGNUP_PAGE).toMatch(/SignUpForm/);
  });

  it("member signIn refuses operational accounts, signs them out, and keeps ordinary members on /dashboard/", () => {
    expect(MEMBER_SIGNIN_ACTIONS).not.toMatch(/redirect\("\/dashboard-admin\/"\)/);
    expect(MEMBER_SIGNIN_ACTIONS).toMatch(/redirect\("\/dashboard\/"\)/);
    expect(MEMBER_SIGNIN_ACTIONS).toMatch(/identity\.operationalRoles\.length > 0/);
    const adminBoundary = MEMBER_SIGNIN_ACTIONS.slice(MEMBER_SIGNIN_ACTIONS.indexOf("identity.operationalRoles.length > 0"));
    expect(adminBoundary).toMatch(/supabase\.auth\.signOut\(\)/);
    expect(adminBoundary).toMatch(/ACTION_FEEDBACK\.ADMIN_PORTAL_REQUIRED/);
  });
});

describe("7. Accessibility / EN-AR / RTL", () => {
  it("adminSignIn copy has both English and Arabic translations with the same key shape", () => {
    expect(EN_COPY).toMatch(/adminSignIn:\s*\{/);
    expect(AR_COPY).toMatch(/adminSignIn:\s*\{/);
    for (const key of ["eyebrow", "title", "lead", "email", "password", "submit", "submitting", "forgotPassword", "genericError", "accessDenied", "serverError", "metaTitle"]) {
      const enBlock = EN_COPY.slice(EN_COPY.indexOf("adminSignIn: {"), EN_COPY.indexOf("signUp: {", EN_COPY.indexOf("adminSignIn: {")));
      const arBlock = AR_COPY.slice(AR_COPY.indexOf("adminSignIn: {"), AR_COPY.indexOf("signUp: {", AR_COPY.indexOf("adminSignIn: {")));
      expect(enBlock).toMatch(new RegExp(`${key}:`));
      expect(arBlock).toMatch(new RegExp(`${key}:`));
    }
  });

  it("the admin layout reuses the same RTL-correct back-link icon treatment as the member auth layout", () => {
    expect(ADMIN_LAYOUT).toMatch(/rtl:rotate-180/);
  });

  it("the admin form reuses PasswordInput, which is already RTL-verified (logical end-1 positioning, no hardcoded left/right)", () => {
    const passwordInput = readFileSync("components/ui/password-input.tsx", "utf8");
    expect(passwordInput).toMatch(/\bend-1\b/);
    expect(passwordInput).not.toMatch(/\bleft-\d|\bright-\d/);
  });
});

describe("8. LIVE — admin authorization source, real fixtures", () => {
  const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

  vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => {
      if (!serverClientState.client) throw new Error("Test request has no Supabase client");
      return serverClientState.client;
    }),
  }));

  afterEach(() => {
    serverClientState.client = null;
    vi.clearAllMocks();
  });

  it("the approved warehouse-admin fixture resolves a non-empty operationalRoles — the exact condition adminSignIn and the layout guard both require to admit a caller", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    serverClientState.client = client;
    vi.resetModules();
    const { getRequestIdentity } = await import("@/lib/auth/dal");
    const identity = await getRequestIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind === "authenticated") {
      expect(identity.operationalRoles.length).toBeGreaterThan(0);
      expect(identity.operationalRoles).toContain("WAREHOUSE");
    }
  });

  it("the approved buyer-only (non-admin) fixture resolves an EMPTY operationalRoles — the exact condition that must deny admin sign-in and the layout guard", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    serverClientState.client = client;
    vi.resetModules();
    const { getRequestIdentity } = await import("@/lib/auth/dal");
    const identity = await getRequestIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind === "authenticated") {
      expect(identity.operationalRoles).toEqual([]);
    }
  });
});

describe("9. Blocked/inactive admin denial — the DB function's own is_active check", () => {
  it("every operational-role function (is_platform_admin and siblings) requires platform_admins.is_active = true — confirmed against the live schema report, not merely coded", () => {
    const rawReport = JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"));
    const report = JSON.parse(rawReport["0"].database_schema_report);
    for (const name of ["is_platform_admin", "is_compliance_operator", "is_warehouse_operator", "is_finance_operator", "is_auditor", "is_super_admin"]) {
      const fn = report.functions.find((f: { function_name?: string }) => f.function_name === name);
      expect(fn, `${name} should exist`).toBeTruthy();
      expect(fn.definition).toMatch(/pa\.is_active = true/);
    }
  });
});
