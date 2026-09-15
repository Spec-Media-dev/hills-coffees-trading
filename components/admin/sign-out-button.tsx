"use client";

import { useState } from "react";

import { LogoutConfirmDialog } from "@/components/account/logout-confirm-dialog";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Feature 010 — the account page's sign-out control: opens the SAME `LogoutConfirmDialog` the
 * account menus use, which calls the real `signOut` Server Action. A narrow client island holding
 * only the dialog's open state.
 */
export function AdminSignOutButton() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" type="button" onClick={() => setOpen(true)}>
        <Icon name="log-out" />
        {t.account.signOut}
      </Button>
      <LogoutConfirmDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
