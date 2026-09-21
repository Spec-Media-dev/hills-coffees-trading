import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { priceObservationFields, priceSourceFields } from "@/components/admin/catalogue/price-fields";
import { PriceNotes, PriceSection, UtcInstant, YesNo, publicStateOf } from "@/components/admin/catalogue/price-parts";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getPriceSource, listPriceObservations, type PriceObservationRow } from "@/lib/admin/prices";
import { savePriceObservation, savePriceSource } from "@/src/app/dashboard-admin/(catalogue)/prices/actions";

/**
 * Feature 010 T049 — one price source: edit its details (incl. licence status and activity — the public display gate),
 * see its observations newest first, and record a new observation (append-only).
 */
export default async function PriceSourceDetailPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const access = await checkAreaAccess("prices");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { sourceId } = await params;
  const source = /^[0-9a-f-]{36}$/i.test(sourceId) ? await getPriceSource(sourceId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.breadcrumb} />, href: "/dashboard-admin/prices" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceSource.editTitle} /> }];
  if (!source) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceSource.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/prices" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  const observations = await listPriceObservations({ sourceId: source.id });
  const columns = [
    { key: "symbol", primary: true, header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.symbol} />, render: (row: PriceObservationRow) => <span className="font-mono" dir="ltr">{row.symbol}</span> },
    { key: "commodity", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.commodity} />, render: (row: PriceObservationRow) => <AppBilingual pick={(c) => (c.admin.catalogue.prices.vocab.commodity as Record<string, string>)[row.commodityType] ?? row.commodityType} /> },
    {
      key: "value",
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.value} />,
      render: (row: PriceObservationRow) => (
        <span className="font-mono tabular-nums" dir="ltr" data-stored-value={row.rawValue}>
          {row.rawValue} {row.rawUnit} {row.rawCurrency}
        </span>
      ),
    },
    { key: "observed", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.observedAt} />, render: (row: PriceObservationRow) => <UtcInstant value={row.observedAt} /> },
    { key: "stale", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.stale} />, render: (row: PriceObservationRow) => <YesNo value={row.isStale} /> },
  ];
  const publicState = publicStateOf(source);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={source.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
              {source.code}
            </span>
            <span data-public-state={publicState}>
              <AppBilingual pick={(c) => c.admin.catalogue.prices.publicStates[publicState]} />
            </span>
          </span>
        }
        trail={trail}
      />
      <RecordForm resource="prices" priceForm="priceSource" mode="edit" formKey="price-source" fields={priceSourceFields(source)} hiddenFields={{ sourceId: source.id }} action={savePriceSource} />
      <PriceSection id="source-observations" title={<AppBilingual pick={(c) => c.admin.catalogue.prices.sections.observations} />}>
        <PriceNotes notes={["appendOnlyNote", "noConversionNote"]} />
        <TableCardList
          columns={columns}
          rows={observations}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.catalogue.prices.captions.observations}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.prices.empty.observations.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.prices.empty.observations.description} />} />}
        />
      </PriceSection>
      <RecordForm resource="prices" priceForm="priceObservation" mode="create" formKey="price-observation" fields={priceObservationFields()} hiddenFields={{ sourceId: source.id }} action={savePriceObservation} />
    </div>
  );
}
