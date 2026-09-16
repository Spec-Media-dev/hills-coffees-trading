"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { WarehouseOperationKey, WarehouseOperationOutcome, WarehouseOperationSpec } from "@/lib/admin/warehouse";
import type { OrderShipmentStatus } from "@/lib/delivery/types";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { runWarehouseOperation } from "@/src/app/dashboard-admin/(warehouse)/shipments/actions";

/**
 * Feature 010 RUN D (T017) — the shipment detail's warehouse-operation panel. Reuses the ONE admin
 * decision form (`DecisionForm`): exactly one operation is chosen, irreversible operations
 * (`fail`/`cancel`) require a reason (Feature 009's own `FailShipmentInput`/`CancelShipmentInput`
 * limits: 1–500 characters) and an `AlertDialog` confirmation, and every outcome surfaces through
 * Sonner with the copy for Feature 009's own result code — never raw database text.
 *
 * `operations` is computed server-side (`displayableOperations(status)`) from Feature 009's transition
 * map; this component renders what it is given. A status with no valid operation (DRAFT, FAILED,
 * DISPUTED, DELIVERED, CANCELLED) renders the honest "nothing applies" statement, never a disabled
 * fake control. Hiding is never authorization — the Server Action and the database re-decide.
 */
export function ShipmentOperationsPanel({ shipmentId, status, operations }: { shipmentId: string; status: OrderShipmentStatus; operations: readonly WarehouseOperationSpec[] }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.warehouse;
  const ops = copy.shipments.detail.operations;

  const options: DecisionOption<WarehouseOperationKey>[] = operations.map((spec) => ({
    value: spec.key,
    label: ops.options[spec.key].label,
    description: ops.options[spec.key].description,
    reasonRequired: spec.reasonRequired,
    destructive: spec.destructive,
    badge: spec.settlementGated ? ops.settlementGated : undefined,
  }));

  const feedbackFor = (result: ActionFeedbackResult<WarehouseOperationOutcome>): ActionToastFeedback | null => {
    if (result.ok) {
      return { tone: "success", message: copy.feedback.operationApplied.replace("{operation}", ops.options[result.data.operation].label).replace("{status}", tApp.deliveries.status[result.data.toStatus]) };
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
      case ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED:
        return { tone: "warning", message: copy.feedback.orderNotSettled };
      case ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE:
        return { tone: "warning", message: copy.feedback.reservationUnavailable };
      default:
        return { tone: "error", message: copy.feedback.operationFailed };
    }
  };

  if (options.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="operation" data-decision-state="not-operable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{ops.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{ops.none.replace("{status}", tApp.deliveries.status[status])}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DecisionForm<WarehouseOperationKey, WarehouseOperationOutcome>
        hiddenFields={{ shipmentId }}
        decisionFieldName="operation"
        options={options}
        action={runWarehouseOperation}
        feedbackFor={feedbackFor}
        heading={ops.heading}
        lead={ops.lead}
        submitLabel={ops.submit}
        confirmTitle={ops.confirmTitle}
        confirmDescription={ops.confirmDescription.replace("{operation}", "{decision}")}
        reason={{ label: ops.reason, hint: ops.reasonHint, required: ops.reasonRequired, tooLong: ops.reasonTooLong, minLength: 1, maxLength: 500 }}
      />
      {operations.some((spec) => spec.settlementGated) ? (
        <p className="text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground" data-settlement-note>
          {ops.settlementNote}
        </p>
      ) : null}
    </div>
  );
}
