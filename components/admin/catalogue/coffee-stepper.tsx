"use client";

import { useCallback, useMemo, useState } from "react";

import { Presence } from "@/components/motion/presence";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { CoffeeWorkflowState } from "@/lib/admin/catalogue";
import { WORKFLOW_STEPS, type WorkflowStep } from "@/lib/admin/catalogue-validation";

import { ArabicStep, IdentityStep, TaxonomyStep } from "./coffee-content-steps";
import { InventoryStep } from "./coffee-inventory-step";
import { MediaStep } from "./coffee-media-step";
import { OfferStep } from "./coffee-offer-step";
import { ReadinessPanel } from "./coffee-readiness-panel";
import { Ltr } from "./workflow-shared";

/**
 * Feature 018 — the resumable Coffee stepper. Step completion is DERIVED from the stored record (name/slug/description,
 * saved Arabic, active origin, primary image, offer, publication), never from client memory, so a reload, another device
 * or another operator shows the same truth. The current step lives in `?step=` so a link resumes exactly where you were.
 * Layout: a vertical rail on large screens; a horizontally scrollable pill row (inside its own container, never the page) on small ones.
 * Motion: one opacity cross-fade between steps (existing `Presence`) and a CSS width transition on the progress bar - both
 * disabled under reduced motion.
 */
type StepState = "done" | "attention" | "todo" | "current";

function deriveStates(workflow: CoffeeWorkflowState): Record<WorkflowStep, "done" | "attention" | "todo"> {
  const { coffee, arabic, media, offers, readiness, positions } = workflow;
  const origin = workflow.options.origins.find((row) => row.id === coffee.originId);
  const arabicDone = Boolean(arabic && arabic !== "unavailable" && arabic.name && arabic.description);
  const hasPrimary = media.some((row) => row.isPrimary && row.imageUrl);
  const offer = offers.find((row) => !["ARCHIVED", "SOLD_OUT"].includes(row.status));
  return {
    identity: coffee.name && coffee.slug && coffee.description ? "done" : "attention",
    arabic: arabicDone ? "done" : "attention",
    taxonomy: origin && origin.status === "ACTIVE" ? "done" : coffee.originId ? "attention" : "attention",
    media: hasPrimary ? "done" : media.length > 0 ? "attention" : "todo",
    inventory: offer ? "done" : positions && positions.length > 0 ? "todo" : "attention",
    offer: offer ? "done" : "todo",
    readiness: coffee.status === "PUBLISHED" ? "done" : readiness?.ready ? "todo" : "attention",
  };
}

export function CoffeeStepper({ workflow, initialStep }: { workflow: CoffeeWorkflowState; initialStep?: string }) {
  const { tApp, locale } = useLocale();
  const copy = tApp.admin.catalogue.workflow;
  const [step, setStep] = useState<WorkflowStep>(() => (WORKFLOW_STEPS as readonly string[]).includes(initialStep ?? "") ? (initialStep as WorkflowStep) : "identity");
  const [positionId, setPositionId] = useState<string | null>(null);
  const states = useMemo(() => deriveStates(workflow), [workflow]);

  const goTo = useCallback((next: WorkflowStep) => {
    setStep(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("step", next);
      window.history.replaceState(null, "", url);
    } catch {
      /* the in-memory step still works; only deep-linking is skipped */
    }
  }, []);

  const index = WORKFLOW_STEPS.indexOf(step);
  const next = WORKFLOW_STEPS[index + 1];
  const previous = WORKFLOW_STEPS[index - 1];
  const advance = useCallback(() => { if (next) goTo(next); }, [goTo, next]);
  const stay = useCallback(() => undefined, []);
  const doneCount = WORKFLOW_STEPS.filter((key) => states[key] === "done").length;
  const stateOf = (key: WorkflowStep): StepState => (key === step ? "current" : states[key]);
  const stateLabel = (state: StepState) => (state === "current" ? copy.stepState.current : state === "done" ? copy.stepState.done : state === "attention" ? copy.stepState.attention : copy.stepState.todo);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]" data-coffee-stepper data-step={step}>
      <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-h,4rem)+1rem)] lg:self-start">
        <div className="mb-3 flex items-center justify-between gap-3 text-[length:var(--text-micro)] text-muted-foreground">
          <span className="truncate font-semibold text-foreground" dir="ltr" lang="en">{workflow.coffee.name}</span>
          <span className="shrink-0"><Ltr>{doneCount}/{WORKFLOW_STEPS.length}</Ltr></span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]" role="presentation">
          <div className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)] motion-reduce:transition-none" style={{ width: `${(doneCount / WORKFLOW_STEPS.length) * 100}%` }} />
        </div>
        <nav aria-label={copy.stepperLabel} className="min-w-0">
          <ol className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {WORKFLOW_STEPS.map((key, position) => {
              const state = stateOf(key);
              const label = copy.steps[key];
              return (
                <li key={key} className="shrink-0 snap-start lg:shrink">
                  <button
                    type="button"
                    onClick={() => goTo(key)}
                    aria-current={key === step ? "step" : undefined}
                    data-step-key={key}
                    data-step-state={states[key]}
                    className={`group flex w-full min-w-[11rem] items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-start transition-[background-color,border-color] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] lg:min-w-0 ${key === step ? "border-primary bg-[var(--surface-card)] shadow-[var(--shadow-xs)]" : "border-transparent hover:bg-[var(--surface-subtle)]"}`}
                  >
                    <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-[length:var(--text-micro)] font-semibold ${states[key] === "done" ? "border-[var(--status-paid)] bg-[var(--status-paid-surface)] text-[var(--status-paid)]" : states[key] === "attention" ? "border-[var(--status-pending)] bg-[var(--status-pending-surface)] text-[var(--status-pending)]" : "border-border text-muted-foreground"}`}>
                      {states[key] === "done" ? <Icon name="check" className="size-3.5" /> : <Ltr>{position + 1}</Ltr>}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[length:var(--text-small)] font-semibold text-foreground">{label.label}</span>
                      <span className="truncate text-[length:var(--text-micro)] text-muted-foreground">{label.hint}</span>
                      <span className="sr-only">{stateLabel(state)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <Presence presenceKey={step}>
          <div data-step-panel={step} className="min-w-0">
            {step === "identity" ? <IdentityStep workflow={workflow} onSaved={advance} /> : null}
            {step === "arabic" ? <ArabicStep workflow={workflow} onSaved={advance} /> : null}
            {step === "taxonomy" ? <TaxonomyStep workflow={workflow} onSaved={advance} /> : null}
            {step === "media" ? <MediaStep workflow={workflow} onSaved={stay} /> : null}
            {step === "inventory" ? <InventoryStep workflow={workflow} selectedPositionId={positionId} locale={locale} onSelect={(id) => { setPositionId(id); goTo("offer"); }} /> : null}
            {step === "offer" ? <OfferStep workflow={workflow} selectedPositionId={positionId} onSaved={stay} goToInventory={() => goTo("inventory")} /> : null}
            {step === "readiness" ? <ReadinessPanel workflow={workflow} goTo={goTo} onSaved={stay} locale={locale} /> : null}
          </div>
        </Presence>
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="text" disabled={!previous} onClick={() => previous && goTo(previous)}>
            <Icon name="arrow-left" aria-hidden="true" />
            {copy.common.back}
          </Button>
          <Button type="button" variant="outline" disabled={!next} onClick={() => next && goTo(next)}>
            {copy.common.next}
            <Icon name="arrow-right" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
