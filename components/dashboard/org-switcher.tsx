"use client";

import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 004 T009 — the always-visible acting-organization display/switcher, rendered in the
 * `AppShell`'s `identitySubtitle` slot (`src/app/dashboard/layout.tsx`) so the current organization
 * is obvious on every `/dashboard` page, not only on Settings.
 *
 * REUSES Feature 003's ONLY acting-organization mechanism — `setActingOrganization`
 * (`lib/auth/eligibility.ts`, T002), the SAME Server Action `OrganizationSelector` (the
 * forced "you must choose" screen) and `src/app/dashboard/settings/acting-organization-switcher.tsx`
 * (the full settings-page list) already call. This file adds no second switching implementation —
 * only a third, more COMPACT presentation of the same real mechanism, appropriate for a topbar slot.
 * `setActingOrganization` re-verifies the chosen id against this request's own fresh membership list
 * before writing anything — a tampered/non-membership id is silently refused there, exactly as it
 * already is for the other two presentations (this file does not change that contract).
 *
 * ONE organization (the overwhelmingly common case): a plain text display, no selector at all — "no
 * unnecessary selector" (run directive). MORE than one: a real `Select` — screen readers announce the
 * current selection via `SelectValue`, and choosing a different one calls the same Server Action,
 * which redirects back to wherever the caller currently is (`usePathname()`), so multi-org freshness
 * (identity/eligibility/agreements/modules all re-resolve on the very next request — nothing here is
 * cached) is inherited entirely from `getRequestIdentity()`/`setActingOrganization`, not reimplemented.
 *
 * `switchOrganization` is `setActingOrganization` itself, passed down as a PROP from the Server
 * Component caller (`src/app/dashboard/layout.tsx`) rather than imported here directly — this file
 * is a Client Component, and `lib/auth/eligibility.ts` transitively imports `lib/supabase/server.ts`
 * (`next/headers`), which cannot be bundled into client code. Passing an already-resolved Server
 * Action reference as a prop is the standard, supported way a Client Component invokes one without
 * importing its module graph — Next serializes the reference at the RSC boundary; no second
 * implementation is created here.
 */
export function OrgSwitcher({
  organizations,
  currentOrganizationId,
  switchOrganization,
}: {
  organizations: readonly OrganizationMembership[];
  currentOrganizationId: string;
  switchOrganization: (organizationId: string, redirectTo: string) => Promise<never>;
}) {
  const { tApp } = useLocale();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  if (organizations.length === 0) {
    // Unreachable in production — this component only ever renders inside `AppShell`'s
    // already-eligible branch, which requires a non-null acting organization. No organizations[0]
    // read here either way.
    return null;
  }

  if (organizations.length === 1) {
    // Never `organizations[0]` — found by id, the same id the layout resolved as the acting
    // organization, so a single membership is guaranteed to match its own only entry.
    const current = organizations.find((organization) => organization.organizationId === currentOrganizationId);
    return (
      <span className="truncate text-[length:var(--text-small)] font-medium text-foreground">
        {current?.displayName}
      </span>
    );
  }

  return (
    <Select
      value={currentOrganizationId}
      disabled={isPending}
      onValueChange={(value) => {
        if (typeof value !== "string" || value === currentOrganizationId) return;
        startTransition(() => {
          void switchOrganization(value, pathname || "/dashboard/");
        });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={tApp.dashboardOrgSwitcher.label}
        className="h-auto max-w-[12rem] border-none bg-transparent p-0 text-[length:var(--text-small)] font-medium text-foreground shadow-none hover:border-none data-[size=sm]:h-auto"
      >
        <SelectValue className="truncate">
          {(value: string) => organizations.find((organization) => organization.organizationId === value)?.displayName ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {organizations.map((organization) => (
          <SelectItem key={organization.organizationId} value={organization.organizationId}>
            {organization.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
