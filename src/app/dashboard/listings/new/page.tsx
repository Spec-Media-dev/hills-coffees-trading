import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getInventoryPositions } from "@/lib/inventory/positions";
import { checkListingEligibility } from "@/lib/listings/eligibility";

import { ListingCreateForm, type PositionOption } from "./listing-create-form";

export const metadata: Metadata = {
  title: "Create listing",
};

const PICKER_PAGE_SIZE = 50;

/**
 * Feature 006 RUN B (T013) — the seller listing-creation page.
 *
 * SECURITY: re-verifies identity AND seller capability server-side, independently of nav visibility
 * (Phase 6/T020 — module registration — is NOT this run's scope; a buyer-only organization reaching
 * this URL directly is refused here, before any inventory/eligibility read, exactly as the run
 * directive requires "security cannot wait for nav hiding").
 *
 * For each of the acting organization's own inventory positions, this page probes
 * `checkListingEligibility` with `requestedQuantityKg: 0` — low enough that the INSUFFICIENT_QUANTITY
 * branch can never spuriously fire, so every OTHER refusal reason (or `eligible: true` with the real
 * authoritative `eligibleQuantityKg`) is revealed for the picker. The actual requested quantity is
 * re-verified for real, server-side, by `createListingDraft` at submission — this probe is display
 * only, never trusted as the final check.
 */
export default async function CreateListingPage() {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }
  if (!identity.organization.canSell) {
    return (
      <StateScreen
        kind="forbidden"
        title={appCopy.listings.new.capabilityRequired.title}
        description={appCopy.listings.new.capabilityRequired.description}
      />
    );
  }

  const organizationId = identity.organization.organizationId;
  const canSell = identity.organization.canSell;

  const { rows: positionRows } = await getInventoryPositions({ organizationId, pageSize: PICKER_PAGE_SIZE });

  const positions: PositionOption[] = await Promise.all(
    positionRows.map(async (position): Promise<PositionOption> => {
      const eligibility = await checkListingEligibility({ organizationId, canSell, positionId: position.id, requestedQuantityKg: 0 });
      const base = {
        positionId: position.id,
        lotCode: position.lot?.lotCode ?? null,
        coffeeName: position.lot?.coffeeName ?? null,
        warehouseName: position.warehouse?.name ?? null,
        availableQuantityKg: position.availableQuantityKg,
        reservedQuantityKg: position.reservedQuantityKg,
      };
      return eligibility.eligible
        ? { ...base, eligible: true, eligibleQuantityKg: eligibility.eligibleQuantityKg }
        : { ...base, eligible: false, reason: eligibility.reason, eligibleQuantityKg: eligibility.eligibleQuantityKg };
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.listings.new.title} />}
        description={<AppBilingual pick={(c) => c.listings.new.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.listings.new.breadcrumb} /> }]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          <AppBilingual pick={(c) => c.listings.new.picker.heading} />
        </h2>
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.listings.new.picker.description} />
        </p>
      </section>

      {positions.length === 0 ? (
        <EmptyState title={appCopy.listings.new.picker.empty.title} description={appCopy.listings.new.picker.empty.description} />
      ) : (
        <ListingCreateForm positions={positions} />
      )}
    </div>
  );
}
