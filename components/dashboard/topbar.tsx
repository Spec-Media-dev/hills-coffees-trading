"use client";

import Link from "next/link";
import { useState } from "react";

import { LogoutConfirmDialog } from "@/components/account/logout-confirm-dialog";
import { UserAvatar } from "@/components/account/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { useLocale } from "@/components/locale/locale-provider";

/**
 * Feature 004 T006 — the Member Portal topbar's two genuinely new pieces: an account menu and the
 * reserved (inert) notifications entry. Both are passed into the EXISTING, shared
 * `AppShell`/`Topbar` (Phase 5.5) via its `topbarActions` prop — this file does not rebuild the
 * sticky header itself. Acting-organization display already exists (`AppShell`'s `identitySubtitle`,
 * wired in `src/app/dashboard/layout.tsx`); nothing new was needed for that part of T006.
 */

/**
 * A narrow client island, the same shape as the public site's `components/account/account-menu.tsx`
 * (reused directly for its avatar/dropdown/sign-out pieces — `UserAvatar`, `DropdownMenu*`,
 * `LogoutConfirmDialog` — rather than rebuilt) but scoped to the dashboard: no "Go to Dashboard" /
 * "Operations console" links, because the caller is already inside `/dashboard`. Presentation only —
 * `LogoutConfirmDialog` calls the real `signOut` Server Action; this component decides nothing about
 * authorization.
 */
export function DashboardAccountMenu({
  displayName,
  organizationName,
}: {
  /**
   * Raw `fullName`/`companyName`, or `null` when neither is set — the "Account" fallback is
   * resolved HERE, client-side via `tApp`, not pre-baked server-side, so it renders in the
   * viewer's actual locale (RUN B fix — see `dashboardAccount.fallbackName`'s doc comment).
   */
  displayName: string | null;
  organizationName: string | null;
}) {
  const { t, tApp } = useLocale();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const resolvedName = displayName ?? tApp.dashboardAccount.fallbackName;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t.account.menuLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-[box-shadow] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <UserAvatar displayName={resolvedName} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <div className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{resolvedName}</span>
            {organizationName ? <span className="truncate text-xs text-muted-foreground">{organizationName}</span> : null}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/dashboard/settings/" />}>
            <Icon name="settings" />
            {tApp.settings}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setLogoutDialogOpen(true)}>
            <Icon name="log-out" />
            {t.account.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogoutConfirmDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen} />
    </>
  );
}

/**
 * Reserved notification entry (FR-016). Notification DELIVERY belongs to Feature 012 and is blocked
 * on DB-BLOCK-04 (no mechanism yet to create or mark a notification read) — this control exists so
 * the topbar's final visual position is correct now, without fabricating behaviour ahead of it:
 *
 * - no unread count (there is no notification data to count)
 * - no dropdown content (there is nothing real to show in one)
 * - no mark-read action (no approved mechanism exists)
 * - no polling (nothing to poll)
 *
 * `disabled` + a truthful, localized `aria-label` ("Notifications aren't available yet") is the
 * established disabled-control pattern this project already uses elsewhere (e.g. `FileUpload`'s
 * `disabled:opacity-[0.45]`) — an inert control that clearly LOOKS and IS unavailable, not a broken
 * live one.
 */
export function DashboardNotificationsButton() {
  const { tApp } = useLocale();

  return (
    <IconButton
      type="button"
      variant="outline"
      disabled
      aria-label={`${tApp.notifications.label} — ${tApp.notifications.unavailable}`}
    >
      <Icon name="bell" className="size-[18px]" />
    </IconButton>
  );
}

export function DashboardTopbarActions({
  displayName,
  organizationName,
}: {
  displayName: string | null;
  organizationName: string | null;
}) {
  return (
    <>
      <DashboardNotificationsButton />
      <DashboardAccountMenu displayName={displayName} organizationName={organizationName} />
    </>
  );
}
