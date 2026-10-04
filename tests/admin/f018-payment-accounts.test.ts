/**
 * Feature 018 T055 - default USD selection, roles, MFA, masking and readiness for the EXISTING payment-account system.
 * STATIC (mocked Supabase/guards). The real-PostgreSQL role/MFA/default/snapshot proofs live in
 * tests/commerce/f018-bank-snapshot.test.ts. Nothing here reaches a remote database.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guards = vi.hoisted(() => ({ byFunction: {} as Record<string, { ok: boolean; denial?: string; identity?: { userId: string } }> }));
vi.mock("@/lib/admin/guards", () => ({
  checkRoleFunctionAccess: vi.fn(async (fn: string) => guards.byFunction[fn] ?? { ok: false, denial: "forbidden" }),
}));
const db = vi.hoisted(() => ({ rows: [] as unknown[], rpc: vi.fn(), insert: vi.fn(), before: { is_default_for_currency: false } as { is_default_for_currency: boolean } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: db.rpc,
    from: () => ({
      select: () => ({
        order: () => ({ order: () => ({ limit: async () => ({ data: db.rows, error: null }) }) }),
        eq: () => ({ maybeSingle: async () => ({ data: db.before, error: null }) }),
      }),
      insert: db.insert,
    }),
  })),
}));

import { classifyBankDefaultError, createPaymentAccount, evaluateBankReadiness, listPaymentAccounts, maskIdentifier, setDefaultPaymentAccount, type PaymentAccountRow } from "@/lib/admin/payment-accounts";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

const ID = "f0180007-0000-4000-8000-000000000001";
const KEY = "f018000c-0000-4000-8000-0000000000aa";
const ADMIN = { ok: true, identity: { userId: "u-admin" } };

const account = (over: Partial<PaymentAccountRow> = {}): PaymentAccountRow => ({
  id: ID, accountName: "Hills Trading LLC", bankName: "Bank", accountNumberMasked: "••••3456", ibanMasked: "••••3456", swiftCode: null, currency: "USD",
  isActive: true, isDefault: true, createdBy: "u", createdAt: "2026-10-01T00:00:00Z", ...over,
});

beforeEach(() => {
  guards.byFunction = { is_platform_admin: ADMIN, is_super_admin: { ok: false, denial: "forbidden" } };
  db.rows = []; db.rpc.mockReset(); db.insert.mockReset(); db.before = { is_default_for_currency: false };
});

describe("checkout bank readiness (active default USD account with an identifier)", () => {
  it("READY only for an active default USD account carrying an IBAN or account number", () => {
    expect(evaluateBankReadiness([account()])).toMatchObject({ state: "READY", bankName: "Bank" });
    expect(evaluateBankReadiness([account({ ibanMasked: null })])).toMatchObject({ state: "READY" });
  });
  it("reports the exact reason checkout cannot issue instructions", () => {
    expect(evaluateBankReadiness([])).toEqual({ state: "MISSING_DEFAULT" });
    expect(evaluateBankReadiness([account({ isDefault: false })])).toEqual({ state: "MISSING_DEFAULT" });
    expect(evaluateBankReadiness([account({ isActive: false })])).toEqual({ state: "DEFAULT_INACTIVE", accountId: ID });
    expect(evaluateBankReadiness([account({ ibanMasked: null, accountNumberMasked: null })])).toEqual({ state: "INCOMPLETE", accountId: ID, bankName: "Bank" });
  });
  it("a non-USD default does not make USD checkout ready", () => {
    expect(evaluateBankReadiness([account({ currency: "EUR" })])).toEqual({ state: "MISSING_DEFAULT" });
  });
});

describe("typed default-selection errors (never database text)", () => {
  it.each([
    [{ message: "mfa_step_up_required" }, "MFA_REQUIRED"],
    [{ message: "forbidden" }, "NOT_CAPABLE"],
    [{ message: "payment_account_not_found" }, "NOT_FOUND"],
    [{ message: "request_id_conflict" }, "REQUEST_CONFLICT"],
    [{ code: "23505", message: "duplicate key value violates unique constraint uq_payment_account_default_currency" }, "CONFLICT"],
    [{ code: "40001", message: "could not serialize" }, "CONFLICT"],
    [{ code: "XX000", message: "internal" }, "FAILED"],
    [{ message: "fetch failed" }, "OUTCOME_UNKNOWN"],
  ])("%j -> %s", (error, code) => {
    expect(classifyBankDefaultError(error)).toBe(code);
  });
});

describe("setDefaultPaymentAccount: Platform Admin + MFA, request-bound, existing routine only", () => {
  it("calls ONLY set_default_payment_account with the account and the stable request key", async () => {
    db.rpc.mockResolvedValue({ data: { payment_account_id: ID, currency: "USD" }, error: null });
    const result = await setDefaultPaymentAccount({ accountId: ID, requestId: KEY });
    expect(result).toEqual({ ok: true, data: { accountId: ID, alreadyDefault: false } });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("set_default_payment_account", { p_account_id: ID, p_request_id: KEY });
  });
  it("reports an idempotent re-selection of the current default", async () => {
    db.before = { is_default_for_currency: true };
    db.rpc.mockResolvedValue({ data: {}, error: null });
    expect(await setDefaultPaymentAccount({ accountId: ID, requestId: KEY })).toMatchObject({ ok: true, data: { alreadyDefault: true } });
  });
  it.each([
    ["anonymous", "AUTH_REQUIRED"], ["mfa-step-up", "MFA_REQUIRED"], ["no-operational-role", "NOT_CAPABLE"], ["forbidden", "NOT_CAPABLE"],
  ])("a %s caller is refused before the database (%s)", async (denial, code) => {
    guards.byFunction.is_platform_admin = { ok: false, denial };
    expect(await setDefaultPaymentAccount({ accountId: ID, requestId: KEY })).toEqual({ ok: false, code });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("database MFA/role refusals surface as typed codes", async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "mfa_step_up_required" } });
    expect(await setDefaultPaymentAccount({ accountId: ID, requestId: KEY })).toEqual({ ok: false, code: "MFA_REQUIRED" });
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "payment_account_not_found" } });
    expect(await setDefaultPaymentAccount({ accountId: ID, requestId: KEY })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
  it("rejects malformed input before any call", async () => {
    expect(await setDefaultPaymentAccount({ accountId: "nope", requestId: KEY })).toEqual({ ok: false, code: "VALIDATION" });
    expect(await setDefaultPaymentAccount({ accountId: ID })).toEqual({ ok: false, code: "VALIDATION" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("roles stay separate: Super Admin writes accounts, Platform Admin only chooses the default", () => {
  it("a Platform Admin (not Super Admin) cannot create an account", async () => {
    const result = await createPaymentAccount({ accountName: "New", bankName: "Bank", accountNumber: "123456", iban: "", swiftCode: "", currency: "USD", isActive: "on" });
    expect(result).toMatchObject({ ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_CAPABLE });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("the default control writes through the database routine, never the table (no direct flag update in app code)", () => {
    const dal = readFileSync("lib/admin/payment-accounts.ts", "utf8");
    expect(dal).not.toMatch(/\.update\(\{[^}]*is_default_for_currency/);
    expect(readFileSync("src/app/dashboard-admin/(system)/payment-accounts/actions.ts", "utf8")).not.toContain("is_default_for_currency");
  });
});

describe("masking: lists never carry full identifiers", () => {
  it("projects masked values and the default flag only", async () => {
    db.rows = [{ id: ID, account_name: "Hills", bank_name: "Bank", account_number: "1234567890123456", iban: "AE070331234567890123456", swift_code: "F018AEAD", currency: "USD", is_active: true, is_default_for_currency: true, created_by: "u", created_at: "2026-10-01T00:00:00Z" }];
    const rows = await listPaymentAccounts();
    expect(rows).not.toBeNull();
    const text = JSON.stringify(rows);
    expect(text).not.toContain("1234567890123456");
    expect(text).not.toContain("AE070331234567890123456");
    expect(rows![0]).toMatchObject({ isDefault: true, ibanMasked: maskIdentifier("AE070331234567890123456") });
  });
  it("a non-platform-admin gets no list at all", async () => {
    guards.byFunction.is_platform_admin = { ok: false, denial: "forbidden" };
    expect(await listPaymentAccounts()).toBeNull();
  });
});
