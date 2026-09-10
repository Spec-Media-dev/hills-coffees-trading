import { AppBilingual } from "@/components/locale/app-bilingual"
import { Icon } from "@/components/ui/icon"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Honest visual orientation for the two protected overview routes (UIF-H).
 *
 * This is deliberately static foundation content: it does not query business data, manufacture
 * KPIs, or offer actions whose owning workflow has not been implemented. Feature 004 owns member
 * dashboard data and Feature 010 owns operational dashboard data and role-specific work areas.
 */
export function FoundationOverview({ surface }: { surface: "member" | "admin" }) {
  const copy = surface === "member" ? "foundation" : "operations"

  return (
    <section aria-label="Workspace orientation" className="grid gap-4 lg:grid-cols-2">
      <Card className="min-w-0 border-border bg-[var(--surface-card)]">
        <CardHeader>
          <span aria-hidden="true" className="mb-2 inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--forest-100)] text-[var(--forest-700)] dark:bg-[var(--forest-800)] dark:text-[var(--forest-200)]">
            <Icon name="layout-grid" className="size-5" />
          </span>
          <CardTitle className="hc-heading-3">
            <AppBilingual pick={(c) => c.foundationOverview[copy].title} />
          </CardTitle>
          <CardDescription className="max-w-[62ch] leading-[var(--lh-body)]">
            <AppBilingual pick={(c) => c.foundationOverview[copy].description} />
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="min-w-0 border-border bg-[var(--surface-card)]">
        <CardHeader>
          <span aria-hidden="true" className="mb-2 inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--warning-surface)] text-[var(--gold-on-light)] dark:bg-[var(--warning-surface)] dark:text-[var(--gold-on-dark)]">
            <Icon name="badge-check" className="size-5" />
          </span>
          <CardTitle className="hc-heading-3">
            <AppBilingual pick={(c) => c.foundationOverview[copy].currentTitle} />
          </CardTitle>
          <CardDescription className="max-w-[62ch] leading-[var(--lh-body)]">
            <AppBilingual pick={(c) => c.foundationOverview[copy].currentDescription} />
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="min-w-0 border-dashed border-border bg-[var(--surface-subtle)] lg:col-span-2">
        <CardContent className="flex min-w-0 items-start gap-3 pt-(--card-spacing)">
          <Icon name="alert-circle" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.foundationOverview.boundaryTitle} />
            </h2>
            <p className="mt-1 max-w-[72ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.foundationOverview.boundaryDescription} />
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
