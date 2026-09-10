"use client";

import Link from "next/link";
import { useState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";

import { LogoutConfirmDialog } from "./logout-confirm-dialog";
import { UserAvatar } from "./user-avatar";

export type AccountMenuProps = {
  /** Presentation-safe only — `profile.fullName` or a generic fallback. Never raw identity/rows. */
  displayName: string;
  /** Shown under the name if present (spec §26 — safe profile data only, never fetched broader). */
  organizationName: string | null;
  showMemberDashboard: boolean;
  showAdminConsole: boolean;
};

/**
 * The authenticated Header account trigger (Feature 003, user-requested Header integration —
 * §21–§28). A NARROW client island: it receives only presentation-safe strings/booleans as props
 * (never `RequestIdentity`, never a membership row) from the Server Component `SiteHeader`, which
 * resolved them once via `getRequestIdentity()`.
 *
 * Hover opens the menu (`openOnHover`) because the user explicitly asked for that, but it is
 * additive: `DropdownMenuTrigger`'s underlying `Menu.Trigger` (Base UI) always supports click and
 * keyboard (Enter/Space) activation regardless of `openOnHover` — this is not a hover-only menu.
 *
 * Menu visibility here is PRESENTATION ONLY (spec §28): the "Dashboard"/"Operations console" links
 * are ordinary `<Link>`s to routes that independently re-verify authorization server-side
 * (`src/app/dashboard/layout.tsx`, `src/app/dashboard-admin/layout.tsx`) — this menu grants nothing
 * by existing or by being hidden.
 */
export function AccountMenu({ displayName, organizationName, showMemberDashboard, showAdminConsole }: AccountMenuProps) {
  const { t } = useLocale();
  const copy = t.account;
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          openOnHover
          delay={150}
          aria-label={copy.menuLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-[box-shadow] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <UserAvatar displayName={displayName} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <div className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
            {organizationName ? <span className="truncate text-xs text-muted-foreground">{organizationName}</span> : null}
          </div>
          <DropdownMenuSeparator />
          {showMemberDashboard ? (
            <DropdownMenuItem render={<Link href="/dashboard/" />}>
              <Icon name="layout-grid" />
              {copy.dashboard}
            </DropdownMenuItem>
          ) : null}
          {showAdminConsole ? (
            <DropdownMenuItem render={<Link href="/dashboard-admin/" />}>
              <Icon name="shield" />
              {copy.adminConsole}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setLogoutDialogOpen(true)}
          >
            <Icon name="log-out" />
            {copy.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogoutConfirmDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen} />
    </>
  );
}
