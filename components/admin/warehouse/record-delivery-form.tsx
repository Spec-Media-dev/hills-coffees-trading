"use client";

import { startTransition, useActionState, useId, useState } from "react";

import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WarehouseDeliveryOutcome } from "@/lib/admin/warehouse";
import type { ShipmentItemDTO } from "@/lib/delivery/types";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { recordShipmentDelivery } from "@/src/app/dashboard-admin/(warehouse)/shipments/actions";

/**
 * Feature 010 RUN D (T018) — delivered-quantity recording for a DISPATCHED / PARTIALLY_DELIVERED
 * shipment. One input per item holding the NEW ABSOLUTE delivered total (Feature 009's
 * `RecordDeliveryInput` contract — never a delta this form computes). Inline validation covers the
 * shape the operator can see (a non-negative number, not below the current delivered total, not above
 * the plan); the database's `validate_shipment_item` remains the authority (`delivered_quantity_cannot_
 * decrease`, `delivered_quantity_exceeds_plan`, `only_warehouse_can_record_delivery`, settlement gate)
 * and performs every position/allocation effect itself. Irreversible → `AlertDialog` confirmation;
 * outcome → Sonner; after success the PERSISTED items returned by the action are shown (never the
 * typed values) and the page re-renders from the database.
 */
export function RecordDeliveryForm({ shipmentId, items, itemLabels }: { shipmentId: string; items: readonly ShipmentItemDTO[]; itemLabels: Readonly<Record<string, string>> }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.warehouse;
  const d = copy.shipments.detail.delivery;
  const [state, dispatch, isPending] = useActionState(recordShipmentDelivery, undefined);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const baseId = useId();

  const feedbackFor = (result: ActionFeedbackResult<WarehouseDeliveryOutcome>): ActionToastFeedback | null => {
    if (result.ok) {
      return { tone: "success", message: copy.feedback.deliveryRecorded.replace("{status}", result.data.status ? tApp.deliveries.status[result.data.status] : copy.common.notRecorded) };
    }
    switch (result.code) {
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      case ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.warehouseNotCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      case ACTION_FEEDBACK.SHIPMENT_NOT_FOUND:
        return { tone: "error", message: copy.feedback.shipmentNotFound };
      case ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE:
        return { tone: "warning", message: copy.feedback.shipmentNotEditable };
      case ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID:
        return { tone: "warning", message: copy.feedback.quantityInvalid };
      case ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED:
        return { tone: "warning", message: copy.feedback.orderNotSettled };
      default:
        return { tone: "error", message: copy.feedback.operationFailed };
    }
  };
  useActionToast(state, state ? feedbackFor(state) : null);

  const persisted = state?.ok ? new Map(state.data.items.map((item) => [item.id, item])) : null;

  const validate = (): { ok: true; entries: [string, string][] } | { ok: false } => {
    const nextErrors: Record<string, string> = {};
    const entries: [string, string][] = [];
    for (const item of items) {
      const raw = (values[item.id] ?? "").trim();
      if (raw.length === 0) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextErrors[item.id] = d.invalidQuantity;
        continue;
      }
      const current = persisted?.get(item.id) ?? item;
      if (parsed < current.deliveredQuantityKg) {
        nextErrors[item.id] = d.decreaseHint;
        continue;
      }
      if (parsed > current.plannedQuantityKg) {
        nextErrors[item.id] = d.overPlanHint;
        continue;
      }
      entries.push([item.id, raw]);
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return { ok: false };
    if (entries.length === 0) {
      setFormError(d.noChanges);
      return { ok: false };
    }
    setFormError(null);
    return { ok: true, entries };
  };

  const submit = () => {
    const result = validate();
    if (!result.ok) return;
    const formData = new FormData();
    formData.set("shipmentId", shipmentId);
    for (const [itemId, value] of result.entries) formData.set(`items[${itemId}]`, value);
    startTransition(() => {
      dispatch(formData);
    });
    setValues({});
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-delivery-form>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{d.heading}</h2>
        <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{d.lead}</p>
      </div>

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          if (validate().ok) setConfirmOpen(true);
        }}
      >
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => {
            const current = persisted?.get(item.id) ?? item;
            const inputId = `${baseId}-${item.id}`;
            const errorId = `${inputId}-error`;
            const error = errors[item.id];
            return (
              <li key={item.id} data-delivery-item={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-end sm:gap-4">
                <div className="min-w-0">
                  <span className="block text-[length:var(--text-micro)] text-muted-foreground">{d.item}</span>
                  <span className="block truncate text-[length:var(--text-small)] font-medium text-foreground">{itemLabels[item.orderItemId] ?? item.orderItemId}</span>
                </div>
                <div>
                  <span className="block text-[length:var(--text-micro)] text-muted-foreground">{d.planned}</span>
                  <span className="block font-mono tabular-nums text-[length:var(--text-small)] text-foreground" dir="ltr">
                    {current.plannedQuantityKg} kg
                  </span>
                </div>
                <div>
                  <span className="block text-[length:var(--text-micro)] text-muted-foreground">{d.delivered}</span>
                  <span className="block font-mono tabular-nums text-[length:var(--text-small)] text-foreground" dir="ltr" data-delivered-persisted={current.deliveredQuantityKg}>
                    {current.deliveredQuantityKg} kg
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={inputId} className="text-[length:var(--text-micro)] text-muted-foreground">
                    {d.newTotal}
                  </label>
                  <Input
                    id={inputId}
                    name={`items[${item.id}]`}
                    type="number"
                    inputMode="decimal"
                    min={current.deliveredQuantityKg}
                    max={current.plannedQuantityKg}
                    step="0.001"
                    dir="ltr"
                    value={values[item.id] ?? ""}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) => {
                      setValues((prev) => ({ ...prev, [item.id]: event.target.value }));
                      if (error) setErrors((prev) => ({ ...prev, [item.id]: "" }));
                      if (formError) setFormError(null);
                    }}
                  />
                  {error ? (
                    <p id={errorId} role="alert" className="text-[length:var(--text-micro)] text-[var(--status-danger)]">
                      {error}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[length:var(--text-micro)] text-muted-foreground">{d.leaveBlank}</p>
        {formError ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--status-danger)]">
            {formError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending} variant="primary">
            {isPending ? copy.common.working : d.submit}
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{d.confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                submit();
              }}
            >
              {copy.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
