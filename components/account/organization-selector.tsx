import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { setActingOrganization } from "@/lib/auth/eligibility";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * The minimum honest acting-organization choice (Feature 003 T002 — spec §8 "minimum honest UI").
 * Not Phase 7's full membership/switcher view — one plain choice, each option a real, bound Server
 * Action (`setActingOrganization.bind(null, organizationId, redirectTo)`), so no client
 * JavaScript is needed here and no raw organization id is ever read back from client input: each
 * button's action is already closed over its own specific, server-verified organization id.
 *
 * Server Component — this is a plain form-per-option list, nothing here requires interactivity.
 */
export function OrganizationSelector({
  organizations,
  redirectTo,
}: {
  organizations: readonly OrganizationMembership[];
  redirectTo: string;
}) {
  return (
    // A plain `<div>`: rendered only inline in `dashboard/layout.tsx`'s
    // `requiresOrganizationSelection` branch, which already supplies the page's `<main>` landmark.
    <div className="hc-container flex min-h-[60vh] flex-1 items-center justify-center py-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-xs)]">
        <h1 className="hc-heading-3 font-semibold text-foreground">
          <AppBilingual pick={(c) => c.organizationSelection.title} />
        </h1>
        <p className="mt-3 text-base leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.organizationSelection.description} />
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {organizations.map((organization) => (
            <form key={organization.organizationId} action={setActingOrganization.bind(null, organization.organizationId, redirectTo)}>
              <Button type="submit" variant="outline" className="w-full justify-between">
                {organization.displayName}
              </Button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
