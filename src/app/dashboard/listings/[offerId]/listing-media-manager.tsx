"use client";

import Image from "next/image";
import { startTransition, useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import type { OfferMediaItem } from "@/lib/listings/media";

import { removeListingImage, setPrimaryListingImage, uploadListingImage } from "./actions";

/**
 * Feature 010 approved scope addition (Part 6, 2026-09-22) — the seller's own listing-image manager.
 * A NEW capability (`coffee_offer_media`, not the admin-curated `coffee_media`) — see the migration's
 * own header for why the two tables are genuinely different, not a rename. Genuinely blocked on the
 * unapplied migration this run; the upload/delete/set-primary actions fail honestly until it lands.
 *
 * DELIBERATE SCOPE BOUNDARY: drag-to-reorder is NOT built this run (`reorder_offer_media()` exists at
 * the database layer, ready for a future run to wire a drag UI to) — "keep scope limited" plus this
 * run's own time budget. Set-primary and delete are enough to make every image usable today (a
 * seller can always delete and re-upload in the desired order as a manual workaround), and this
 * manager states that honestly rather than shipping a half-built drag interaction.
 */
export function ListingMediaManager({ offerId, media, editable, maxImages }: { offerId: string; media: readonly OfferMediaItem[]; editable: boolean; maxImages: number }) {
  const { tApp } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadDispatch, isUploading] = useActionState(uploadListingImage, undefined);

  useActionToast(
    uploadState,
    uploadState?.ok === true
      ? { tone: "success", message: tApp.listings.media.uploadSuccess }
      : uploadState?.ok === false
        ? {
            tone: "error",
            message:
              uploadState.code === ACTION_FEEDBACK.LISTING_MEDIA_INVALID_FILE
                ? tApp.listings.media.invalidFile
                : uploadState.code === ACTION_FEEDBACK.LISTING_MEDIA_LIMIT_REACHED
                  ? tApp.listings.media.limitReached
                  : tApp.listings.media.updateFailed,
          }
        : null
  );

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("offerId", offerId);
    formData.set("image", file);
    startTransition(() => uploadDispatch(formData));
    event.target.value = "";
  }

  return (
    <div className="flex flex-col gap-4" data-listing-media-manager>
      {media.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-muted-foreground">{tApp.listings.media.empty}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {media.map((item) => (
            <MediaTile key={item.id} offerId={offerId} item={item} editable={editable} />
          ))}
        </div>
      )}

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFileChosen} aria-label={tApp.listings.media.upload} />
          <Button type="button" variant="outline" size="sm" disabled={isUploading || media.length >= maxImages} onClick={() => fileInputRef.current?.click()}>
            {isUploading ? tApp.listings.media.uploading : tApp.listings.media.upload}
          </Button>
          <span className="text-[length:var(--text-micro)] text-muted-foreground">{tApp.listings.media.hint.replace("{count}", String(media.length)).replace("{max}", String(maxImages))}</span>
        </div>
      ) : null}
    </div>
  );
}

function MediaTile({ offerId, item, editable }: { offerId: string; item: OfferMediaItem; editable: boolean }) {
  const { tApp } = useLocale();
  const [removeState, removeDispatch, isRemoving] = useActionState(removeListingImage, undefined);
  const [primaryState, primaryDispatch, isSettingPrimary] = useActionState(setPrimaryListingImage, undefined);

  useActionToast(removeState, removeState?.ok === true ? { tone: "success", message: tApp.listings.media.removeSuccess } : removeState?.ok === false ? { tone: "error", message: tApp.listings.media.updateFailed } : null);
  useActionToast(primaryState, primaryState?.ok === false ? { tone: "error", message: tApp.listings.media.updateFailed } : null);

  return (
    <div className="relative flex w-28 flex-col gap-1.5" data-media-tile data-is-primary={item.isPrimary}>
      <div className="relative h-28 w-28 overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)]">
        {item.signedUrl ? <Image src={item.signedUrl} alt="" fill sizes="112px" className="object-cover" unoptimized /> : null}
        {item.isPrimary ? (
          <span className="absolute start-1 top-1 rounded-[var(--radius-sm)] bg-primary px-1.5 py-0.5 text-[length:var(--text-micro)] font-semibold text-primary-foreground">{tApp.listings.media.primaryBadge}</span>
        ) : null}
      </div>
      {editable ? (
        <div className="flex flex-col gap-1">
          {!item.isPrimary ? (
            <button
              type="button"
              className="text-[length:var(--text-micro)] text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-50"
              disabled={isSettingPrimary}
              onClick={() => {
                const fd = new FormData();
                fd.set("mediaId", item.id);
                fd.set("offerId", offerId);
                startTransition(() => primaryDispatch(fd));
              }}
            >
              {tApp.listings.media.setPrimary}
            </button>
          ) : null}
          <button
            type="button"
            className="text-[length:var(--text-micro)] text-destructive underline underline-offset-2 hover:no-underline disabled:opacity-50"
            disabled={isRemoving}
            onClick={() => {
              const fd = new FormData();
              fd.set("mediaId", item.id);
              fd.set("offerId", offerId);
              startTransition(() => removeDispatch(fd));
            }}
          >
            {isRemoving ? tApp.listings.media.removing : tApp.listings.media.remove}
          </button>
        </div>
      ) : null}
    </div>
  );
}
