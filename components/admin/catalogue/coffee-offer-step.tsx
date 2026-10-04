"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import type { CoffeeWorkflowState, WorkflowOffer } from "@/lib/admin/catalogue";
import { createOfferAction, saveOfferAction, setFeaturedAction } from "@/src/app/dashboard-admin/(catalogue)/coffees/workflow-actions";

import { fieldMessage, Ltr, StepSection, useWorkflowAction, useWorkflowCopy, WorkflowNotice } from "./workflow-shared";

/**
 * Feature 018 — offer commercials and Featured. An offer is created ONLY from an explicitly selected real position; price is
 * USD per kg and the quantity cannot exceed the backing stock (re-checked by the database under lock). Review and approval
 * stay with Compliance: this step only edits DRAFT/REJECTED offers and links to the review queue for the rest.
 * Featured is independent of publication, and is its own revisioned, idempotent operation.
 */
const EDITABLE = new Set(["DRAFT", "REJECTED"]);

function OfferForm({ workflow, offer, positionId, onSaved }: { workflow: CoffeeWorkflowState; offer: WorkflowOffer | null; positionId: string | null; onSaved: () => void }) {
  const { coffee } = workflow;
  const create = useWorkflowAction({ action: createOfferAction, success: (_r, c) => c.toasts.offerCreated, onSuccess: onSaved });
  const save = useWorkflowAction({ action: saveOfferAction, success: (_r, c) => c.toasts.offerSaved, onSuccess: onSaved });
  const active = offer ? save : create;
  const copy = active.copy;
  const t = copy.offer;
  const [clientErrors, setClientErrors] = useState<{ price?: string; quantity?: string }>({});
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const price = Number(data.get("priceUsdPerKg"));
    const quantity = Number(data.get("quantityKg"));
    const errors: { price?: string; quantity?: string } = {};
    if (!Number.isFinite(price) || price <= 0) errors.price = copy.validation.PRICE_INVALID;
    if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = copy.validation.QUANTITY_INVALID;
    setClientErrors(errors);
    if (errors.price || errors.quantity) return;
    active.submit(data);
  };
  const stockMessage = (code: string | undefined) => (code === "STOCK_INSUFFICIENT" ? copy.errors.STOCK_INSUFFICIENT : undefined);
  const failure = active.state && !active.state.ok ? active.state : undefined;
  const position = workflow.positions?.find((row) => row.positionId === positionId) ?? null;

  return (
    <form key={`${offer?.id ?? "new"}-${offer?.revision ?? 0}`} onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-workflow-form={offer ? "offer-save" : "offer-create"}>
      <input type="hidden" name="coffeeId" value={coffee.id} />
      {offer ? (
        <>
          <input type="hidden" name="offerId" value={offer.id} />
          <input type="hidden" name="revision" value={offer.revision} />
        </>
      ) : (
        <>
          <input type="hidden" name="revision" value={coffee.revision} />
          <input type="hidden" name="positionId" value={positionId ?? ""} />
        </>
      )}
      {position ? <p className="text-[length:var(--text-small)] text-muted-foreground">{workflow.positions ? `${position.warehouseName} · ` : ""}<Ltr>{position.lotCode}</Ltr> · <Ltr>{position.tradableKg} kg</Ltr></p> : null}
      <FieldGroup>
        <Field
          label={t.price}
          hint={t.priceHint}
          error={clientErrors.price ?? fieldMessage(copy, active.state, "priceUsdPerKg") ?? (failure?.code === "OFFER_INVALID" ? copy.errors.OFFER_INVALID : undefined)}
          control={<Input name="priceUsdPerKg" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" className="font-mono" required defaultValue={offer ? String(offer.priceUsdPerKg) : ""} />}
        />
        <Field
          label={t.quantity}
          hint={t.quantityHint}
          error={clientErrors.quantity ?? fieldMessage(copy, active.state, "quantityKg") ?? stockMessage(failure?.code)}
          control={<Input name="quantityKg" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" className="font-mono" required defaultValue={offer ? String(offer.quantityKg) : ""} />}
        />
        <Field className="md:col-span-2" label={t.title} error={fieldMessage(copy, active.state, "title")} control={<Input name="title" maxLength={200} defaultValue={offer?.title ?? ""} />} />
      </FieldGroup>
      <WorkflowNotice result={active.state} requestId={active.requestId} coffeeId={coffee.id} />
      <FormActionBar className="bg-[var(--surface-card)]">
        <Button type="submit" disabled={active.pending || (!offer && !positionId)} data-state={active.pending ? "loading" : undefined}>
          {active.pending ? copy.common.saving : offer ? t.saveChanges : t.create}
        </Button>
      </FormActionBar>
    </form>
  );
}

export function FeaturedControl({ workflow, onSaved }: { workflow: CoffeeWorkflowState; onSaved: () => void }) {
  const { coffee } = workflow;
  const featured = coffee.featuredAt !== null;
  const { state, pending, submit, requestId, copy } = useWorkflowAction({
    action: setFeaturedAction,
    success: (result, c) => (result.data.featured ? c.toasts.featuredOn : c.toasts.featuredOff),
    onSuccess: onSaved,
  });
  const t = copy.featured;
  const toggle = () => {
    const data = new FormData();
    data.set("coffeeId", coffee.id);
    data.set("revision", String(coffee.revision));
    data.set("enabled", featured ? "false" : "true");
    submit(data);
  };
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] p-4" data-featured-control data-featured={featured ? "true" : "false"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{t.heading}</h3>
          <p className="max-w-[60ch] text-[length:var(--text-small)] text-muted-foreground">{t.lead}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold ${featured ? "bg-[var(--status-paid-surface)] text-[var(--status-paid)]" : "bg-[var(--status-draft-surface)] text-[var(--status-draft)]"}`}>
          {featured ? <Icon name="badge-check" className="size-3.5" aria-hidden="true" /> : null}
          {featured ? t.on : t.off}
        </span>
      </div>
      <div>
        <Button type="button" variant={featured ? "outline" : "secondary"} size="sm" disabled={pending} aria-pressed={featured} data-state={pending ? "loading" : undefined} onClick={toggle}>
          {pending ? copy.common.saving : featured ? t.disable : t.enable}
        </Button>
      </div>
      <WorkflowNotice result={state} requestId={requestId} coffeeId={coffee.id} />
    </div>
  );
}

export function OfferStep({ workflow, selectedPositionId, onSaved, goToInventory }: { workflow: CoffeeWorkflowState; selectedPositionId: string | null; onSaved: () => void; goToInventory: () => void }) {
  const copy = useWorkflowCopy();
  const t = copy.offer;
  const current = workflow.offers.find((offer) => !["ARCHIVED", "SOLD_OUT"].includes(offer.status)) ?? null;
  const editable = current ? EDITABLE.has(current.status) : false;

  return (
    <StepSection heading={t.heading} lead={t.lead}>
      {current ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[length:var(--text-small)]" data-offer-summary>
            <span><span className="text-muted-foreground">{t.code}: </span><Ltr>{current.code}</Ltr></span>
            <span className="inline-flex items-center rounded-[var(--radius-pill)] bg-[var(--status-review-surface)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold text-[var(--status-review)]" data-offer-status={current.status}>
              {(copy.statuses.offer as Record<string, string>)[current.status] ?? current.status}
            </span>
          </div>
          {current.status === "REJECTED" && current.rejectionReason ? <InlineAlert tone="warning" title={t.rejected.replace("{reason}", current.rejectionReason)} /> : null}
          {editable ? (
            <OfferForm workflow={workflow} offer={current} positionId={null} onSaved={onSaved} />
          ) : (
            <>
              <InlineAlert tone="info" title={t.lockedByReview}>
                <p>{t.handoffCompliance}</p>
              </InlineAlert>
              <dl className="grid grid-cols-2 gap-4 text-[length:var(--text-small)] md:grid-cols-3">
                <div><dt className="text-[length:var(--text-micro)] text-muted-foreground">{t.price}</dt><dd><Ltr>{current.priceUsdPerKg}</Ltr></dd></div>
                <div><dt className="text-[length:var(--text-micro)] text-muted-foreground">{t.quantity}</dt><dd><Ltr>{current.quantityKg} kg</Ltr></dd></div>
              </dl>
              <Link href={`/dashboard-admin/listings/${current.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}>
                {t.openReview}
                <Icon name="arrow-right" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      ) : selectedPositionId ? (
        <OfferForm workflow={workflow} offer={null} positionId={selectedPositionId} onSaved={onSaved} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-offer-empty>
          <p className="max-w-[60ch] text-[length:var(--text-small)] text-muted-foreground">{t.noOffer}</p>
          <Button type="button" variant="outline" size="sm" onClick={goToInventory}>{copy.inventory.selectFirst}</Button>
        </div>
      )}
      <FeaturedControl workflow={workflow} onSaved={onSaved} />
    </StepSection>
  );
}
