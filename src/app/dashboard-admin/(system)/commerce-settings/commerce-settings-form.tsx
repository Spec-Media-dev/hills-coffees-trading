"use client";

import { startTransition, useActionState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CommerceSettings } from "@/lib/admin/commerce-settings";

import { saveCommerceSettings } from "./actions";

/**
 * Feature 013 T101 — the settings form itself. `checkoutEnabled`'s own impact notice is shown
 * inline (turning it on makes `issue_proforma` live for every non-pilot buyer, or exactly the pilot
 * organizations when the list is non-empty) — never hidden behind the switch alone (OPS-01).
 */
export function CommerceSettingsForm({ settings }: { settings: CommerceSettings }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.system.commerceSettings;
  const [state, dispatch, pending] = useActionState(saveCommerceSettings, undefined);

  return (
    <form
      action={(formData) => {
        startTransition(() => dispatch(formData));
      }}
      className="flex max-w-xl flex-col gap-5 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5"
    >
      <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-foreground">
        <span className="font-medium">{copy.validityHours}</span>
        <Input type="number" name="validityHours" min={1} max={720} defaultValue={settings.proformaValidityHours} className="max-w-40" dir="ltr" />
      </label>

      <div className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-border p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="commerce-checkout-enabled" className="font-medium text-foreground">{copy.checkoutSwitch}</label>
          <span className="text-[length:var(--text-small)] text-muted-foreground">{copy.checkoutSwitchImpact}</span>
        </div>
        <Switch id="commerce-checkout-enabled" name="checkoutEnabled" defaultChecked={settings.bankTransferCheckoutEnabled} />
      </div>

      <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-foreground">
        <span className="font-medium">{copy.pilotOrganizations}</span>
        <span className="text-muted-foreground">{copy.pilotOrganizationsHelp}</span>
        <Textarea name="pilotOrganizationIds" rows={3} dir="ltr" defaultValue={settings.pilotOrganizationIds.join("\n")} className="font-mono text-[length:var(--text-small)]" />
      </label>

      {state && !state.ok ? (
        <p role="alert" className="text-[length:var(--text-small)] text-destructive">
          {state.code === "mfa_step_up_required" ? copy.mfaRequired : state.code === "admin_forbidden" ? copy.forbidden : copy.saveFailed}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-[length:var(--text-small)] text-[var(--status-paid)]">
          {copy.saved}
        </p>
      ) : null}

      <Button type="submit" className="min-h-11 self-start" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  );
}
