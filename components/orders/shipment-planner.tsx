"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { useActionToast } from "@/components/app/use-action-toast";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { AddShipmentItemInput, CreateShipmentInput } from "@/lib/orders/validation";
import type { OrderItemDTO, OrderShipmentDTO, ShipmentItemDTO } from "@/lib/orders/validation";
import { addShipmentItem, createShipment, requestShipment } from "@/src/app/dashboard/orders/[orderId]/shipment/actions";

/**
 * Feature 007 RUN A (T007) — the buyer-owned shipment-planning UI. Three narrow states, matching
 * `actions.ts`'s own three exported functions exactly: no shipment yet (create one), a `DRAFT`
 * shipment (plan items, request it), or a `REQUESTED` shipment (read-only — everything beyond this
 * belongs to Feature 009/warehouse). No status other than `DRAFT`/`REQUESTED` is ever offered or
 * rendered here as an actionable option.
 */
export function ShipmentPlanner({
  orderId,
  items,
  shipment,
  shipmentItems,
}: {
  orderId: string;
  items: readonly OrderItemDTO[];
  shipment: OrderShipmentDTO | null;
  shipmentItems: readonly ShipmentItemDTO[];
}) {
  const { tApp } = useLocale();
  const copy = tApp.orders.detail.shipment;

  if (!shipment) {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-base font-semibold text-foreground">{copy.heading}</h3>
        <CreateShipmentForm orderId={orderId} />
      </div>
    );
  }

  const statusLabel = shipment.status === "DRAFT" || shipment.status === "REQUESTED" ? copy.status[shipment.status] : shipment.status;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{copy.heading}</h3>
        <span className="inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--status-pending-surface)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold text-[var(--status-pending)]">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
          {statusLabel}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{copy.create.deliveryMethodLabel}</dt>
          <dd className="text-foreground">{shipment.deliveryMethod}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{copy.create.addressLabel}</dt>
          <dd className="text-foreground">
            {shipment.addressLine}
            {shipment.city ? `, ${shipment.city}` : ""}, {shipment.countryCode}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{copy.create.contactNameLabel}</dt>
          <dd className="text-foreground">{shipment.contactName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{copy.create.contactPhoneLabel}</dt>
          <dd className="text-foreground" dir="ltr">
            {shipment.contactPhone}
          </dd>
        </div>
      </dl>

      {shipmentItems.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shipmentItems.map((item) => {
            const orderItem = items.find((candidate) => candidate.id === item.orderItemId);
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
                <span className="text-foreground">{orderItem?.productNameSnapshot ?? item.orderItemId}</span>
                <span className="font-mono tabular-nums text-muted-foreground" dir="ltr">
                  {item.plannedQuantityKg} kg
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.empty}</p>
      )}

      {shipment.status === "DRAFT" ? (
        <>
          <AddShipmentItemForm orderId={orderId} shipmentId={shipment.id} items={items} />
          <RequestShipmentButton orderId={orderId} shipmentId={shipment.id} />
        </>
      ) : null}
    </div>
  );
}

function CreateShipmentForm({ orderId }: { orderId: string }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.detail.shipment.create;
  const [state, dispatch, isPending] = useActionState(createShipment, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.saved } : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR ? { tone: "error", message: copy.saveFailed } : null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof CreateShipmentInput>, unknown, CreateShipmentInput>({
    resolver: zodResolver(CreateShipmentInput),
    defaultValues: { deliveryMethod: "", countryCode: "", city: "", addressLine: "", contactName: "", contactPhone: "" },
  });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("deliveryMethod", data.deliveryMethod);
    formData.set("countryCode", data.countryCode);
    if (data.city) formData.set("city", data.city);
    formData.set("addressLine", data.addressLine);
    formData.set("contactName", data.contactName);
    formData.set("contactPhone", data.contactPhone);
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-5">
      <FieldGroup>
        <Field label={copy.deliveryMethodLabel} control={<Input {...register("deliveryMethod")} />} error={errors.deliveryMethod?.message} />
        <Field label={copy.countryCodeLabel} hint={copy.countryCodeHint} control={<Input maxLength={2} {...register("countryCode")} />} error={errors.countryCode?.message} />
        <Field label={copy.cityLabel} control={<Input {...register("city")} />} error={errors.city?.message} />
        <Field label={copy.addressLabel} control={<Input {...register("addressLine")} />} error={errors.addressLine?.message} />
        <Field label={copy.contactNameLabel} control={<Input {...register("contactName")} />} error={errors.contactName?.message} />
        <Field label={copy.contactPhoneLabel} control={<Input type="tel" {...register("contactPhone")} />} error={errors.contactPhone?.message} />
      </FieldGroup>
      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? copy.saving : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

function AddShipmentItemForm({ orderId, shipmentId, items }: { orderId: string; shipmentId: string; items: readonly OrderItemDTO[] }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.detail.addItem;
  const [state, dispatch, isPending] = useActionState(addShipmentItem, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.added } : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR ? { tone: "error", message: copy.addFailed } : null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof AddShipmentItemInput>, unknown, AddShipmentItemInput>({
    resolver: zodResolver(AddShipmentItemInput),
    defaultValues: { orderItemId: items[0]?.id ?? "", plannedQuantityKg: undefined },
  });

  if (items.length === 0) return null;

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("shipmentId", shipmentId);
    formData.set("orderItemId", data.orderItemId);
    formData.set("plannedQuantityKg", String(data.plannedQuantityKg));
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-4 border-t border-border pt-4">
      <FieldGroup>
        <Field
          label={<AppBilingual pick={(c) => c.orders.detail.itemsHeading} />}
          control={
            <select className="h-10 w-full rounded-[var(--radius-sm)] border border-input bg-background px-3 text-sm" {...register("orderItemId")}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.productNameSnapshot} — {item.quantityKg} kg
                </option>
              ))}
            </select>
          }
          error={errors.orderItemId?.message}
        />
        <Field label={copy.quantityLabel} control={<Input type="number" step="any" inputMode="decimal" {...register("plannedQuantityKg")} />} error={errors.plannedQuantityKg?.message} />
      </FieldGroup>
      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? copy.adding : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

function RequestShipmentButton({ orderId, shipmentId }: { orderId: string; shipmentId: string }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.detail.shipment.request;
  const [state, dispatch, isPending] = useActionState(requestShipment, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.requested } : state?.ok === false ? { tone: "error", message: copy.requestFailed } : null);

  const onClick = () => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("shipmentId", shipmentId);
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <Button type="button" onClick={onClick} disabled={isPending || state?.ok === true}>
      {isPending ? copy.requesting : copy.action}
    </Button>
  );
}
