"use client";

import { useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/locale-provider";
import { mapCommerceError } from "@/lib/commerce/errors";
import type { ReservationResult } from "@/lib/commerce/reservation";

import { confirmReservation } from "@/src/app/dashboard/orders/[orderId]/proforma/actions";

/**
 * Feature 013 T099 — explicit confirm dialog: the buyer must open the dialog and click Confirm before
 * `confirm_proforma` is ever called (FR-016). `AlertDialog` (existing accessible/focus-managed
 * primitive — see `components/account/logout-confirm-dialog.tsx`), not a bare button.
 *
 * Calls the Server Action directly (not `useActionState`) so the dialog closes on success ONLY, from
 * inside the same event handler — never a `useEffect` reacting to state (react-hooks/purity: no
 * setState-in-effect).
 */
export function ProformaConfirmPanel({ proformaId, copy }: {
  proformaId: string;
  copy: { trigger: ReactNode; title: ReactNode; description: ReactNode; cancel: ReactNode; confirm: ReactNode; confirming: ReactNode };
}) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Extract<ReservationResult, { ok: false }> | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (pending) return;
      if (nextOpen) setFailure(null);
      setOpen(nextOpen);
    }}>
      <AlertDialogTrigger render={<Button className="min-h-11" />}>{copy.trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <p role="alert" className="text-[length:var(--text-small)] text-destructive">
            {mapCommerceError(failure.code, locale).message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{copy.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              const formData = new FormData();
              formData.set("proformaId", proformaId);
              try {
                const result = await confirmReservation(undefined, formData);
                if (result.ok) {
                  setOpen(false);
                } else {
                  setFailure(result);
                }
              } catch {
                setFailure({ ok: false, code: "commerce_error" });
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? copy.confirming : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
