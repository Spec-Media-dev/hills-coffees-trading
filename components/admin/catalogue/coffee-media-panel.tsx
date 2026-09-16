"use client";

import { startTransition, useActionState } from "react";

import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { CatalogueWriteOutcome, CoffeeMediaRow } from "@/lib/admin/catalogue";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { markCoffeeMediaPrimary, reorderCoffeeMedia } from "@/src/app/dashboard-admin/(catalogue)/actions";

/**
 * Feature 010 RUN E (T024) — media RECORD management for one coffee. Renders the persisted
 * `coffee_media` rows (file metadata from `file_assets` when readable), lets a platform admin set the
 * primary record and its sort order, and states honestly that byte upload does not exist: the only
 * approved Storage bucket is the private KYB one (DB-BLOCK-01 for public media). The upload seam is a
 * plain statement — no input, no button, no fake success.
 */
function feedbackFor(copy: ReturnType<typeof useLocale>["tApp"]["admin"]["catalogue"], signInRequired: string, result: ActionFeedbackResult<CatalogueWriteOutcome>): ActionToastFeedback {
  if (result.ok) return { tone: "success", message: copy.feedback.saved };
  switch (result.code) {
    case ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE:
      return { tone: "error", message: copy.feedback.notCapable };
    case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
      return { tone: "error", message: signInRequired };
    case ACTION_FEEDBACK.CATALOGUE_NOT_FOUND:
      return { tone: "error", message: copy.feedback.notFound };
    case ACTION_FEEDBACK.VALIDATION_ERROR:
      return { tone: "error", message: copy.feedback.validationError };
    default:
      return { tone: "error", message: copy.feedback.failed };
  }
}

export function CoffeeMediaPanel({ coffeeId, media, uploadAvailable }: { coffeeId: string; media: readonly CoffeeMediaRow[]; uploadAvailable: boolean }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.catalogue;
  const m = copy.coffees.media;
  const [primaryState, dispatchPrimary, primaryPending] = useActionState(markCoffeeMediaPrimary, undefined);
  const [orderState, dispatchOrder, orderPending] = useActionState(reorderCoffeeMedia, undefined);
  useActionToast(primaryState, primaryState ? feedbackFor(copy, tApp.feedback.signInRequired, primaryState) : null);
  useActionToast(orderState, orderState ? feedbackFor(copy, tApp.feedback.signInRequired, orderState) : null);

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-media-panel>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{m.heading}</h2>
        <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{m.lead}</p>
      </div>

      {media.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-muted-foreground" data-media-empty>
          {m.none}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {media.map((row) => (
            <li key={row.id} data-media-record={row.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="break-all text-[length:var(--text-small)] font-medium text-foreground" dir="ltr">
                  {row.file?.originalName ?? m.fileUnavailable}
                </p>
                <p className="text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
                  {row.file ? `${row.file.mimeType} · ${Math.round(row.file.sizeBytes / 1024)} KB` : row.fileAssetId}
                </p>
                {row.isPrimary ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-paid-surface)] px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-[var(--status-paid)]" data-media-primary>
                    <Icon name="check" className="size-3" aria-hidden="true" />
                    {m.primary}
                  </span>
                ) : null}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  formData.set("coffeeId", coffeeId);
                  formData.set("mediaId", row.id);
                  startTransition(() => {
                    dispatchOrder(formData);
                  });
                }}
              >
                <label htmlFor={`sort-${row.id}`} className="text-[length:var(--text-micro)] text-muted-foreground">
                  {m.sortOrder}
                </label>
                <Input id={`sort-${row.id}`} name="sortOrder" type="number" min={0} max={9999} step={1} defaultValue={row.sortOrder} className="h-9 w-20" dir="ltr" />
                <Button type="submit" size="sm" variant="outline" disabled={orderPending}>
                  {m.saveOrder}
                </Button>
              </form>
              {row.isPrimary ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={primaryPending}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("coffeeId", coffeeId);
                    formData.set("mediaId", row.id);
                    startTransition(() => {
                      dispatchPrimary(formData);
                    });
                  }}
                >
                  {m.setPrimary}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3" data-media-upload={uploadAvailable ? "available" : "unavailable"}>
        <p className="text-[length:var(--text-small)] font-semibold text-foreground">{uploadAvailable ? m.uploadHeading : m.uploadUnavailableTitle}</p>
        {uploadAvailable ? null : <p className="mt-1 text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">{m.uploadUnavailableDescription}</p>}
      </div>
    </section>
  );
}
