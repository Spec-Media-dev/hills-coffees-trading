import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { ActiveBadge, AttributionGapNotice, HighRiskNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { SystemLoadError, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { canWritePaymentAccounts, listPaymentAccounts, type PaymentAccountRow } from "@/lib/admin/payment-accounts";

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

  const columns = [
    { key: "account", primary: true, header: <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.account} />, render: (row: PaymentAccountRow) => <span className="font-medium text-foreground">{row.accountName}</span> },
    { key: "bank", header: <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.bank} />, render: (row: PaymentAccountRow) => row.bankName },
    {
      key: "identifiers",
      header: <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.identifiers} />,
      render: (row: PaymentAccountRow) => (
        <span className="flex flex-col font-mono text-[length:var(--text-micro)]" dir="ltr" data-masked-identifiers>
          <span>{row.ibanMasked ?? "—"}</span>
          <span className="text-muted-foreground">{row.accountNumberMasked ?? "—"}</span>
        </span>
      ),
    },
    { key: "currency", header: <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.currency} />, render: (row: PaymentAccountRow) => <span className="font-mono" dir="ltr">{row.currency}</span> },
    { key: "active", header: <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.active} />, render: (row: PaymentAccountRow) => <ActiveBadge isActive={row.isActive} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.open} />,
      render: (row: PaymentAccountRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/payment-accounts/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.system.paymentAccounts.columns.open} />
        </Button>
      ),
    },
  ];

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
        <TableCardList
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.system.paymentAccounts.caption}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.system.paymentAccounts.empty.title} />} description={<AppBilingual pick={(c) => c.admin.system.paymentAccounts.empty.description} />} />}
        />
      )}
      <p className="text-[length:var(--text-micro)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.system.paymentAccounts.masked} /> <AppBilingual pick={(c) => c.admin.system.paymentAccounts.noMemberPath} />
      </p>
      <AttributionGapNotice />
      <NoDeleteNote />
    </div>
  );
}
