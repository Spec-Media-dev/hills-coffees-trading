"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { CoffeeWorkflowState } from "@/lib/admin/catalogue";

import { Ltr, StepSection, useWorkflowCopy } from "./workflow-shared";

/**
 * Feature 018 — backing stock. Lists REAL Hills inventory for this Coffee (`list_catalogue_backing_positions`) and lets the
 * operator pick one position to back an offer. It can never create, edit or reserve stock: when nothing exists the step says
 * so and hands off to the Warehouse. The Coffee itself stays saved either way.
 */
const kg = (value: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

export function InventoryStep({ workflow, selectedPositionId, onSelect, locale }: { workflow: CoffeeWorkflowState; selectedPositionId: string | null; onSelect: (positionId: string) => void; locale: string }) {
  const copy = useWorkflowCopy();
  const t = copy.inventory;
  const positions = workflow.positions;

  return (
    <StepSection heading={t.heading} lead={t.lead}>
      {positions === null ? (
        <InlineAlert tone="danger" title={t.unavailable} />
      ) : positions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-6" data-inventory-empty>
          <Icon name="package" className="size-6 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{t.emptyTitle}</h3>
          <p className="max-w-[60ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{t.emptyBody}</p>
          <Link href="/dashboard-admin/inventory" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t.handoff}
            <Icon name="arrow-right" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <p className="text-[length:var(--text-small)] text-muted-foreground">{t.selectFirst}</p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-inventory-list>
            {positions.map((position) => {
              const selected = position.positionId === selectedPositionId;
              const blocked = !position.eligible;
              return (
                <li key={position.positionId} data-position-id={position.positionId} data-selected={selected ? "true" : undefined} className={`flex min-w-0 flex-col gap-3 rounded-[var(--radius-md)] border p-4 transition-[border-color,box-shadow] duration-[var(--dur-fast)] ${selected ? "border-primary shadow-[var(--shadow-focus)]" : "border-border"} bg-[var(--surface-card)]`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[length:var(--text-micro)] text-muted-foreground">{t.lot}</p>
                      <p className="truncate font-semibold text-foreground"><Ltr>{position.lotCode}</Ltr></p>
                    </div>
                    <span className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold ${blocked ? "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]" : "bg-[var(--status-paid-surface)] text-[var(--status-paid)]"}`}>
                      {blocked ? t.notEligible : t.eligible}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[length:var(--text-small)]">
                    <div><dt className="text-[length:var(--text-micro)] text-muted-foreground">{t.warehouse}</dt><dd className="text-foreground">{position.warehouseName}</dd></div>
                    <div><dt className="text-[length:var(--text-micro)] text-muted-foreground">{t.location}</dt><dd className="text-foreground">{position.locationCode ? <Ltr>{position.locationCode}</Ltr> : "—"}</dd></div>
                    <div><dt className="text-[length:var(--text-micro)] text-muted-foreground">{t.tradable}</dt><dd className="text-foreground"><Ltr>{kg(position.tradableKg, locale)} kg</Ltr></dd></div>
                    <div><dt className="text-[length:var(--text-micro)] text-muted-foreground">{copy.offer.reserved}</dt><dd className="text-foreground"><Ltr>{kg(position.reservedKg, locale)} kg</Ltr></dd></div>
                  </dl>
                  {position.held ? <p className="text-[length:var(--text-micro)] text-[var(--status-danger)]">{t.held}</p> : null}
                  {position.existingOfferId ? <p className="text-[length:var(--text-micro)] text-muted-foreground">{t.hasOffer}</p> : null}
                  <Button type="button" size="sm" variant={selected ? "primary" : "outline"} disabled={blocked} aria-pressed={selected} onClick={() => onSelect(position.positionId)}>
                    {selected ? (<><Icon name="check" aria-hidden="true" />{t.selected}</>) : t.select}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </StepSection>
  );
}
