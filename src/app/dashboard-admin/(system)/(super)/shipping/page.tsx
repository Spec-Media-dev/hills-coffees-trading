import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { ActiveBadge, NoDeleteNote, ShippingUnconsumedNotice } from "@/components/admin/system/notices";
import { EffectiveWindow, SystemLoadError, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { formatMoney } from "@/lib/dashboard/format";
import { checkAreaAccess } from "@/lib/admin/guards";
import { listShippingRules, type ShippingRuleRow } from "@/lib/admin/pricing-rules";

/**
 * Feature 010 RUN F (T028) — shipping rules exactly as stored (`shipping_rules`, RLS `shipping_admin`).
 * HONEST STATEMENT (top of page): no checkout or shipment path consumes these rows today.
 */
export default async function ShippingRulesPage() {
  const access = await checkAreaAccess("shipping");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  let rules: Awaited<ReturnType<typeof listShippingRules>> = null;
  try {
    rules = await listShippingRules();
  } catch {
    rules = null;
  }

  const columns = [
    { key: "method", primary: true, header: <AppBilingual pick={(c) => c.admin.system.shipping.columns.method} />, render: (row: ShippingRuleRow) => <span className="font-medium text-foreground">{row.deliveryMethod}</span> },
    { key: "country", header: <AppBilingual pick={(c) => c.admin.system.shipping.columns.country} />, render: (row: ShippingRuleRow) => (row.countryCode ? <span className="font-mono" dir="ltr">{row.countryCode}</span> : <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.system.shipping.anyCountry} /></span>) },
    { key: "fee", header: <AppBilingual pick={(c) => c.admin.system.shipping.columns.fee} />, render: (row: ShippingRuleRow) => <span className="tabular-nums" dir="ltr">{formatMoney(row.flatFee, row.currency)}</span> },
    { key: "active", header: <AppBilingual pick={(c) => c.admin.system.shipping.columns.active} />, render: (row: ShippingRuleRow) => <ActiveBadge isActive={row.isActive} /> },
    { key: "window", header: <AppBilingual pick={(c) => c.admin.system.shipping.columns.window} />, render: (row: ShippingRuleRow) => <EffectiveWindow from={row.effectiveFrom} until={row.effectiveUntil} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.system.shipping.columns.open} />,
      render: (row: ShippingRuleRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/shipping/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.system.shipping.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.system.shipping.title} />}
        description={<AppBilingual pick={(c) => c.admin.system.shipping.description} />}
        trail={systemTrail((c) => c.admin.system.shipping.breadcrumb)}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/shipping/new" />}>
            <AppBilingual pick={(c) => c.admin.system.shipping.newRule} />
          </Button>
        }
      />
      <ShippingUnconsumedNotice />
      {rules === null ? (
        <SystemLoadError />
      ) : (
        <TableCardList
          columns={columns}
          rows={rules}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.system.shipping.caption}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.system.shipping.empty.title} />} description={<AppBilingual pick={(c) => c.admin.system.shipping.empty.description} />} />}
        />
      )}
      <NoDeleteNote />
    </div>
  );
}
