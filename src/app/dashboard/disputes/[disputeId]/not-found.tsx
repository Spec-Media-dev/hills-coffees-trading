import Link from "next/link";

import { AppBilingual } from "@/components/locale/app-bilingual";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Feature 012 RUN D (T023) — the dispute detail's own not-found state. Without it the shared
 * `/dashboard` not-found (Feature 005's "Position not found… Back to inventory") rendered for a
 * missing or cross-organization dispute. One message covers both cases deliberately — "doesn't exist
 * or isn't available to your organization" — so nothing reveals whether another organization's
 * dispute exists (SEC-001). Same visual treatment as the shared dashboard not-found.
 */
export default function DisputeNotFound() {
  return (
    <div data-slot="dispute-not-found" className="hc-container flex min-h-[60vh] flex-1 items-center justify-center py-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-xs)]">
        <span className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-[var(--surface-subtle)] text-foreground" aria-hidden="true">
          <Icon name="alert-circle" className="size-6" />
        </span>
        <h1 className="hc-heading-3 font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.notFound.title} />
        </h1>
        <p className="mt-3 text-base leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.notFound.description} />
        </p>
        <div className="mt-6">
          {/* A real link (not a Button rendered as `<a role="button">`), styled as the outline button. */}
          <Link href="/dashboard/disputes" className={buttonVariants({ variant: "outline" })}>
            <AppBilingual pick={(c) => c.disputes.detail.notFound.backAction} />
          </Link>
        </div>
      </div>
    </div>
  );
}
