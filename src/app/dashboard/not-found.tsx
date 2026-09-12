import Link from "next/link";

import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

/**
 * Feature 005 RUN B — dashboard-scoped `not-found.tsx` (Next.js route-segment convention).
 *
 * Reused by any future `/dashboard/*` dynamic route calling `notFound()` (currently
 * `/dashboard/inventory/[positionId]`) — not built as an inventory-specific page, since a "position
 * not found" and any future "X not found" case share the exact same requirement: never leak
 * cross-tenant existence, and never bounce a signed-in member out to the public marketing site's own
 * `src/app/not-found.tsx` (which renders `PublicShell`, not `AppShell`, and would lose the dashboard
 * nav/sidebar entirely). Because Next.js renders the nearest `not-found.tsx` up the segment tree
 * while keeping ancestor layouts mounted, this renders INSIDE the already-authorized `AppShell` from
 * `dashboard/layout.tsx` — sidebar and topbar stay intact.
 *
 * Deliberately generic copy ("not found"), not "position not found" — a shared boundary component
 * should not assume which resource type triggered it.
 */
export default function DashboardNotFound() {
  return (
    <div className="hc-container flex min-h-[60vh] flex-1 items-center justify-center py-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-xs)]">
        <span className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-[var(--surface-subtle)] text-foreground" aria-hidden="true">
          <Icon name="alert-circle" className="size-6" />
        </span>
        <h1 className="hc-heading-3 font-semibold text-foreground">
          <AppBilingual pick={(c) => c.inventory.notFound.title} />
        </h1>
        <p className="mt-3 text-base leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.inventory.notFound.description} />
        </p>
        <div className="mt-6">
          <Button variant="outline" render={<Link href="/dashboard/inventory" />}>
            <AppBilingual pick={(c) => c.inventory.notFound.backAction} />
          </Button>
        </div>
      </div>
    </div>
  );
}
