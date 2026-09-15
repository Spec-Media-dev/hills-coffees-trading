"use client";

import Link from "next/link";
import { useState } from "react";

import { LogoutConfirmDialog } from "@/components/account/logout-confirm-dialog";
import { UserAvatar } from "@/components/account/user-avatar";
import { useLocale } from "@/components/locale/locale-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { OperationalRole } from "@/lib/auth/types";

/**
 * Feature 010 T003 — the Operations Console topbar account menu. The same narrow client-island
 * shape as the Member Portal's `DashboardAccountMenu` (Feature 004) and the public
 * `AccountMenu` (Feature 003), reusing the SAME pieces — `UserAvatar`, `DropdownMenu*`,
 * `LogoutConfirmDialog` (which calls the real `signOut` Server Action) — rather than a second menu
 * system. It receives only presentation-safe values (a display name or `null`, and the operator's
 * already-attested role list); it never receives `RequestIdentity`, never reads a role itself, and
 * decides nothing about authorization. The "My account" link points at `/dashboard-admin/account`,
 * which re-verifies the console boundary server-side like every other console route.
 */
export function AdminAccountMenu({ displayName, roles }: { displayName: string | null; roles: readonly OperationalRole[] }) {
  const { t, tApp } = useLocale();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const resolvedName = displayName ?? tApp.dashboardAccount.fallbackName;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={tApp.admin.shell.accountMenuLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-[box-shadow] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <UserAvatar displayName={resolvedName} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <div className="flex flex-col gap-1 px-2 py-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{resolvedName}</span>
            <span className="text-xs text-muted-foreground">
              {tApp.admin.shell.operatorRoles}: {roles.map((role) => tApp.admin.roles[role]).join(" · ")}
            </span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/dashboard-admin/account" />}>
            <Icon name="settings" />
            {tApp.admin.shell.account}
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

export function AdminTopbarActions({ displayName, roles }: { displayName: string | null; roles: readonly OperationalRole[] }) {
  return <AdminAccountMenu displayName={displayName} roles={roles} />;
}
