import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { setActingOrganization } from "@/lib/auth/eligibility";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 003 T028 — the always-available acting-organization switcher for a multi-org member.
 * Rendered only when `identity.organizations.length > 1` (see `settings/page.tsx`) — a single-org
 * member has nothing to switch between, so this component is never shown for them at all.
 *
 * REUSES `setActingOrganization` (`lib/auth/eligibility.ts`, T002) — the SAME safe mechanism
 * `OrganizationSelector` already uses for the "you must choose" flow: each button's Server Action is
 * bound to a specific, already-server-resolved `organizationId` from `identity.organizations`
 * (never a raw id read back from client input), and `setActingOrganization` itself re-verifies that
 * id against this request's own fresh membership list before writing the acting-organization cookie.
 * No new switching mechanism, no client-side "current org" state to go stale — switching redirects
 * back to `/dashboard/settings/`, which re-resolves identity (and therefore org-scoped agreement/
 * contact/membership context) fresh on the very next request.
 */
export function ActingOrganizationSwitcher({
  organizations,
  currentOrganizationId,
}: {
  organizations: readonly OrganizationMembership[];
  currentOrganizationId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.actingOrganization.title} />
        </h2>
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.actingOrganization.lead} />
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {organizations.map((organization) => {
          const isCurrent = organization.organizationId === currentOrganizationId;
          return (
            <li key={organization.organizationId} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
              <span className="min-w-0 truncate font-medium text-foreground">{organization.displayName}</span>
              {isCurrent ? (
                <span className="hc-meta shrink-0 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-3 py-1 font-semibold text-foreground">
                  <AppBilingual pick={(c) => c.actingOrganization.current} />
                </span>
              ) : (
                <form action={setActingOrganization.bind(null, organization.organizationId, "/dashboard/settings/")}>
                  <Button type="submit" variant="outline" size="sm">
                    {organization.displayName}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
