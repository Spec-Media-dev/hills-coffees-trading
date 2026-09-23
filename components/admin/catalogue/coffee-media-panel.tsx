"use client";

import Image from "next/image";
import { startTransition, useActionState, useRef, useState } from "react";

import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { CatalogueWriteOutcome, CoffeeMediaRow } from "@/lib/admin/catalogue";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { deleteCoffeeImage, markCoffeeMediaPrimary, moveCoffeeImage, reorderCoffeeMedia, replaceCoffeeImage, uploadCoffeeImages } from "@/src/app/dashboard-admin/(catalogue)/actions";

/**
 * Feature 010 RUN E (T024) + hardening run — catalogue image management for one coffee. Upload (one or
 * many), preview, set primary, move earlier/later (or type an exact sort order), replace and remove.
 * Every control is a Server Action that re-verifies `is_platform_admin()`; the file checks here only
 * mirror the server's own (`CATALOGUE_MEDIA_*` in `lib/admin/catalogue.ts`) for immediate feedback.
 * `uploadAvailable` stays a prop so the page states the capability from the layer, not the component.
 */
const ACCEPT = "image/jpeg,image/png,image/webp";

type Copy = ReturnType<typeof useLocale>["tApp"]["admin"]["catalogue"];

function feedbackFor(copy: Copy, signInRequired: string, result: ActionFeedbackResult<CatalogueWriteOutcome>): ActionToastFeedback {
  const m = copy.coffees.media;
  if (result.ok) {
    if (result.code === ACTION_FEEDBACK.CATALOGUE_MEDIA_UPLOADED) return { tone: "success", message: m.uploaded };
    if (result.code === ACTION_FEEDBACK.CATALOGUE_MEDIA_REMOVED) return { tone: "success", message: m.removed };
    return { tone: "success", message: copy.feedback.saved };
  }
  switch (result.code) {
    case ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE:
      return { tone: "error", message: copy.feedback.notCapable };
    case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
      return { tone: "error", message: signInRequired };
    case ACTION_FEEDBACK.CATALOGUE_NOT_FOUND:
      return { tone: "error", message: copy.feedback.notFound };
    case ACTION_FEEDBACK.CATALOGUE_MEDIA_INVALID_FILE:
      return { tone: "error", message: m.invalidFile };
    case ACTION_FEEDBACK.CATALOGUE_MEDIA_LIMIT_REACHED:
      return { tone: "error", message: m.limitReached };
    case ACTION_FEEDBACK.VALIDATION_ERROR:
      return { tone: "error", message: copy.feedback.validationError };
    default:
      return { tone: "error", message: copy.feedback.failed };
  }
}

