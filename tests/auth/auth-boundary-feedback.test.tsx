import { readFileSync } from "node:fs";

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

const mocks = vi.hoisted(() => ({
  identity: {
    kind: "authenticated",
    isEmailVerified: true,
    operationalRoles: [] as string[],
  },
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  assurance: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      mfa: { getAuthenticatorAssuranceLevel: mocks.assurance },
    },
  })),
}));

vi.mock("@/lib/auth/dal", () => ({
  getRequestIdentity: vi.fn(async () => mocks.identity),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/components/app/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
    info: mocks.toastInfo,
  },
}));

function credentials() {
  const data = new FormData();
  data.set("email", "person@example.com");
  data.set("password", "correct-horse-battery-staple");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity = { kind: "authenticated", isEmailVerified: true, operationalRoles: [] };
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.assurance.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
});

describe("strict member/admin authentication boundaries", () => {
  it("rejects an operational admin at the member portal, signs out, and never enters member routing", async () => {
    mocks.identity.operationalRoles = ["WAREHOUSE"];
    const { signIn } = await import("@/src/app/(auth)/sign-in/actions");

    await expect(signIn(undefined, credentials())).resolves.toEqual({
      ok: false,
      code: ACTION_FEEDBACK.ADMIN_PORTAL_REQUIRED,
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps a verified non-operational member on the member dashboard", async () => {
    const { signIn } = await import("@/src/app/(auth)/sign-in/actions");
    await expect(signIn(undefined, credentials())).rejects.toThrow("NEXT_REDIRECT:/dashboard/");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns the same controlled code for different credential-provider failures", async () => {
    const { signIn } = await import("@/src/app/(auth)/sign-in/actions");
    for (const providerError of [
      { code: "invalid_credentials", message: "Invalid login credentials" },
      { code: "user_not_found", message: "Unknown account" },
    ]) {
      mocks.signInWithPassword.mockResolvedValueOnce({ error: providerError });
      await expect(signIn(undefined, credentials())).resolves.toEqual({
        ok: false,
        code: ACTION_FEEDBACK.INVALID_CREDENTIALS,
      });
    }
  });

  it("rejects and signs out a valid non-admin at the admin portal", async () => {
    const { adminSignIn } = await import("@/src/app/admin/sign-in/actions");
    await expect(adminSignIn(undefined, credentials())).resolves.toEqual({
      ok: false,
      code: ACTION_FEEDBACK.ADMIN_ACCESS_DENIED,
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("routes an active operational admin to the admin dashboard", async () => {
    mocks.identity.operationalRoles = ["COMPLIANCE"];
    const { adminSignIn } = await import("@/src/app/admin/sign-in/actions");
    await expect(adminSignIn(undefined, credentials())).rejects.toThrow("NEXT_REDIRECT:/dashboard-admin/");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

describe("project action feedback convention", () => {
  it("wires the member-portal admin result to one safe internal Admin Portal action", () => {
    const memberForm = readFileSync("components/account/sign-in-form.tsx", "utf8");
    expect(memberForm).toContain("copy.adminPortalRequired");
    expect(memberForm).toContain('router.push("/admin/sign-in/")');
    expect(memberForm).not.toMatch(/window\.location|https?:\/\//);
  });

  it("emits one toast per action result object, not per rerender", async () => {
    const { useActionToast } = await import("@/components/app/use-action-toast");
    const firstState: ActionFeedbackResult = { ok: false, code: ACTION_FEEDBACK.AUTH_GENERIC_ERROR };
    const { rerender } = renderHook(
      ({ state, message }: { state: ActionFeedbackResult; message: string }) =>
        useActionToast(state, { tone: "error", message }),
      { initialProps: { state: firstState, message: "Safe error" } }
    );

    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    rerender({ state: firstState, message: "Localized safe error" });
    expect(mocks.toastError).toHaveBeenCalledTimes(1);

    rerender({
      state: { ok: false, code: ACTION_FEEDBACK.AUTH_GENERIC_ERROR },
      message: "Localized safe error",
    });
    expect(mocks.toastError).toHaveBeenCalledTimes(2);
  });

  it("keeps one provider, localized EN/AR feedback, and no raw action error rendering", () => {
    const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
    expect(rootLayout.match(/<HillsToaster\s*\/>/g)).toHaveLength(1);

    const en = readFileSync("lib/public/copy/en.ts", "utf8") + readFileSync("lib/app/copy/en.ts", "utf8");
    const ar = readFileSync("lib/public/copy/ar.ts", "utf8") + readFileSync("lib/app/copy/ar.ts", "utf8");
    for (const key of ["adminPortalRequired", "accessDenied", "serverError", "uploadFailed", "profileSaved"]) {
      expect(en).toContain(`${key}:`);
      expect(ar).toContain(`${key}:`);
    }

    const targetFiles = [
      "components/account/sign-in-form.tsx",
      "components/account/admin-sign-in-form.tsx",
      "components/account/sign-up-form.tsx",
      "components/account/reset-password-confirm-form.tsx",
      "components/account/resend-verification-button.tsx",
      "components/account/membership-application-form.tsx",
      "components/account/kyb-draft-form.tsx",
      "components/account/kyb-document-row.tsx",
      "components/account/kyb-submit-panel.tsx",
      "src/app/dashboard/settings/profile-settings-form.tsx",
    ];
    for (const file of targetFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/state\??\.error/);
    }

    for (const file of [
      "components/account/sign-in-form.tsx",
      "components/account/admin-sign-in-form.tsx",
      "components/account/sign-up-form.tsx",
      "components/account/reset-password-request-form.tsx",
      "components/account/reset-password-confirm-form.tsx",
      "components/account/resend-verification-button.tsx",
      "components/account/membership-application-form.tsx",
      "components/account/kyb-draft-form.tsx",
      "components/account/kyb-document-row.tsx",
      "components/account/kyb-submit-panel.tsx",
      "src/app/dashboard/settings/profile-settings-form.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), file).toContain("useActionToast");
    }
  });
});
