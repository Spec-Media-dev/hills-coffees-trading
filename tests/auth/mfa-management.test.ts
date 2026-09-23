import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hardening run — two-factor MANAGEMENT (status, factor list, removal) on top of Feature 003's
 * enrolment/challenge. Unit-level: Supabase Auth is mocked so every refusal branch is provable
 * without a live authenticator. The live AAL2 enforcement proof remains `tests/auth/session.test.ts`
 * / the T033 remediation suites (unchanged by this run).
 */

const identity = vi.hoisted(() => ({ current: { kind: "authenticated", userId: "u-1", operationalRoles: [], requiresMfaStepUp: false } as Record<string, unknown> }));
const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
}));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: async () => identity.current }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { mfa } }) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const VERIFIED = { id: "factor-verified", factor_type: "totp", status: "verified", friendly_name: "Phone", created_at: "2026-09-01T00:00:00Z" };
const UNVERIFIED = { id: "factor-pending", factor_type: "totp", status: "unverified", friendly_name: null, created_at: "2026-09-02T00:00:00Z" };

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  identity.current = { kind: "authenticated", userId: "u-1", operationalRoles: [], requiresMfaStepUp: false };
  mfa.listFactors.mockResolvedValue({ data: { all: [VERIFIED], totp: [VERIFIED] }, error: null });
  mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  mfa.unenroll.mockResolvedValue({ data: {}, error: null });
});

describe("readMfaAccountState — Enabled / Enrollment pending / Disabled / Unknown, from the caller's own factors", () => {
  async function state() {
    const { readMfaAccountState } = await import("@/lib/auth/mfa-status");
    const { createClient } = await import("@/lib/supabase/server");
    return readMfaAccountState(await createClient());
  }

  it("a verified TOTP factor → enabled, and only verified factors are listed (no secret field exists)", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [VERIFIED, UNVERIFIED], totp: [VERIFIED] }, error: null });
    const result = await state();
    expect(result.status).toBe("enabled");
    expect(result.factors).toEqual([{ id: "factor-verified", friendlyName: "Phone", createdAt: "2026-09-01T00:00:00Z" }]);
    expect(JSON.stringify(result)).not.toMatch(/secret|qr_code|uri/i);
  });

  it("only an unverified factor → pending (abandoned enrolment), with nothing manageable", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [UNVERIFIED], totp: [] }, error: null });
    expect(await state()).toEqual({ status: "pending", factors: [] });
  });

  it("no factor → disabled; an Auth error → unknown (never guessed)", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
    expect((await state()).status).toBe("disabled");
    mfa.listFactors.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await state()).status).toBe("unknown");
  });
});

describe("removeMyMfaFactor — ownership + a fresh code before unenroll", () => {
  async function remove(values: Record<string, string>) {
    const { removeMyMfaFactor } = await import("@/src/app/(auth)/mfa/actions");
    return removeMyMfaFactor(undefined, form(values));
  }

  it("rejects a malformed code before any Auth call", async () => {
    const result = await remove({ factorId: VERIFIED.id, code: "12ab" });
    expect(result).toMatchObject({ ok: false, code: "validation_error" });
    expect(mfa.listFactors).not.toHaveBeenCalled();
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("refuses an anonymous session and a session still owing its step-up", async () => {
    identity.current = { kind: "anonymous" };
    expect(await remove({ factorId: VERIFIED.id, code: "123456" })).toMatchObject({ ok: false, code: "profile_auth_required" });
    identity.current = { kind: "authenticated", userId: "u-1", operationalRoles: [], requiresMfaStepUp: true };
    expect(await remove({ factorId: VERIFIED.id, code: "123456" })).toMatchObject({ ok: false, code: "mfa_step_up_required" });
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("refuses a factor id that is not one of THIS session's verified factors (no cross-account removal)", async () => {
    const result = await remove({ factorId: "someone-elses-factor", code: "123456" });
    expect(result).toMatchObject({ ok: false, code: "mfa_factor_not_found" });
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("a wrong code never reaches unenroll", async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "invalid" } });
    expect(await remove({ factorId: VERIFIED.id, code: "000000" })).toMatchObject({ ok: false, code: "mfa_invalid_code" });
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("a correct code verifies THEN unenrolls exactly that factor and refreshes both account surfaces", async () => {
    const result = await remove({ factorId: VERIFIED.id, code: "123456" });
    expect(result).toMatchObject({ ok: true, code: "mfa_disabled" });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: VERIFIED.id, code: "123456" });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: VERIFIED.id });
    expect(mfa.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(mfa.unenroll.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard-admin/account");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("an unenroll failure is reported, not swallowed", async () => {
    mfa.unenroll.mockResolvedValue({ data: null, error: { message: "aal2 required" } });
    expect(await remove({ factorId: VERIFIED.id, code: "123456" })).toMatchObject({ ok: false, code: "mfa_remove_failed" });
  });
});

describe("source-level MFA guarantees", () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const page = strip(readFileSync("src/app/(auth)/mfa/page.tsx", "utf8"));
  const files = ["src/app/(auth)/mfa/page.tsx", "src/app/(auth)/mfa/actions.ts", "lib/auth/mfa-status.ts", "components/account/two-factor-panel.tsx", "components/account/mfa-enroll-form.tsx"];

  it("the enrol page discards abandoned unverified factors BEFORE creating a new one (no accumulation)", () => {
    const cleanup = page.indexOf("mfa.unenroll({ factorId: factor.id })");
    const enroll = page.indexOf('mfa.enroll({ factorType: "totp" })');
    expect(cleanup).toBeGreaterThan(-1);
    expect(enroll).toBeGreaterThan(cleanup);
    expect(page).toMatch(/factor\.status === "unverified"/);
  });

  it("no MFA file logs, persists or posts the TOTP secret, and none uses a service role", () => {
    for (const file of files) {
      const source = strip(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(source, file).not.toMatch(/SERVICE_ROLE|service_role/);
      expect(source, file).not.toMatch(/\.from\(\s*["'][a-z_]+["']\s*\)\s*\.(insert|update|upsert)\([^)]*secret/);
    }
  });

  it("the panel is mounted on BOTH account surfaces and states the recovery-code limitation instead of inventing codes", () => {
    expect(readFileSync("src/app/dashboard-admin/account/page.tsx", "utf8")).toContain("<TwoFactorPanel state={mfa} />");
    expect(readFileSync("src/app/dashboard/settings/page.tsx", "utf8")).toContain("<TwoFactorPanel state={mfa} />");
    const panel = readFileSync("components/account/two-factor-panel.tsx", "utf8");
    expect(panel).toContain('data-two-factor-recovery="unsupported"');
    expect(panel).not.toMatch(/recoveryCodes|generateRecovery|backup_codes/);
  });

  it("login AAL2 enforcement is unchanged: both shells still redirect a step-up-owing session to /mfa/", () => {
    expect(readFileSync("src/app/dashboard/layout.tsx", "utf8")).toMatch(/if \(identity\.requiresMfaStepUp\) \{\s*redirect\("\/mfa\/"\);/);
    expect(readFileSync("src/app/dashboard-admin/layout.tsx", "utf8")).toMatch(/requiresMfaStepUp/);
  });
});
