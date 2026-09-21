import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { PriceNotes, PriceSection, UtcInstant, YesNo, publicStateOf } from "@/components/admin/catalogue/price-parts";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { listPriceDifferentials, listPriceObservations, listPriceSources, type PriceDifferentialRow, type PriceObservationRow, type PriceSourceRow } from "@/lib/admin/prices";

/**
 * Feature 010 T049 — reference-price administration overview: every source (whatever its licence state — this is the
 * admin view), the newest observations and every differential, read fresh under the operator's own session. The
 * "Public" column restates Feature 011's display gate (APPROVED + active) for orientation only; it decides nothing.
 */
export default async function PricesPage() {
  const access = await checkAreaAccess("prices");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let data: { sources: readonly PriceSourceRow[]; observations: readonly PriceObservationRow[]; differentials: readonly PriceDifferentialRow[] } | null = null;
  try {
    const [sources, observations, differentials] = await Promise.all([listPriceSources(), listPriceObservations(), listPriceDifferentials()]);
    data = { sources, observations, differentials };
  } catch {
    data = null;
  }

  const sourceColumns = [
    {
      key: "source",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.source} />,
      render: (row: PriceSourceRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.code}
          </span>
        </span>
      ),
    },
    { key: "type", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.type} />, render: (row: PriceSourceRow) => <AppBilingual pick={(c) => (c.admin.catalogue.prices.vocab.sourceType as Record<string, string>)[row.sourceType] ?? row.sourceType} /> },
    { key: "licence", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.licence} />, render: (row: PriceSourceRow) => <span data-licence-status={row.licenceStatus}><AppBilingual pick={(c) => (c.admin.catalogue.prices.vocab.licenceStatus as Record<string, string>)[row.licenceStatus] ?? row.licenceStatus} /></span> },
    { key: "active", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.active} />, render: (row: PriceSourceRow) => <YesNo value={row.isActive} /> },
    { key: "public", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.publicStatus} />, render: (row: PriceSourceRow) => <span data-public-state={publicStateOf(row)}><AppBilingual pick={(c) => c.admin.catalogue.prices.publicStates[publicStateOf(row)]} /></span> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.open} />,
      render: (row: PriceSourceRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/prices/sources/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.open} />
        </Button>
      ),
    },
  ];

  const observationColumns = [
    {
      key: "source",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.source} />,
      render: (row: PriceObservationRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.sourceName ?? row.sourceId}</span>
          <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.symbol}
          </span>
        </span>
      ),
    },
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

  const differentialColumns = [
    {
      key: "differential",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.differential} />,
      render: (row: PriceDifferentialRow) => <AppBilingual pick={(c) => (c.admin.catalogue.prices.vocab.differentialType as Record<string, string>)[row.differentialType] ?? row.differentialType} />,
    },
    {
      key: "amount",
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.amount} />,
      render: (row: PriceDifferentialRow) => (
        <span className="font-mono tabular-nums" dir="ltr" data-stored-value={row.amount}>
          {row.amount} {row.currency}/{row.unit}
        </span>
      ),
    },
    {
      key: "scope",
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.scope} />,
      render: (row: PriceDifferentialRow) => (row.coffeeName ?? row.originName ?? (row.lotId ? <AppBilingual pick={(c) => c.admin.catalogue.prices.scopeLot} /> : <AppBilingual pick={(c) => c.admin.catalogue.prices.scopeGeneral} />)),
    },
    {
      key: "period",
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.period} />,
      render: (row: PriceDifferentialRow) => (
        <span className="flex flex-wrap gap-1">
          <UtcInstant value={row.effectiveFrom} />
          <span aria-hidden="true">→</span>
          {row.effectiveUntil ? <UtcInstant value={row.effectiveUntil} /> : <AppBilingual pick={(c) => c.admin.catalogue.prices.openEnded} />}
        </span>
      ),
    },
    { key: "active", header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.active} />, render: (row: PriceDifferentialRow) => <YesNo value={row.isActive} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.open} />,
      render: (row: PriceDifferentialRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/prices/differentials/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.prices.columns.open} />
        </Button>
      ),
    },
  ];

  const emptyCard = (key: "sources" | "observations" | "differentials") => (
    <AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.prices.empty[key].title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.prices.empty[key].description} />} />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.prices.title} />}
        description={<AppBilingual pick={(c) => c.admin.catalogue.prices.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.breadcrumb} /> }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/prices/sources/new" />}>
              <AppBilingual pick={(c) => c.admin.catalogue.prices.newSource} />
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/prices/differentials/new" />}>
              <AppBilingual pick={(c) => c.admin.catalogue.prices.newDifferential} />
            </Button>
          </div>
        }
      />
      <PriceNotes notes={["noConversionNote", "noDeleteNote"]} />
      {data === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <>
          <PriceSection id="price-sources" title={<AppBilingual pick={(c) => c.admin.catalogue.prices.sections.sources} />}>
            <TableCardList columns={sourceColumns} rows={data.sources} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.prices.captions.sources} emptyState={emptyCard("sources")} />
          </PriceSection>
          <PriceSection id="price-observations" title={<AppBilingual pick={(c) => c.admin.catalogue.prices.sections.observations} />}>
            <TableCardList columns={observationColumns} rows={data.observations} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.prices.captions.observations} emptyState={emptyCard("observations")} />
          </PriceSection>
          <PriceSection id="price-differentials" title={<AppBilingual pick={(c) => c.admin.catalogue.prices.sections.differentials} />}>
            <TableCardList columns={differentialColumns} rows={data.differentials} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.prices.captions.differentials} emptyState={emptyCard("differentials")} />
          </PriceSection>
        </>
      )}
    </div>
  );
}
