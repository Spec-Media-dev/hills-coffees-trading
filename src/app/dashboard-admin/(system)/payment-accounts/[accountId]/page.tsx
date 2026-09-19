import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { paymentAccountFields } from "@/components/admin/system/fields";
import { ActiveBadge, HighRiskNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { SystemNotFound, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { canWritePaymentAccounts, getPaymentAccount } from "@/lib/admin/payment-accounts";
import { savePaymentAccount } from "@/src/app/dashboard-admin/(system)/payment-accounts/actions";

/**
 * Feature 010 RUN F (T029) — one payment account: platform admins see the full identifiers
 * read-only; super admins get the edit form. High-risk / OPS-01 notices always shown.
 */
export default async function PaymentAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const access = await checkAreaAccess("paymentAccounts");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { accountId } = await params;
  const [account, canWrite] = await Promise.all([getPaymentAccount(accountId), canWritePaymentAccounts()]);
  const trail = systemTrail((c) => c.admin.system.paymentAccounts.breadcrumb, "/dashboard-admin/payment-accounts", (c) => c.admin.system.forms.paymentAccount.editTitle);
  if (!account) return <SystemNotFound title={(c) => c.admin.system.forms.paymentAccount.editTitle} trail={trail} backHref="/dashboard-admin/payment-accounts" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={account.accountName} description={account.bankName} trail={trail} actions={<ActiveBadge isActive={account.isActive} />} />
      <HighRiskNotice />
      <section className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 text-[length:var(--text-small)]" data-payment-account={account.id}>
        <dl className="divide-y divide-border">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.system.common.created} />
            </dt>
            <dd>
              <AdminDateTime value={account.createdAt} fallback="—" />
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.system.common.createdBy} />
            </dt>
            <dd className="font-mono text-[length:var(--text-micro)]" dir="ltr">
              {account.createdBy}
            </dd>
          </div>
        </dl>
      </section>
      {canWrite ? (
        <RecordForm resource="system" copyKey="paymentAccount" mode="edit" formKey="payment-account" fields={paymentAccountFields(account)} hiddenFields={{ accountId: account.id }} action={savePaymentAccount} />
      ) : (
        <section className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 text-[length:var(--text-small)]" data-payment-accounts-read-only>
          <p className="mb-3 text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.system.paymentAccounts.readOnlyForAdmin} />
          </p>
          <dl className="divide-y divide-border font-mono" dir="ltr">
            <div className="flex justify-between gap-4 py-2"><dt className="font-sans text-muted-foreground"><AppBilingual pick={(c) => c.admin.system.fields.accountNumber} /></dt><dd>{account.accountNumber ?? "—"}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="font-sans text-muted-foreground"><AppBilingual pick={(c) => c.admin.system.fields.iban} /></dt><dd>{account.iban ?? "—"}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="font-sans text-muted-foreground"><AppBilingual pick={(c) => c.admin.system.fields.swiftCode} /></dt><dd>{account.swiftCode ?? "—"}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="font-sans text-muted-foreground"><AppBilingual pick={(c) => c.admin.system.fields.currency} /></dt><dd>{account.currency}</dd></div>
          </dl>
        </section>
      )}
      <NoDeleteNote />
    </div>
  );
}
