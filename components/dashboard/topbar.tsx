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
import { useLocale } from "@/components/locale/locale-provider";

/**
 * Feature 004 T006 — the Member Portal topbar's two genuinely new pieces: an account menu and the
 * notifications entry (inert until Feature 012 RUN B T012 linked it to `/dashboard/notifications`). Both are passed into the EXISTING, shared
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
  avatarPath,
  organizationName,
}: {
  /** `profiles.avatar_path`, resolved per request; absent/null renders initials. */
  avatarPath?: string | null;
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
          <UserAvatar displayName={resolvedName} avatarPath={avatarPath} />
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
 * Notification entry (Feature 004 FR-016, updated by Feature 014 T011).
 * Displays bell icon with dynamic unread count badge when unreadCount > 0.
 * Respects LTR/RTL layout via logical start/end positioning.
 */
export function DashboardNotificationsButton({ unreadCount = 0 }: { unreadCount?: number }) {
  const { tApp } = useLocale();

  const countDisplay = unreadCount > 99 ? "99+" : String(unreadCount);
  const ariaLabel =
    unreadCount > 0
      ? tApp.notifications.unreadCountAria.replace("{count}", String(unreadCount))
      : tApp.notifications.label;

  return (
    // A real link (not a Button rendered as `<a role="button">`), styled like the outline icon button.
    <Link
      href="/dashboard/notifications/"
      aria-label={ariaLabel}
      data-slot="notifications-entry"
      className="relative grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-foreground transition-[background-color] duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <Icon name="bell" className="size-[18px]" />
      {unreadCount > 0 && (
        <span
          data-slot="unread-badge"
          aria-hidden="true"
          className="absolute -top-1.5 -end-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-bold text-white shadow-sm"
        >
          {countDisplay}
        </span>
      )}
    </Link>
  );
}

export function DashboardTopbarActions({
  displayName,
  avatarPath,
  organizationName,
  unreadCount = 0,
}: {
  displayName: string | null;
  avatarPath?: string | null;
  organizationName: string | null;
  unreadCount?: number;
}) {
  return (
    <>
      <DashboardNotificationsButton unreadCount={unreadCount} />
      <DashboardAccountMenu displayName={displayName} avatarPath={avatarPath} organizationName={organizationName} />
    </>
  );
}
