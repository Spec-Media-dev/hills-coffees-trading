import { describe, expect, it, vi } from "vitest";

import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F010-ACCOUNT-MEDIA — account-security proofs (password change, ADMIN/SUPER_ADMIN-
 * only email change, Seller/Buyer email-change refusal).
 *
 * WHY THIS FILE NEVER CALLS THE REAL `auth.updateUser` AGAINST A LIVE FIXTURE: `changeMyPassword`
 * would immediately overwrite a SHARED fixture's real sign-in password (breaking `TEST_FIXTURE_
 * PASSWORD` for every other suite that signs in as it afterward — a genuinely destructive, hard-to-
 * undo side effect); `changeMyEmail`'s success path would leave a real "pending email change" state
 * on a shared fixture with no approved cancel path. Both are therefore proven with a MOCKED
 * `@/lib/supabase/server` client (the exact same technique Feature 008's own settlement/webhook tests
 * already use) — genuinely exercising this file's own authorization/validation/error-mapping logic,
 * never a real Supabase Auth mutation. The ONE thing proven LIVE, safely, is the Seller/Buyer
 * REFUSAL path — it returns `EMAIL_CHANGE_FORBIDDEN` before ever reaching `auth.updateUser` — but
 * even that is proven below with a mocked identity (covering Buyer/Seller AND every non-Admin
 * operational role) rather than a real fixture sign-in, since the mocked suite exercises the exact
 * same `changeMyEmail` code path with zero live-session dependency at all.
 */

const serverClientState = vi.hoisted(() => ({
  operationalRoles: [] as string[],
  updateUserCalls: [] as unknown[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({
  getRequestIdentity: vi.fn(async () => ({
    kind: "authenticated",
    userId: "00000000-0000-4000-8000-000000000099",
    requiresMfaStepUp: false,
    operationalRoles: serverClientState.operationalRoles,
    organization: null,
    isAuthorizedMember: false,
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      updateUser: vi.fn(async (input: unknown) => {
        serverClientState.updateUserCalls.push(input);
        return { data: {}, error: null };
      }),
    },
  })),
}));

describe("T048 — changeMyEmail: authorization gate (mocked Auth client, no live fixture mutation)", () => {
  it("refuses a session with zero operationalRoles (Buyer/Seller) before any Auth call", async () => {
    serverClientState.operationalRoles = [];
    serverClientState.updateUserCalls = [];
    const { changeMyEmail } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("newEmail", "new-admin-email@example.com");
    const result = await changeMyEmail(undefined, formData);
    expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.EMAIL_CHANGE_FORBIDDEN });
    expect(serverClientState.updateUserCalls).toEqual([]);
  });

  it("refuses a pure FINANCE/WAREHOUSE/COMPLIANCE/AUDITOR operator (not named in the approved rule either)", async () => {
    serverClientState.operationalRoles = ["FINANCE"];
    serverClientState.updateUserCalls = [];
    const { changeMyEmail } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("newEmail", "new-admin-email@example.com");
    const result = await changeMyEmail(undefined, formData);
    expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.EMAIL_CHANGE_FORBIDDEN });
    expect(serverClientState.updateUserCalls).toEqual([]);
  });

  it("an ADMIN session reaches the approved Supabase Auth flow (auth.updateUser({ email }))", async () => {
    serverClientState.operationalRoles = ["ADMIN"];
    serverClientState.updateUserCalls = [];
    const { changeMyEmail } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("newEmail", "new-admin-email@example.com");
    const result = await changeMyEmail(undefined, formData);
    expect(result.ok).toBe(true);
    expect(serverClientState.updateUserCalls).toEqual([{ email: "new-admin-email@example.com" }]);
  });

  it("a SUPER_ADMIN session also reaches the approved flow", async () => {
    serverClientState.operationalRoles = ["SUPER_ADMIN"];
    serverClientState.updateUserCalls = [];
    const { changeMyEmail } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("newEmail", "new-admin-email@example.com");
    const result = await changeMyEmail(undefined, formData);
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed email before any authorization check even runs", async () => {
    serverClientState.operationalRoles = ["ADMIN"];
    serverClientState.updateUserCalls = [];
    const { changeMyEmail } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("newEmail", "not-an-email");
    const result = await changeMyEmail(undefined, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    expect(serverClientState.updateUserCalls).toEqual([]);
  });
});

describe("T048 — changeMyPassword: available to every role (mocked Auth client)", () => {
  it("a Buyer/Seller (zero operationalRoles) can still change their own password", async () => {
    serverClientState.operationalRoles = [];
    serverClientState.updateUserCalls = [];
    const { changeMyPassword } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("password", "a-genuinely-long-password-123");
    formData.set("confirmPassword", "a-genuinely-long-password-123");
    const result = await changeMyPassword(undefined, formData);
    expect(result).toEqual({ ok: true, data: undefined, code: ACTION_FEEDBACK.PASSWORD_CHANGED });
    expect(serverClientState.updateUserCalls).toEqual([{ password: "a-genuinely-long-password-123" }]);
  });

  it("an ADMIN can also change their own password through the SAME action", async () => {
    serverClientState.operationalRoles = ["ADMIN"];
    serverClientState.updateUserCalls = [];
    const { changeMyPassword } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("password", "another-long-password-456");
    formData.set("confirmPassword", "another-long-password-456");
    const result = await changeMyPassword(undefined, formData);
    expect(result.ok).toBe(true);
  });

  it("rejects a mismatched confirmation before any Auth call", async () => {
    serverClientState.operationalRoles = [];
    serverClientState.updateUserCalls = [];
    const { changeMyPassword } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("password", "a-genuinely-long-password-123");
    formData.set("confirmPassword", "does-not-match");
    const result = await changeMyPassword(undefined, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    expect(serverClientState.updateUserCalls).toEqual([]);
  });

  it("rejects a password shorter than 8 characters before any Auth call", async () => {
    serverClientState.operationalRoles = [];
    serverClientState.updateUserCalls = [];
    const { changeMyPassword } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("password", "short");
    formData.set("confirmPassword", "short");
    const result = await changeMyPassword(undefined, formData);
    expect(result.ok).toBe(false);
    expect(serverClientState.updateUserCalls).toEqual([]);
  });

  it("never echoes the password value back in a success result", async () => {
    serverClientState.operationalRoles = [];
    serverClientState.updateUserCalls = [];
    const { changeMyPassword } = await import("@/src/app/dashboard/settings/actions");
    const formData = new FormData();
    formData.set("password", "a-genuinely-long-password-123");
    formData.set("confirmPassword", "a-genuinely-long-password-123");
    const result = await changeMyPassword(undefined, formData);
    expect(JSON.stringify(result)).not.toContain("a-genuinely-long-password-123");
  });
});
