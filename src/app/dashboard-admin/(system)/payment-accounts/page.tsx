import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { PaymentAccountList } from "@/components/admin/payment-accounts/payment-account-list";
import { HighRiskNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { SystemLoadError, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { checkAreaAccess } from "@/lib/admin/guards";
import { canWritePaymentAccounts, evaluateBankReadiness, listPaymentAccounts } from "@/lib/admin/payment-accounts";

/**
 * Feature 010 RUN F (T029) — Hills' payment accounts. READ area `is_platform_admin()` (the task's
 * literal); WRITE requires a super admin (the database's own `WITH CHECK`), stated on the page for
 * an ADMIN. High-risk / OPS-01 notices are always shown; identifiers are masked in the list. No
 * member or public route reaches this data.
 */
export default async function PaymentAccountsPage() {
  const access = await checkAreaAccess("paymentAccounts");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let rows: Awaited<ReturnType<typeof listPaymentAccounts>> = null;
  const canWrite = await canWritePaymentAccounts();
  try {
    rows = await listPaymentAccounts();
  } catch {
    rows = null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.system.paymentAccounts.title} />}
        description={<AppBilingual pick={(c) => c.admin.system.paymentAccounts.description} />}
        trail={systemTrail((c) => c.admin.system.paymentAccounts.breadcrumb)}
        actions={
          canWrite ? (
            <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/payment-accounts/new" />}>
              <AppBilingual pick={(c) => c.admin.system.paymentAccounts.newAccount} />
            </Button>
          ) : null
        }
      />
      <HighRiskNotice />
      {!canWrite ? (
        <p data-payment-accounts-read-only className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.system.paymentAccounts.readOnlyForAdmin} />
        </p>
      ) : null}
      {rows === null ? (
        <SystemLoadError />
      ) : (
        <PaymentAccountList rows={rows} readiness={evaluateBankReadiness(rows)} canSetDefault />
      )}
      <p className="text-[length:var(--text-micro)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.system.paymentAccounts.masked} /> <AppBilingual pick={(c) => c.admin.system.paymentAccounts.noMemberPath} />
      </p>
      <NoDeleteNote />
    </div>
  );
}
