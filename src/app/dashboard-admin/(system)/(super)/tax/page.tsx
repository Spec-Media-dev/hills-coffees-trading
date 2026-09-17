import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { ActiveBadge, AttributionGapNotice, FutureOnlyNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { EffectiveWindow, SystemLoadError, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { listTaxRules, resolveInForceTaxRule, type TaxRuleRow } from "@/lib/admin/pricing-rules";

/**
 * Feature 010 RUN F (T028) — tax rules exactly as stored (`tax_rules`, RLS `tax_admin`), with which
 * rule `checkout_order` would select per country right now. Changes affect future snapshots only —
 * stated on every form; nothing here reads or writes `order_financials`.
 */
export default async function TaxRulesPage() {
  const access = await checkAreaAccess("tax");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  let rules: Awaited<ReturnType<typeof listTaxRules>> = null;
  try {
    rules = await listTaxRules();
  } catch {
    rules = null;
  }
  const inForceIds = new Set((rules ?? []).map((rule) => resolveInForceTaxRule(rules ?? [], rule.countryCode)?.id).filter(Boolean));

  const columns = [
    { key: "country", primary: true, header: <AppBilingual pick={(c) => c.admin.system.tax.columns.country} />, render: (row: TaxRuleRow) => <span className="font-mono" dir="ltr">{row.countryCode}</span> },
    { key: "tax", header: <AppBilingual pick={(c) => c.admin.system.tax.columns.tax} />, render: (row: TaxRuleRow) => row.taxName },
    { key: "rate", header: <AppBilingual pick={(c) => c.admin.system.tax.columns.rate} />, render: (row: TaxRuleRow) => <span className="tabular-nums" dir="ltr">{row.ratePercentage}%</span> },
    { key: "base", header: <AppBilingual pick={(c) => c.admin.system.tax.columns.base} />, render: (row: TaxRuleRow) => <AppBilingual pick={(c) => c.admin.system.tax.taxableBases[row.taxableBase] ?? row.taxableBase} /> },
    {
      key: "active",
      header: <AppBilingual pick={(c) => c.admin.system.tax.columns.active} />,
      render: (row: TaxRuleRow) => (
        <span className="flex flex-col gap-1">
          <ActiveBadge isActive={row.isActive} />
          {inForceIds.has(row.id) ? (
            <span className="text-[length:var(--text-micro)] text-muted-foreground" data-tax-in-force={row.id}>
              <AppBilingual pick={(c) => c.admin.system.commission.inForce.winner} />
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "window", header: <AppBilingual pick={(c) => c.admin.system.tax.columns.window} />, render: (row: TaxRuleRow) => <EffectiveWindow from={row.effectiveFrom} until={row.effectiveUntil} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.system.tax.columns.open} />,
      render: (row: TaxRuleRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/tax/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.system.tax.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.system.tax.title} />}
        description={<AppBilingual pick={(c) => c.admin.system.tax.description} />}
        trail={systemTrail((c) => c.admin.system.tax.breadcrumb)}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/tax/new" />}>
            <AppBilingual pick={(c) => c.admin.system.tax.newRule} />
          </Button>
        }
      />
      <FutureOnlyNotice />
      {rules === null ? (
        <SystemLoadError />
      ) : (
        <TableCardList
          columns={columns}
          rows={rules}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.system.tax.caption}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.system.tax.empty.title} />} description={<AppBilingual pick={(c) => c.admin.system.tax.empty.description} />} />}
        />
      )}
      <AttributionGapNotice />
      <NoDeleteNote />
    </div>
  );
}
