"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { CoffeeWorkflowState } from "@/lib/admin/catalogue";
import { publishCatalogueOnlyAction, publishCoordinatedAction } from "@/src/app/dashboard-admin/(catalogue)/coffees/workflow-actions";

import { Ltr, StepSection, useWorkflowAction, useWorkflowCopy, WorkflowNotice, type WorkflowCopy } from "./workflow-shared";
import type { WorkflowStep } from "@/lib/admin/catalogue-validation";

/**
 * Feature 018 — review & publish. Readiness comes from the database (`get_catalogue_readiness`), never from this screen's
 * own bookkeeping, and the same gate re-runs inside the publish routines. Two previews are kept strictly apart:
 * the PUBLIC view (no price, quantity or stock ever) and the PURCHASE view (the selected offer, authorized buyers only).
 * Two publication paths: catalogue-only (no offer needed) and coordinated Coffee + APPROVED offer (both or neither).
 */
const REQUIREMENT_STEP: Record<string, WorkflowStep> = {
  english_name: "identity", english_description: "identity", arabic_name: "arabic", arabic_description: "arabic",
  origin_missing: "taxonomy", origin_inactive: "taxonomy", primary_image: "media",
};
const REQUIREMENTS = ["english_name", "english_description", "arabic_name", "arabic_description", "origin_missing", "origin_inactive", "primary_image"] as const;

