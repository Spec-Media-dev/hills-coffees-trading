import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "cn";

/**
 * Feature 010 — a bilingual, inline state card for console routes (forbidden / planned / blocked /
 * unavailable). Same visual language as `components/layout/state-screen.tsx` (which carries
 * English-only defaults), but `title`/`description` are `ReactNode` so callers pass
 * `<AppBilingual …/>` and the card renders real Arabic without becoming a client island.
 *
 * Server Component. A `<div>`, never a `<main>` — the console layout owns the single landmark.
 */
export function AdminStateCard({
  kind,
  icon = "alert-circle",
  title,
  description,
  children,
  className,
}: {
  /** Machine-readable state name, exposed as `data-admin-state` for tests and styling. */
  kind: string;
  icon?: IconName;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div data-admin-state={kind} className={cn("flex min-h-[50vh] flex-1 items-center justify-center py-10", className)}>
      <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-xs)]">
        <span className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-[var(--surface-subtle)] text-foreground" aria-hidden="true">
          <Icon name={icon} className="size-6" />
        </span>
        <h1 className="hc-heading-3 font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-base leading-[var(--lh-body)] text-muted-foreground text-pretty">{description}</p>
        {children ? <div className="mt-6 flex flex-col items-center gap-3">{children}</div> : null}
      </div>
    </div>
  );
}
