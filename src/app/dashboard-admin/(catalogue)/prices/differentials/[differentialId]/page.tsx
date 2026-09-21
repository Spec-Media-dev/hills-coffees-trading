import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { priceDifferentialLifecycleFields } from "@/components/admin/catalogue/price-fields";
import { UtcInstant, YesNo } from "@/components/admin/catalogue/price-parts";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getPriceDifferential } from "@/lib/admin/prices";
import { savePriceDifferential } from "@/src/app/dashboard-admin/(catalogue)/prices/actions";

/**
 * Feature 010 T049 — one differential: its fixed facts read-only (type, exact stored amount, currency, unit, scope,
 * effective-from) and a lifecycle form (active flag, effective-until, internal notes).
 */
export default async function PriceDifferentialDetailPage({ params }: { params: Promise<{ differentialId: string }> }) {
  const access = await checkAreaAccess("prices");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { differentialId } = await params;
  const differential = /^[0-9a-f-]{36}$/i.test(differentialId) ? await getPriceDifferential(differentialId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.breadcrumb} />, href: "/dashboard-admin/prices" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceDifferential.editTitle} /> }];
  if (!differential) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceDifferential.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/prices" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  const facts: { key: string; label: React.ReactNode; value: React.ReactNode }[] = [
    { key: "type", label: <AppBilingual pick={(c) => c.admin.catalogue.prices.fields.differentialType} />, value: <AppBilingual pick={(c) => (c.admin.catalogue.prices.vocab.differentialType as Record<string, string>)[differential.differentialType] ?? differential.differentialType} /> },
    {
      key: "amount",
      label: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.amount} />,
      value: (
        <span className="font-mono tabular-nums" dir="ltr" data-stored-value={differential.amount}>
          {differential.amount} {differential.currency}/{differential.unit}
        </span>
      ),
    },
    {
      key: "scope",
      label: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.scope} />,
      value: differential.coffeeName ?? differential.originName ?? (differential.lotId ? <AppBilingual pick={(c) => c.admin.catalogue.prices.scopeLot} /> : <AppBilingual pick={(c) => c.admin.catalogue.prices.scopeGeneral} />),
    },
    { key: "from", label: <AppBilingual pick={(c) => c.admin.catalogue.prices.fields.effectiveFrom} />, value: <UtcInstant value={differential.effectiveFrom} /> },
    { key: "active", label: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.active} />, value: <YesNo value={differential.isActive} /> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => (c.admin.catalogue.prices.vocab.differentialType as Record<string, string>)[differential.differentialType] ?? differential.differentialType} />} trail={trail} />
      <dl className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 sm:grid-cols-2" data-differential-facts>
        {facts.map((fact) => (
          <div key={fact.key} className="flex flex-col gap-0.5">
            <dt className="text-[length:var(--text-micro)] text-muted-foreground">{fact.label}</dt>
            <dd className="text-[length:var(--text-small)] text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <RecordForm resource="prices" priceForm="priceDifferential" mode="edit" formKey="price-differential" fields={priceDifferentialLifecycleFields(differential)} hiddenFields={{ differentialId: differential.id }} action={savePriceDifferential} />
    </div>
  );
}