function ReadinessChecklist({ workflow, goTo, copy }: { workflow: CoffeeWorkflowState; goTo: (step: WorkflowStep) => void; copy: WorkflowCopy }) {
  const r = copy.readiness;
  const missing = new Set(workflow.readiness?.missing ?? []);
  if (!workflow.readiness) return <InlineAlert tone="danger" title={copy.errors.SAVE_FAILED} />;
  return (
    <div className="flex flex-col gap-3" data-readiness={workflow.readiness.ready ? "ready" : "not-ready"}>
      <p role="status" className={`inline-flex w-fit items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1 text-[length:var(--text-small)] font-semibold ${workflow.readiness.ready ? "bg-[var(--status-paid-surface)] text-[var(--status-paid)]" : "bg-[var(--status-pending-surface)] text-[var(--status-pending)]"}`}>
        <Icon name={workflow.readiness.ready ? "badge-check" : "clock"} className="size-4" aria-hidden="true" />
        {workflow.readiness.ready ? r.ready : r.notReady}
      </p>
      <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-md)] border border-border">
        {REQUIREMENTS.filter((key) => key !== "origin_inactive" || !missing.has("origin_missing")).map((key) => {
          const done = !missing.has(key);
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-requirement={key} data-done={done ? "true" : "false"}>
              <span className="flex items-center gap-2 text-[length:var(--text-small)] text-foreground">
                <Icon name={done ? "check" : "circle-x"} className={`size-4 ${done ? "text-[var(--status-paid)]" : "text-[var(--status-danger)]"}`} aria-hidden="true" />
                {r.items[key]}
                <span className="sr-only">: {done ? r.done : r.missing}</span>
              </span>
              {!done ? <Button type="button" variant="text" size="sm" onClick={() => goTo(REQUIREMENT_STEP[key] ?? "identity")}>{r.goTo}</Button> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PublicPreview({ workflow, copy }: { workflow: CoffeeWorkflowState; copy: WorkflowCopy }) {
  const p = copy.preview;
  const { coffee, media, arabic } = workflow;
  const primary = media.find((row) => row.isPrimary && row.imageUrl) ?? null;
  const origin = workflow.options.origins.find((row) => row.id === coffee.originId);
  const arabicSaved = arabic && arabic !== "unavailable" && arabic.name ? arabic : null;
  return (
    <div className="flex flex-col gap-3" data-preview="public">
      <header>
        <h3 className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{p.publicHeading}</h3>
        <p className="text-[length:var(--text-small)] text-muted-foreground">{p.publicLead}</p>
      </header>
      <article className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)]">
        <div className="relative aspect-[4/3] w-full bg-[var(--surface-subtle)]">
          {primary?.imageUrl ? <Image src={primary.imageUrl} alt="" fill sizes="(min-width: 1024px) 320px, 90vw" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[length:var(--text-small)] text-muted-foreground">{p.imageMissing}</div>}
          {coffee.status !== "PUBLISHED" ? <span className="absolute start-3 top-3 rounded-[var(--radius-pill)] bg-[var(--status-draft-surface)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold text-[var(--status-draft)]">{p.notPublic}</span> : null}
        </div>
        <div className="flex flex-col gap-2 p-4">
          {origin ? <p className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wide text-muted-foreground">{origin.name}</p> : null}
          <h4 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground" dir="ltr" lang="en">{coffee.name || p.unnamed}</h4>
          {coffee.description ? <p className="line-clamp-4 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" dir="ltr" lang="en">{coffee.description}</p> : null}
          {arabicSaved ? (
            <div className="mt-1 border-t border-border pt-3" dir="rtl" lang="ar">
              <p className="font-semibold text-foreground">{arabicSaved.name}</p>
              {arabicSaved.description ? <p className="line-clamp-3 text-[length:var(--text-small)] text-muted-foreground">{arabicSaved.description}</p> : null}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function PurchasePreview({ workflow, copy, locale }: { workflow: CoffeeWorkflowState; copy: WorkflowCopy; locale: string }) {
  const p = copy.preview;
  const offer = workflow.offers.find((row) => !["ARCHIVED", "SOLD_OUT"].includes(row.status)) ?? null;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const available = offer ? Math.max(0, offer.quantityKg - offer.reservedKg - offer.filledKg) : 0;
  return (
    <div className="flex flex-col gap-3" data-preview="purchase">
      <header>
        <h3 className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{p.purchaseHeading}</h3>
        <p className="text-[length:var(--text-small)] text-muted-foreground">{p.purchaseLead}</p>
      </header>
      {offer ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-4">
          <p className="text-[length:var(--text-small)] text-foreground">{offer.title || workflow.coffee.name}</p>
          <p className="font-heading text-[length:var(--text-h3)] font-semibold text-foreground"><Ltr>USD {number.format(offer.priceUsdPerKg)}</Ltr> <span className="text-[length:var(--text-small)] font-normal text-muted-foreground">{p.perKg}</span></p>
          <p className="text-[length:var(--text-small)] text-muted-foreground"><Ltr>{number.format(available)} kg</Ltr> {p.available}</p>
          <p className="text-[length:var(--text-micro)] text-muted-foreground"><Ltr>{offer.code}</Ltr> · {(copy.statuses.offer as Record<string, string>)[offer.status] ?? offer.status}</p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5 text-[length:var(--text-small)] text-muted-foreground">{p.noOffer}</div>
      )}
    </div>
  );
}

type PublishKind = "catalogue" | "coordinated";

export function ReadinessPanel({ workflow, goTo, onSaved, locale }: { workflow: CoffeeWorkflowState; goTo: (step: WorkflowStep) => void; onSaved: () => void; locale: string }) {
  const copy = useWorkflowCopy();
  const t = copy.publish;
  const [confirming, setConfirming] = useState<PublishKind | null>(null);
  const catalogue = useWorkflowAction({ action: publishCatalogueOnlyAction, success: (_r, c) => c.toasts.publishedCatalogue, onSuccess: onSaved });
  const coordinated = useWorkflowAction({ action: publishCoordinatedAction, success: (_r, c) => c.toasts.publishedCoordinated, onSuccess: onSaved });
  const { coffee } = workflow;
  const ready = workflow.readiness?.ready === true;
  const published = coffee.status === "PUBLISHED";
  const approved = workflow.offers.find((offer) => offer.status === "APPROVED") ?? null;
  const pending = catalogue.pending || coordinated.pending;

  const run = (kind: PublishKind) => {
    const data = new FormData();
    data.set("coffeeId", coffee.id);
    data.set("revision", String(coffee.revision));
    if (kind === "coordinated" && approved) {
      data.set("offerId", approved.id);
      data.set("offerRevision", String(approved.revision));
      coordinated.submit(data);
    } else {
      catalogue.submit(data);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StepSection heading={copy.readiness.heading} lead={copy.readiness.lead}>
        <ReadinessChecklist workflow={workflow} goTo={goTo} copy={copy} />
      </StepSection>

      <StepSection heading={copy.previewLabel}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PublicPreview workflow={workflow} copy={copy} />
          <PurchasePreview workflow={workflow} copy={copy} locale={locale} />
        </div>
      </StepSection>

      <StepSection heading={t.heading}>
        {published ? (
          <div className="flex flex-wrap items-center gap-3">
            <InlineAlert tone="success" title={t.alreadyPublished} className="min-w-0 flex-1" />
            <Link href={`/coffee/${coffee.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {copy.common.openPublic}
              <Icon name="external-link" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-4">
              <h3 className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{t.catalogueOnlyTitle}</h3>
              <p className="text-[length:var(--text-small)] text-muted-foreground">{t.catalogueOnlyBody}</p>
              {!ready ? <p className="text-[length:var(--text-micro)] text-muted-foreground">{t.blockedBy}</p> : null}
              <Button type="button" disabled={!ready || pending} data-state={catalogue.pending ? "loading" : undefined} onClick={() => setConfirming("catalogue")}>{catalogue.pending ? copy.common.saving : t.catalogueOnlyTitle}</Button>
            </div>
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-4">
              <h3 className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{t.coordinatedTitle}</h3>
              <p className="text-[length:var(--text-small)] text-muted-foreground">{t.coordinatedBody}</p>
              {!approved ? <p className="text-[length:var(--text-micro)] text-muted-foreground">{t.needsApproved}</p> : null}
              <Button type="button" variant="secondary" disabled={!ready || !approved || pending} data-state={coordinated.pending ? "loading" : undefined} onClick={() => setConfirming("coordinated")}>{coordinated.pending ? copy.common.saving : t.coordinatedTitle}</Button>
              <p className="text-[length:var(--text-micro)] text-muted-foreground">{t.handoffCompliance}</p>
            </div>
          </div>
        )}
        <WorkflowNotice result={catalogue.state} requestId={catalogue.requestId} coffeeId={coffee.id} />
        <WorkflowNotice result={coordinated.state} requestId={coordinated.requestId} coffeeId={coffee.id} />
      </StepSection>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirming === "coordinated" ? t.confirmBodyCoordinated : t.confirmBodyCatalogue}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const kind = confirming; setConfirming(null); if (kind) run(kind); }}>{t.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
