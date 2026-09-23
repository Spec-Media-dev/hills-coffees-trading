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
 * Notification entry (Feature 004 FR-016, wired by Feature 012 RUN B T012). It is now a plain link to
 * the honest notification surface (`/dashboard/notifications`) — and still carries:
 *
 * - no unread count or badge (nothing can mark a notification read, and nothing generates one —
 *   DB-BLOCK-04; any number here would be invented)
 * - no dropdown preview, no "needs action" items, no mark-read action
 * - no polling and no client-side notification state
 *
 * It renders only inside the member `AppShell`, which `src/app/dashboard/layout.tsx` reaches solely
 * for an authorized member — the existing dashboard access contract; the target page re-verifies.
 */
export function DashboardNotificationsButton() {
  const { tApp } = useLocale();

  return (
    // A real link (not a Button rendered as `<a role="button">`), styled like the outline icon button.
    <Link
      href="/dashboard/notifications/"
      aria-label={tApp.notifications.label}
      data-slot="notifications-entry"
      className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-foreground transition-[background-color] duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <Icon name="bell" className="size-[18px]" />
    </Link>
  );
}

export function DashboardTopbarActions({
  displayName,
  avatarPath,
  organizationName,
}: {
  displayName: string | null;
  avatarPath?: string | null;
  organizationName: string | null;
}) {
  return (
    <>
      <DashboardNotificationsButton />
      <DashboardAccountMenu displayName={displayName} avatarPath={avatarPath} organizationName={organizationName} />
    </>
  );
}