export function CoffeeMediaPanel({
  coffeeId,
  media,
  uploadAvailable,
  maxImages = 12,
  maxBytes = 5 * 1024 * 1024,
}: {
  coffeeId: string;
  media: readonly CoffeeMediaRow[];
  uploadAvailable: boolean;
  maxImages?: number;
  maxBytes?: number;
}) {
  const { tApp } = useLocale();
  const copy = tApp.admin.catalogue;
  const m = copy.coffees.media;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, dispatchUpload, uploadPending] = useActionState(uploadCoffeeImages, undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  useActionToast(uploadState, uploadState ? feedbackFor(copy, tApp.feedback.signInRequired, uploadState) : null);

  const remaining = Math.max(0, maxImages - media.length);

  function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;
    if (chosen.some((file) => !ACCEPT.split(",").includes(file.type) || file.size > maxBytes)) {
      setLocalError(m.invalidFile);
      return;
    }
    if (chosen.length > remaining) {
      setLocalError(m.limitReached);
      return;
    }
    setLocalError(null);
    // One image per request: keeps every Server Action body under the configured `bodySizeLimit`
    // (next.config.ts). `useActionState` queues the dispatches and runs them in order.
    startTransition(() => {
      for (const file of chosen) {
        const formData = new FormData();
        formData.set("coffeeId", coffeeId);
        formData.append("images", file);
        dispatchUpload(formData);
      }
    });
  }

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
        <ul className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2">
          {media.map((row, index) => (
            <MediaCard key={row.id} coffeeId={coffeeId} row={row} isFirst={index === 0} isLast={index === media.length - 1} canReplace={uploadAvailable} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-4" data-media-upload={uploadAvailable ? "available" : "unavailable"}>
        <p className="text-[length:var(--text-small)] font-semibold text-foreground">{m.uploadHeading}</p>
        {uploadAvailable ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileInputRef} type="file" accept={ACCEPT} multiple className="sr-only" onChange={onFilesChosen} aria-label={m.upload} data-media-file-input />
              <Button type="button" variant="outline" size="sm" disabled={uploadPending || remaining === 0} onClick={() => fileInputRef.current?.click()}>
                <Icon name="plus" />
                {uploadPending ? m.uploading : m.upload}
              </Button>
              <span className="text-[length:var(--text-micro)] text-muted-foreground">{m.hint.replace("{count}", String(media.length)).replace("{max}", String(maxImages))}</span>
            </div>
            {localError ? (
              <p role="alert" className="text-[length:var(--text-micro)] text-destructive">
                {localError}
              </p>
            ) : null}
            <p className="text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">{m.publicNote}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function MediaCard({ coffeeId, row, isFirst, isLast, canReplace }: { coffeeId: string; row: CoffeeMediaRow; isFirst: boolean; isLast: boolean; canReplace: boolean }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.catalogue;
  const m = copy.coffees.media;
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [primaryState, dispatchPrimary, primaryPending] = useActionState(markCoffeeMediaPrimary, undefined);
  const [orderState, dispatchOrder, orderPending] = useActionState(reorderCoffeeMedia, undefined);
  const [moveState, dispatchMove, movePending] = useActionState(moveCoffeeImage, undefined);
  const [removeState, dispatchRemove, removePending] = useActionState(deleteCoffeeImage, undefined);
  const [replaceState, dispatchReplace, replacePending] = useActionState(replaceCoffeeImage, undefined);
  const signIn = tApp.feedback.signInRequired;
  useActionToast(primaryState, primaryState ? feedbackFor(copy, signIn, primaryState) : null);
  useActionToast(orderState, orderState ? feedbackFor(copy, signIn, orderState) : null);
  useActionToast(moveState, moveState ? feedbackFor(copy, signIn, moveState) : null);
  useActionToast(removeState, removeState ? feedbackFor(copy, signIn, removeState) : null);
  useActionToast(replaceState, replaceState ? feedbackFor(copy, signIn, replaceState) : null);
  const busy = primaryPending || orderPending || movePending || removePending || replacePending;

  const base = () => {
    const formData = new FormData();
    formData.set("coffeeId", coffeeId);
    formData.set("mediaId", row.id);
    return formData;
  };

  return (
    <li
      data-media-record={row.id}
      data-is-primary={row.isPrimary}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--surface-card)] transition-[box-shadow,border-color] duration-[var(--dur-fast)] hover:border-[var(--border-strong,var(--border))] hover:shadow-[var(--shadow-sm)] motion-reduce:transition-none"
      aria-busy={busy}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-subtle)]">
        {row.imageUrl ? (
          <Image src={row.imageUrl} alt="" fill sizes="(min-width: 1024px) 280px, (min-width: 420px) 45vw, 90vw" className="object-cover transition-transform duration-[var(--dur-slow)] ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Icon name="file" className="size-6" aria-hidden="true" />
          </div>
        )}
        {row.isPrimary ? (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-paid-surface)] px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-[var(--status-paid)] shadow-[var(--shadow-sm)]" data-media-primary>
            <Icon name="check" className="size-3" aria-hidden="true" />
            {m.primary}
          </span>
        ) : null}
        {busy ? <div className="absolute inset-0 bg-background/40" aria-hidden="true" /> : null}
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--text-small)] font-medium text-foreground" dir="ltr" title={row.file?.originalName}>
            {row.file?.originalName ?? m.fileUnavailable}
          </p>
          <p className="text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.file ? `${row.file.mimeType} · ${Math.round(row.file.sizeBytes / 1024)} KB` : row.fileAssetId}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {row.isPrimary ? <span aria-hidden="true" /> : (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startTransition(() => dispatchPrimary(base()))}>
              {m.setPrimary}
            </Button>
          )}
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={m.sortOrder}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-9 px-0"
            disabled={busy || isFirst}
            aria-label={m.moveEarlier}
            title={m.moveEarlier}
            onClick={() => {
              const formData = base();
              formData.set("direction", "earlier");
              startTransition(() => dispatchMove(formData));
            }}
          >
            <Icon name="chevron-left" className="rtl:rotate-180" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-9 px-0"
            disabled={busy || isLast}
            aria-label={m.moveLater}
            title={m.moveLater}
            onClick={() => {
              const formData = base();
              formData.set("direction", "later");
              startTransition(() => dispatchMove(formData));
            }}
          >
            <Icon name="chevron-right" className="rtl:rotate-180" />
          </Button>
          </div>
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("coffeeId", coffeeId);
            formData.set("mediaId", row.id);
            startTransition(() => dispatchOrder(formData));
          }}
        >
          <div className="flex flex-col gap-1">
          <label htmlFor={`sort-${row.id}`} className="text-[length:var(--text-micro)] text-muted-foreground">
            {m.sortOrder}
          </label>
          {/* Keyed by the CURRENT sort order: an uncontrolled input keeps its old DOM value across a
              re-render, so after "move earlier/later" it would show — and on save silently restore —
              the previous position. Re-keying remounts it with the fresh server value. */}
          <Input key={`sort-${row.id}-${row.sortOrder}`} id={`sort-${row.id}`} name="sortOrder" type="number" min={0} max={9999} step={1} defaultValue={row.sortOrder} className="h-9 w-24 font-mono tabular-nums" dir="ltr" />
          </div>
          <Button type="submit" size="sm" variant="text" disabled={busy}>
            {m.saveOrder}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {canReplace ? (
            <>
              <input
                ref={replaceInputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label={m.replace}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const formData = base();
                  formData.set("image", file);
                  startTransition(() => dispatchReplace(formData));
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => replaceInputRef.current?.click()}>
                {replacePending ? m.replacing : m.replace}
              </Button>
            </>
          ) : null}
          {confirming ? (
            <>
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => startTransition(() => dispatchRemove(base()))} data-media-remove-confirm>
                {removePending ? m.removing : m.confirmRemove}
              </Button>
              <Button type="button" size="sm" variant="text" disabled={busy} onClick={() => setConfirming(false)}>
                {m.cancel}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="text" className="text-destructive" disabled={busy} onClick={() => setConfirming(true)} data-media-remove>
              {m.remove}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
