"use client";

import { useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocale } from "@/components/locale/locale-provider";

import { signOut } from "@/src/app/(auth)/sign-out/actions";

/**
 * Sign-out confirmation dialog (Feature 003, user-requested Phase-2 requirement — §15/§39).
 *
 * PRESENTATION ONLY: this dialog decides nothing about authorization. Confirming calls the real
 * `signOut` Server Action, which is what actually invalidates the session server-side (spec FR-003);
 * Cancel closes the dialog and leaves the session and the current page entirely untouched — no
 * optimistic sign-out, no client-side session-state clearing here.
 *
 * `AlertDialog` (`components/ui/alert-dialog.tsx`) rather than `window.confirm()` — an accessible,
 * themed, focus-managed primitive already exists in this product, so nothing new was built.
 */
export function LogoutConfirmDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const copy = t.auth.signOutConfirm;
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                await signOut();
              });
            }}
          >
            {isPending ? copy.confirming : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
