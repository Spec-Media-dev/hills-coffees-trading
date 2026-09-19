import type { ReactNode } from "react";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { CorrelationId } from "@/components/audit/correlation-id";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";

/**
 * Feature 012 RUN C (T014) — THE shared read-only history timeline (order, listing, account status
 * history; ownership events).
 *
 * READ-ONLY BY CONSTRUCTION (SC-008): the props below are the component's ENTIRE surface — data and
 * labels only. There is no `onEdit`/`onDelete`/`onCorrect`/`onSelect`/`action`/`href` prop, no
 * callback of any kind, and no button or form is ever rendered. A disabled button would still be a
 * mutation affordance; here there is simply nothing to disable.
 *
 * ONLY WHAT IS STORED (FR-010/FR-016): `title` and `occurredAt` always exist in the source tables
 * (`new_status`/`event_type`, `created_at` are NOT NULL). `actor`, `reason` and `correlationId` are
 * optional: a caller omits a field its table does not store (e.g. status histories have no
 * correlation column — none is shown), and `actor: "not-recorded"` states a genuinely NULL
 * `changed_by` rather than hiding it. `reason` is untrusted text (`UntrustedText`, inert).
 *
 * Accessibility: an ordered list (chronology is meaningful) named by its visible heading; each entry's time is a
 * real `<time>`; nothing is focusable because nothing is interactive — screen-reader list navigation
 * is the keyboard path. Logical properties/`dir` only, so it mirrors correctly in RTL.
 */
export type HistoryActor = "you" | "other" | "not-recorded";

export type HistoryTimelineEntry = {
  readonly id: string;
  readonly occurredAt: string;
  readonly title: ReactNode;
  readonly details?: ReactNode;
  readonly actor?: HistoryActor;
  readonly reason?: string | null;
  readonly correlationId?: string | null;
};

export type HistoryTimelineProps = {
  readonly entries: readonly HistoryTimelineEntry[];
  /** `id` of the visible heading that names this list — `aria-labelledby`, so the name follows the page language. */
  readonly labelledBy: string;
  /** Shown instead of the list when `entries` is empty; defaults to the shared "no history" copy. */
  readonly emptyMessage?: ReactNode;
};

const ACTOR_COPY: Readonly<Record<HistoryActor, AppCopySelector>> = {
  you: (c) => c.history.byYou,
  other: (c) => c.history.byOther,
  "not-recorded": (c) => c.history.byNotRecorded,
};

export function HistoryTimeline({ entries, labelledBy, emptyMessage }: HistoryTimelineProps) {
  if (entries.length === 0) {
    return (
      <p data-slot="history-empty" className="text-[length:var(--text-small)] text-muted-foreground">
        {emptyMessage ?? <AppBilingual pick={(c) => c.history.empty} />}
      </p>
    );
  }

  return (
    <ol data-slot="history-timeline" aria-labelledby={labelledBy} className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} data-slot="history-entry" className="flex min-w-0 flex-col gap-1.5 border-s-2 border-border ps-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[length:var(--text-small)] font-semibold text-foreground">{entry.title}</span>
            <span className="text-[length:var(--text-micro)] text-muted-foreground">
              <AdminDateTime value={entry.occurredAt} fallback="—" />
            </span>
          </div>
          {entry.details ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-small)] text-muted-foreground">{entry.details}</div> : null}
          {entry.actor ? (
            <p data-slot="history-actor" className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.history.byLabel} />: <AppBilingual pick={ACTOR_COPY[entry.actor]} />
            </p>
          ) : null}
          {entry.reason ? (
            <div data-slot="history-reason" className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[length:var(--text-micro)] text-muted-foreground">
                <AppBilingual pick={(c) => c.history.reasonLabel} />
              </span>
              <UntrustedText value={entry.reason} slot="history-reason-text" />
            </div>
          ) : null}
          {entry.correlationId ? (
            <p className="flex min-w-0 flex-wrap gap-x-1.5 text-[length:var(--text-micro)] text-muted-foreground">
              <span>
                <AppBilingual pick={(c) => c.history.correlationLabel} />:
              </span>
              <CorrelationId value={entry.correlationId} />
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Maps a stored `changed_by` to the viewer-relative actor — never exposes the profile id itself. */
export function actorFor(changedBy: string | null, viewerUserId: string): HistoryActor {
  if (changedBy === null) return "not-recorded";
  return changedBy === viewerUserId ? "you" : "other";
}
