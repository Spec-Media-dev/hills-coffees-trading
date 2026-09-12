import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { AvailabilityBreakdown } from "@/components/inventory/availability-breakdown";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Separator } from "@/components/ui/separator";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getAvailabilityBreakdown } from "@/lib/inventory/availability";
import { getInventoryPositionById } from "@/lib/inventory/positions";

export const metadata: Metadata = {
  title: "Position",
};

/**
 * Feature 005 RUN B (T008) — single-position detail.
 *
 * PRIVACY (run directive "not-found/unauthorized privacy"): `getInventoryPositionById` is org-scoped
 * exactly like the list (`.eq("owner_organization_id", organizationId)`), so a position that does not
 * exist and a position owned by a different tenant return the identical `null` — this page calls
 * `notFound()` for both with no branching that could reveal which case occurred. `notFound()`
 * renders the nearest `not-found.tsx` up the tree (`src/app/dashboard/not-found.tsx`), staying inside
 * the authenticated `AppShell` rather than bouncing to the public site's 404.
 */
export default async function InventoryPositionDetailPage({
  params,
}: {
  params: Promise<{ positionId: string }>;
}) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { positionId } = await params;
  const organizationId = identity.organization.organizationId;

  const position = await getInventoryPositionById({ organizationId, positionId });
  if (!position) notFound();

  const [breakdown] = await getAvailabilityBreakdown({ organizationId, positionIds: [position.id] });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={position.lot?.lotCode ?? <AppBilingual pick={(c) => c.inventory.detail.title} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.inventory.detail.breadcrumb} />, href: "/dashboard/inventory" },
          { label: position.lot?.lotCode ?? <AppBilingual pick={(c) => c.inventory.detail.title} /> },
        ]}
      />

      <div className="flex flex-col gap-8 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <section className="flex flex-col gap-3">
          <h2 className="hc-heading-4 font-semibold text-foreground">
            <AppBilingual pick={(c) => c.inventory.detail.lotHeading} />
          </h2>
          {position.lot ? (
            <dl className="flex flex-col border-t border-border">
              {position.lot.coffeeName ? (
                <Row label={<AppBilingual pick={(c) => c.inventory.list.columns.lot} />} value={position.lot.coffeeName} />
              ) : null}
              {position.lot.cropYear ? <Row label={<AppBilingual pick={(c) => c.inventory.detail.lotHeading} />} value={position.lot.cropYear} /> : null}
              {position.lot.qualityGrade ? <Row label={<AppBilingual pick={(c) => c.inventory.detail.lotHeading} />} value={position.lot.qualityGrade} /> : null}
            </dl>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-4">
              <p className="font-medium text-foreground">
                <AppBilingual pick={(c) => c.inventory.detail.lotUnavailable.title} />
              </p>
              <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.inventory.detail.lotUnavailable.description} />
              </p>
            </div>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <h2 className="hc-heading-4 font-semibold text-foreground">
            <AppBilingual pick={(c) => c.inventory.detail.warehouseHeading} />
          </h2>
          {position.warehouse ? (
            <p className="text-foreground">
              {position.warehouse.name}
              {position.warehouse.city ? ` · ${position.warehouse.city}` : ""}
              {position.warehouse.locationName ? ` · ${position.warehouse.locationName}` : ""}
            </p>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.inventory.detail.warehouseUnavailable} />
            </p>
          )}
        </section>

        <Separator />

        {breakdown ? <AvailabilityBreakdown breakdown={breakdown} /> : null}

        <p className="text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
          {position.createdAt} · {position.updatedAt}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-[length:var(--text-small)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
