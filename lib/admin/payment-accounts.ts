import { z } from "zod";

import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { mapSystemError, requirePlatformAdmin, requireSuperAdmin, saved, validationFailure, type SystemWriteOutcome } from "@/lib/admin/system-errors";
import { PaymentAccountFieldsInput, PaymentAccountUpdateInput } from "@/lib/admin/system-validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F — T029 payment-account configuration over the EXISTING `payment_accounts` table.
 * Feature 008 plan decision 6 assigns this configuration UI to Feature 010; Feature 008 adds no
 * member bank-detail mutation, and this module is the ONLY application caller of the table (pinned
 * by `tests/finance/rls-policy.test.ts` T005, scoped per decision D1). There is NO member or public
 * path to it.
 *
 * AUTHORITY — READ area: `is_platform_admin()` (T029's literal; RLS USING). WRITE: `is_super_admin()`
 * — the CURRENT policy `payment_accounts_admin` has `WITH CHECK is_super_admin()`, so an ADMIN's
 * insert/update would be refused by the database anyway; the console refuses first, honestly, and
 * says so on the page.
 *
 * HIGH-RISK / OPS-01 — bank-detail changes are a high-risk action under the SRS. The approved schema
 * has no maker-checker, approval-request or second-approver construct; this module records the
 * single actor (`created_by` on INSERT) and NOTHING else — no simulated dual control, no pending
 * state. The gap is stated in-product and in the handoff.
 *
 * ATTRIBUTION — every create / edit / deactivation is recorded by the database in `audit_logs` (actor =
 * `auth.uid()`; DB-OPEN-21 resolved by migration `20260920120000_feature_010_db_open_21_config_attribution.sql`). The audit payload is REDACTED
 * (`write_audit_log_payment_accounts()`): only the last four characters of the account number / IBAN and
 * change flags — never the values. `updated_at` is DB-owned.
 * NO HARD DELETE — retirement is `is_active = false`. Identifiers are shown masked in lists.
 */

export type PaymentAccountRow = { id: string; accountName: string; bankName: string; accountNumberMasked: string | null; ibanMasked: string | null; swiftCode: string | null; currency: string; isActive: boolean; isDefault: boolean; createdBy: string; createdAt: string };
export type PaymentAccountDetail = PaymentAccountRow & { accountNumber: string | null; iban: string | null };

const SELECT = "id, account_name, bank_name, account_number, iban, swift_code, currency, is_active, is_default_for_currency, created_by, created_at";
type Raw = { id: string; account_name: string; bank_name: string; account_number: string | null; iban: string | null; swift_code: string | null; currency: string; is_active: boolean; is_default_for_currency: boolean; created_by: string; created_at: string };

export function maskIdentifier(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return `${"•".repeat(Math.min(compact.length - 4, 12))}${compact.slice(-4)}`;
}

const toDetail = (r: Raw): PaymentAccountDetail => ({
  id: r.id,
  accountName: r.account_name,
  bankName: r.bank_name,
  accountNumber: r.account_number,
  iban: r.iban,
  accountNumberMasked: maskIdentifier(r.account_number),
  ibanMasked: maskIdentifier(r.iban),
  swiftCode: r.swift_code,
  currency: r.currency.trim(),
  isActive: r.is_active,
  isDefault: r.is_default_for_currency === true,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/** `null` = not a platform admin. Lists never carry the full identifiers. */
export async function listPaymentAccounts(): Promise<readonly PaymentAccountRow[] | null> {
  const authority = await requirePlatformAdmin();
  if (!authority.ok) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("payment_accounts").select(SELECT).order("is_active", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error("payment_accounts_read_failed");
  return ((data ?? []) as Raw[]).map((row) => {
    const { accountNumber: _n, iban: _i, ...masked } = toDetail(row);
    void _n;
    void _i;
    return masked;
  });
}

export async function getPaymentAccount(accountId: string): Promise<PaymentAccountDetail | null> {
  const authority = await requirePlatformAdmin();
  if (!authority.ok || !/^[0-9a-f-]{36}$/i.test(accountId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("payment_accounts").select(SELECT).eq("id", accountId).maybeSingle();
  if (error) throw new Error("payment_accounts_read_failed");
  return data ? toDetail(data as Raw) : null;
}

/** Whether the CALLER may write (the DB `WITH CHECK` is `is_super_admin()`), so the page can say so instead of offering a form that the database refuses. */
export async function canWritePaymentAccounts(): Promise<boolean> {
  return (await requireSuperAdmin()).ok;
}

export async function createPaymentAccount(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = PaymentAccountFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .insert({ account_name: parsed.data.accountName, bank_name: parsed.data.bankName, account_number: parsed.data.accountNumber, iban: parsed.data.iban?.toUpperCase() ?? null, swift_code: parsed.data.swiftCode?.toUpperCase() ?? null, currency: parsed.data.currency, is_active: parsed.data.isActive, created_by: authority.userId })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapSystemError(error) };
  return saved(data.id);
}

export async function updatePaymentAccount(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = PaymentAccountUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .update({ account_name: parsed.data.accountName, bank_name: parsed.data.bankName, account_number: parsed.data.accountNumber, iban: parsed.data.iban?.toUpperCase() ?? null, swift_code: parsed.data.swiftCode?.toUpperCase() ?? null, currency: parsed.data.currency, is_active: parsed.data.isActive })
    .eq("id", parsed.data.accountId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  return saved(data.id);
}

/* ═══════════════ Feature 018 — default USD account and checkout readiness ═══════════════ */

/**
 * Whether checkout can issue bank-transfer instructions. Derived ONLY from the existing `payment_accounts` rows (no second
 * bank system): exactly one active USD account may be the default, and it must carry an account number or an IBAN.
 * Already-issued proformas keep the bank snapshot they were issued with; only NEW issuance reads the current default.
 */
export type BankReadiness =
  | { state: "READY"; accountId: string; bankName: string; accountName: string }
  | { state: "MISSING_DEFAULT" }
  | { state: "DEFAULT_INACTIVE"; accountId: string }
  | { state: "INCOMPLETE"; accountId: string; bankName: string };

export function evaluateBankReadiness(rows: readonly PaymentAccountRow[]): BankReadiness {
  const current = rows.find((row) => row.isDefault && row.currency === "USD");
  if (!current) return { state: "MISSING_DEFAULT" };
  if (!current.isActive) return { state: "DEFAULT_INACTIVE", accountId: current.id };
  if (!current.ibanMasked && !current.accountNumberMasked) return { state: "INCOMPLETE", accountId: current.id, bankName: current.bankName };
  return { state: "READY", accountId: current.id, bankName: current.bankName, accountName: current.accountName };
}

export type BankDefaultErrorCode = "AUTH_REQUIRED" | "NOT_CAPABLE" | "MFA_REQUIRED" | "VALIDATION" | "NOT_FOUND" | "REQUEST_CONFLICT" | "CONFLICT" | "FAILED" | "OUTCOME_UNKNOWN";
export type BankDefaultResult = { ok: true; data: { accountId: string; alreadyDefault: boolean } } | { ok: false; code: BankDefaultErrorCode };

const SetDefaultInput = z.object({ accountId: z.string().uuid(), requestId: z.string().uuid() });

type RpcError = { code?: unknown; message?: unknown } | null | undefined;
const hasToken = (error: RpcError, token: string) => typeof error?.message === "string" && new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`).test(error.message);

/** Maps the existing `set_default_payment_account` failures to stable typed codes (never database text). */
export function classifyBankDefaultError(error: RpcError): BankDefaultErrorCode {
  if (hasToken(error, "mfa_step_up_required")) return "MFA_REQUIRED";
  if (hasToken(error, "forbidden")) return "NOT_CAPABLE";
  if (hasToken(error, "payment_account_not_found")) return "NOT_FOUND";
  if (hasToken(error, "request_id_conflict") || hasToken(error, "request_payload_conflict")) return "REQUEST_CONFLICT";
  const state = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  // A concurrent default change racing on the partial unique index (`uq_payment_account_default_currency`).
  if (state === "23505" || state === "40001" || state === "40P01") return "CONFLICT";
  return /^[0-9A-Z]{5}$/.test(state) ? "FAILED" : "OUTCOME_UNKNOWN";
}

/**
 * Choose the default USD account through the EXISTING Feature 013 routine (Platform Admin + MFA enforced by the database;
 * Super Admin remains the only role that can create/edit accounts). The routine is request-bound, so a retry with the same
 * key is a safe replay.
 */
export async function setDefaultPaymentAccount(input: unknown): Promise<BankDefaultResult> {
  const parsed = SetDefaultInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALIDATION" };
  const access = await checkRoleFunctionAccess("is_platform_admin");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? "AUTH_REQUIRED" : access.denial === "mfa-step-up" ? "MFA_REQUIRED" : "NOT_CAPABLE" };
  try {
    const supabase = await createClient();
    const { data: before } = await supabase.from("payment_accounts").select("is_default_for_currency").eq("id", parsed.data.accountId).maybeSingle();
    const { error } = await supabase.rpc("set_default_payment_account", { p_account_id: parsed.data.accountId, p_request_id: parsed.data.requestId });
    if (error) return { ok: false, code: classifyBankDefaultError(error) };
    return { ok: true, data: { accountId: parsed.data.accountId, alreadyDefault: before?.is_default_for_currency === true } };
  } catch {
    return { ok: false, code: "OUTCOME_UNKNOWN" };
  }
}
