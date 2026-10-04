"use client";

import Link from "next/link";
import { startTransition, useActionState, useCallback, useRef, useState } from "react";

import { ActiveBadge } from "@/components/admin/system/notices";
import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { useLocale } from "@/components/locale/locale-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { BankDefaultResult, BankReadiness, PaymentAccountRow } from "@/lib/admin/payment-accounts";
import { setDefaultPaymentAccountAction } from "@/src/app/dashboard-admin/(system)/payment-accounts/actions";

/**
 * Feature 018 - payment accounts: masked list with the default-USD affordance and checkout readiness. It extends the
 * EXISTING payment-account system (same rows, same Super Admin CRUD, same masking). Full account numbers/IBANs never reach
 * this component - the DAL projects masked values only. Setting the default is a confirmed, request-bound operation whose
 * authority (Platform Admin + MFA) is enforced by the database; hiding the button is only a convenience.
 * Motion: CSS token transitions only (border/background); nothing here needs animation to be understood.
 */
function useDefaultCopy() {
  const { tApp } = useLocale();
  return { base: tApp.admin.system.paymentAccounts, d: tApp.admin.system.paymentAccounts.defaultControl };
}

function ReadinessBanner({ readiness }: { readiness: BankReadiness }) {
  const { d } = useDefaultCopy();
  const r = d.readiness;
  if (readiness.state === "READY") {
    return (
      <InlineAlert tone="success" title={r.readyTitle} data-bank-readiness="ready">
        {r.readyBody.replace("{bank}", readiness.bankName)}
      </InlineAlert>
    );
  }
  if (readiness.state === "INCOMPLETE") {
    return (
      <InlineAlert tone="warning" title={r.incompleteTitle} data-bank-readiness="incomplete">
        {r.incompleteBody}
      </InlineAlert>
    );
  }
  return (
    <InlineAlert tone="warning" title={r.missingTitle} data-bank-readiness={readiness.state === "DEFAULT_INACTIVE" ? "default-inactive" : "missing"}>
      <p>{r.missingBody}</p>
      {readiness.state === "DEFAULT_INACTIVE" ? <p className="mt-1">{r.retiredDefault}</p> : null}
    </InlineAlert>
  );
}

export function bankDefaultFeedback(d: ReturnType<typeof useDefaultCopy>["d"], result: BankDefaultResult): ActionToastFeedback {
  const f = d.feedback;
  if (result.ok) return { tone: "success", message: result.data.alreadyDefault ? f.alreadyDefault : f.defaultSet };
  switch (result.code) {
    case "AUTH_REQUIRED": return { tone: "error", message: f.signIn };
    case "NOT_CAPABLE": return { tone: "error", message: f.notCapable };
    case "MFA_REQUIRED": return { tone: "warning", message: f.mfa };
    case "NOT_FOUND": return { tone: "error", message: f.notFound };
    case "CONFLICT": return { tone: "warning", message: f.conflict };
    case "REQUEST_CONFLICT": return { tone: "warning", message: f.requestConflict };
    case "OUTCOME_UNKNOWN": return { tone: "warning", message: f.unknown };
    default: return { tone: "error", message: f.failed };
  }
}

export function PaymentAccountList({ rows, readiness, canSetDefault }: { rows: readonly PaymentAccountRow[]; readiness: BankReadiness; canSetDefault: boolean }) {
  const { base, d } = useDefaultCopy();
  const [target, setTarget] = useState<PaymentAccountRow | null>(null);
  const intent = useRef<string>("");
  const [state, dispatch, pending] = useActionState<BankDefaultResult | undefined, FormData>(setDefaultPaymentAccountAction, undefined);
  useActionToast(state, state ? bankDefaultFeedback(d, state) : null);

  const open = useCallback(
    (row: PaymentAccountRow) => {
      // One key per confirmation: a retry of an uncertain outcome replays; a success or request conflict starts a new intent.
      const settled = state ? state.ok || state.code === "REQUEST_CONFLICT" : false;
      if (!intent.current || settled) intent.current = globalThis.crypto.randomUUID();
      setTarget(row);
    },
    [state],
  );

  const confirm = () => {
    if (!target) return;
    const data = new FormData();
    data.set("accountId", target.id);
    data.set("requestId", intent.current);
    setTarget(null);
    startTransition(() => dispatch(data));
  };

  const columns = [
    { key: "account", primary: true, header: base.columns.account, render: (row: PaymentAccountRow) => <span className="font-medium text-foreground">{row.accountName}</span> },
    { key: "bank", header: base.columns.bank, render: (row: PaymentAccountRow) => row.bankName },
    {
      key: "identifiers",
      header: base.columns.identifiers,
      render: (row: PaymentAccountRow) => (
        <span className="flex flex-col font-mono text-[length:var(--text-micro)]" dir="ltr" data-masked-identifiers>
          <span>{row.ibanMasked ?? "—"}</span>
          <span className="text-muted-foreground">{row.accountNumberMasked ?? "—"}</span>
        </span>
      ),
    },
    { key: "currency", header: base.columns.currency, render: (row: PaymentAccountRow) => <bdi dir="ltr" className="font-mono">{row.currency}</bdi> },
    { key: "active", header: base.columns.active, render: (row: PaymentAccountRow) => <ActiveBadge isActive={row.isActive} /> },
    {
      key: "default",
      header: d.columns.default,
      render: (row: PaymentAccountRow) =>
        row.isDefault ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--status-paid-surface)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold text-[var(--status-paid)]" data-default-account={row.id}>
            <Icon name="badge-check" className="size-3.5" aria-hidden="true" />
            {d.defaultBadge}
          </span>
        ) : canSetDefault && row.isActive && row.currency === "USD" ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => open(row)} data-set-default={row.id}>
            {pending && target?.id === row.id ? d.settingDefault : d.setDefault}
          </Button>
        ) : (
          <span className="text-[length:var(--text-micro)] text-muted-foreground">{d.notDefault}</span>
        ),
    },
    {
      key: "open",
      header: base.columns.open,
      render: (row: PaymentAccountRow) => (
        <Link href={`/dashboard-admin/payment-accounts/${row.id}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={d.openAccount.replace("{name}", row.accountName)}>
          {base.columns.open}
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-payment-account-list>
      <ReadinessBanner readiness={readiness} />
      {!canSetDefault ? <p className="text-[length:var(--text-small)] text-muted-foreground">{d.readOnlyDefault}</p> : null}
      <TableCardList
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        caption={base.caption}
        emptyState={
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <Icon name="inbox" className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-heading text-[length:var(--text-h5)] font-semibold text-foreground">{d.empty}</p>
            <p className="max-w-[52ch] text-[length:var(--text-small)] text-muted-foreground">{d.emptyBody}</p>
          </div>
        }
      />
      <p className="text-[length:var(--text-micro)] text-muted-foreground">{d.usdOnly}</p>
      <AlertDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{d.confirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          {target ? (
            <p className="text-[length:var(--text-small)] text-foreground">
              {target.accountName} · {target.bankName}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{d.confirm.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              {d.confirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
