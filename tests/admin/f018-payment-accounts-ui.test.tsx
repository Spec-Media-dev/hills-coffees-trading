/**
 * Feature 018 T057/T058 - payment-account list: masked values, default affordance, readiness and localized feedback in
 * English and Arabic. STATIC (mocked Server Action).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ setDefaultPaymentAccountAction: vi.fn() }));
vi.mock("@/src/app/dashboard-admin/(system)/payment-accounts/actions", () => action);
const toasts = vi.hoisted(() => ({ calls: [] as { tone: string; message: string }[] }));
vi.mock("@/components/app/toast", () => {
  const push = (tone: string) => (message: string) => { toasts.calls.push({ tone, message }); };
  return { toast: { success: push("success"), error: push("error"), warning: push("warning"), info: push("info") } };
});

import { PaymentAccountList } from "@/components/admin/payment-accounts/payment-account-list";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { f018AdminAr, f018AdminEn } from "@/lib/app/copy/f018-admin";
import type { BankReadiness, PaymentAccountRow } from "@/lib/admin/payment-accounts";

const A1 = "f0180007-0000-4000-8000-000000000001";
const A2 = "f0180007-0000-4000-8000-000000000002";
const row = (over: Partial<PaymentAccountRow>): PaymentAccountRow => ({
  id: A1, accountName: "Hills Main", bankName: "Bank One", accountNumberMasked: "••••3456", ibanMasked: "••••3456", swiftCode: null, currency: "USD",
  isActive: true, isDefault: true, createdBy: "u", createdAt: "2026-10-01T00:00:00Z", ...over,
});
const READY: BankReadiness = { state: "READY", accountId: A1, bankName: "Bank One", accountName: "Hills Main" };
const mount = (rows: PaymentAccountRow[], readiness: BankReadiness = READY, canSetDefault = true) =>
  render(<LocaleProvider><PaymentAccountList rows={rows} readiness={readiness} canSetDefault={canSetDefault} /></LocaleProvider>);
const en = f018AdminEn.paymentAccountsDefault;
const ar = f018AdminAr.paymentAccountsDefault;

beforeEach(() => { action.setDefaultPaymentAccountAction.mockReset(); toasts.calls.length = 0; });
afterEach(() => { cleanup(); document.documentElement.lang = "en"; });

describe("readiness presentation", () => {
  it.each<[BankReadiness, string, string]>([
    [READY, "ready", en.readiness.readyTitle],
    [{ state: "MISSING_DEFAULT" }, "missing", en.readiness.missingTitle],
    [{ state: "DEFAULT_INACTIVE", accountId: A1 }, "default-inactive", en.readiness.missingTitle],
    [{ state: "INCOMPLETE", accountId: A1, bankName: "Bank One" }, "incomplete", en.readiness.incompleteTitle],
  ])("%j shows the right banner", (readiness, marker, title) => {
    mount([row({})], readiness);
    expect(document.querySelector(`[data-bank-readiness="${marker}"]`)).not.toBeNull();
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  });
});

describe("masking and default affordance", () => {
  it("shows only masked identifiers and marks the current default", () => {
    mount([row({}), row({ id: A2, accountName: "Backup", isDefault: false })]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("••••3456");
    expect(text).not.toMatch(/\d{8,}/);
    expect(document.querySelector(`[data-default-account="${A1}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-set-default="${A2}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-set-default="${A1}"]`)).toBeNull();
  });
  it("offers 'set default' only for active USD accounts, and not at all to a read-only viewer", () => {
    mount([row({ isDefault: false, isActive: false }), row({ id: A2, isDefault: false, currency: "EUR" })]);
    expect(document.querySelector("[data-set-default]")).toBeNull();
    cleanup();
    mount([row({ id: A2, isDefault: false })], { state: "MISSING_DEFAULT" }, false);
    expect(document.querySelector("[data-set-default]")).toBeNull();
    expect(screen.getByText(en.readOnlyDefault)).toBeTruthy();
  });
  it("is an empty state with guidance, not a blank table", () => {
    mount([], { state: "MISSING_DEFAULT" });
    expect(screen.getAllByText(en.empty).length).toBeGreaterThan(0);
  });
});

describe("confirmed, request-bound default change with localized feedback", () => {
  const choose = async () => {
    fireEvent.click(document.querySelector(`[data-set-default="${A2}"]`)!);
    const dialog = await screen.findByRole("alertdialog");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: en.confirm.confirm })); });
  };
  const rows = () => [row({}), row({ id: A2, accountName: "Backup", isDefault: false })];

  it("asks for confirmation, sends the account + a request key, and toasts success once", async () => {
    action.setDefaultPaymentAccountAction.mockResolvedValue({ ok: true, data: { accountId: A2, alreadyDefault: false } });
    mount(rows());
    await choose();
    await waitFor(() => expect(action.setDefaultPaymentAccountAction).toHaveBeenCalledTimes(1));
    const data = action.setDefaultPaymentAccountAction.mock.calls[0]![1] as FormData;
    expect(data.get("accountId")).toBe(A2);
    expect(String(data.get("requestId"))).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(toasts.calls).toEqual([{ tone: "success", message: en.feedback.defaultSet }]));
  });

  it("an uncertain outcome is retried with the SAME request key; a success then rotates it", async () => {
    action.setDefaultPaymentAccountAction
      .mockResolvedValueOnce({ ok: false, code: "OUTCOME_UNKNOWN" })
      .mockResolvedValueOnce({ ok: true, data: { accountId: A2, alreadyDefault: false } })
      .mockResolvedValue({ ok: true, data: { accountId: A2, alreadyDefault: false } });
    mount(rows());
    await choose();
    await waitFor(() => expect(toasts.calls.at(-1)).toEqual({ tone: "warning", message: en.feedback.unknown }));
    await choose();
    await waitFor(() => expect(action.setDefaultPaymentAccountAction).toHaveBeenCalledTimes(2));
    await choose();
    await waitFor(() => expect(action.setDefaultPaymentAccountAction).toHaveBeenCalledTimes(3));
    const keys = action.setDefaultPaymentAccountAction.mock.calls.map(([, data]) => (data as FormData).get("requestId"));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it.each([
    ["MFA_REQUIRED", "warning", en.feedback.mfa],
    ["NOT_CAPABLE", "error", en.feedback.notCapable],
    ["NOT_FOUND", "error", en.feedback.notFound],
    ["CONFLICT", "warning", en.feedback.conflict],
    ["FAILED", "error", en.feedback.failed],
  ])("%s -> %s toast with a classified message", async (code, tone, message) => {
    action.setDefaultPaymentAccountAction.mockResolvedValue({ ok: false, code });
    mount(rows());
    await choose();
    await waitFor(() => expect(toasts.calls).toEqual([{ tone, message }]));
  });

  it("renders Arabic copy for the same states", async () => {
    document.documentElement.lang = "ar";
    action.setDefaultPaymentAccountAction.mockResolvedValue({ ok: false, code: "MFA_REQUIRED" });
    mount(rows(), { state: "MISSING_DEFAULT" });
    expect(screen.getAllByText(ar.readiness!.missingTitle!).length).toBeGreaterThan(0);
    fireEvent.click(document.querySelector(`[data-set-default="${A2}"]`)!);
    const dialog = await screen.findByRole("alertdialog");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: ar.confirm!.confirm! })); });
    await waitFor(() => expect(toasts.calls).toEqual([{ tone: "warning", message: ar.feedback!.mfa! }]));
  });
});

describe("EN/AR parity of the bank copy", () => {
  const flatten = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`)) : [prefix];
  it("has the same keys in both languages", () => {
    expect(flatten(ar).sort()).toEqual(flatten(en).sort());
  });
});
