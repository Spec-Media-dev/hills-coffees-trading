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
 * ATTRIBUTION — `created_by` on INSERT only (no `updated_by`, no audit trigger): recorded gap (D2 ii).
 * NO HARD DELETE — retirement is `is_active = false`. Identifiers are shown masked in lists.
 */

export type PaymentAccountRow = { id: string; accountName: string; bankName: string; accountNumberMasked: string | null; ibanMasked: string | null; swiftCode: string | null; currency: string; isActive: boolean; createdBy: string; createdAt: string };
export type PaymentAccountDetail = PaymentAccountRow & { accountNumber: string | null; iban: string | null };

const SELECT = "id, account_name, bank_name, account_number, iban, swift_code, currency, is_active, created_by, created_at";
type Raw = { id: string; account_name: string; bank_name: string; account_number: string | null; iban: string | null; swift_code: string | null; currency: string; is_active: boolean; created_by: string; created_at: string };

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
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/** `null` = not a platform admin. Lists never carry the full identifiers. */
export async function listPaymentAccounts(): Promise<readonly PaymentAccountRow[] | null> {
  const authority = await requirePlatformAdmin();
  if (!authority.ok) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("payment_accounts").select(SELECT).order("is_active", { ascending: false }).order("created_at", { ascending: false }).limit(200);
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
  const { data } = await supabase.from("payment_accounts").select(SELECT).eq("id", accountId).maybeSingle();
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
