"use client";

import Image from "next/image";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useId, useRef, useState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The ONE detail-page product gallery (pre-Stripe hardening run), shared by catalogue coffees (public
 * `public-assets` URLs) and seller listings (server-signed `listing-media` URLs — pass `unoptimized`).
 *
 * MEDIA DISPLAY RULE — "primary outside, gallery inside": list/card surfaces show one image; the
 * detail page shows EVERY authorized image here, opening on the primary (`initialIndex`).
 *
 * LAYOUT (a product gallery, not a slider):
 * - MAIN — the active image, dominant, in a fixed-ratio stage (no layout shift).
 * - FEATURED — the next two supporting images as medium tiles.
 * - MORE — any remaining images as small, consistent thumbnails.
 * Supporting images are every image EXCEPT the active one, in the owner's stored sort order — so when a
 * tile is chosen it takes the main slot and the previous main image returns to its stored position.
 * One image → a single clean frame with no gallery chrome.
 *
 * INTERACTION: tiles are buttons ("Show image n of N"); Arrow keys move focus between tiles in the
 * reading direction (RTL mirrored), Home/End jump; a horizontal swipe on the main stage steps through
 * images. Motion: the main image cross-fades and the tiles re-flow with Motion `layout` animations;
 * both are disabled under `prefers-reduced-motion`. An image mounts only once shown or tiled.
 */
export type GalleryImage = { url: string; alt?: string };

export function MediaGallery({
  images,
  initialIndex = 0,
  aspect = "4 / 5",
  multiAspect,
  sizes = "(min-width: 1024px) 44vw, 100vw",
  unoptimized = false,
  priority = false,
  dictionary = "public",
  tone = "dark",
  className,
  frameClassName,
}: {
  images: readonly GalleryImage[];
  initialIndex?: number;
  /** CSS aspect-ratio of the main stage when there is ONE image. */
  aspect?: string;
  /** CSS aspect-ratio of the main stage when supporting tiles are shown (defaults to `aspect`). */
  multiAspect?: string;
  sizes?: string;
  /** Signed/private URLs cannot go through the Next optimizer (remotePatterns allow public objects only). */
  unoptimized?: boolean;
  priority?: boolean;
  /** Which dictionary supplies the labels (public site vs. application shell). */
  dictionary?: "public" | "app";
  /** Styling for the surface the gallery sits on. */
  tone?: "dark" | "light";
  className?: string;
  frameClassName?: string;
}) {
  const { t, tApp, direction } = useLocale();
  const reduceMotion = useReducedMotion() ?? false;
  const copy = dictionary === "app" ? tApp.gallery : t.gallery;
  const count = images.length;
  const safeInitial = Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0));
  const [active, setActive] = useState(safeInitial);
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set([safeInitial]));
  const tileRefs = useRef(new Map<number, HTMLButtonElement | null>());
  const touchStart = useRef<number | null>(null);
  const labelId = useId();

  const select = useCallback(
    (index: number) => {
      if (count === 0) return;
      const next = ((index % count) + count) % count;
      setActive(next);
      setShown((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
    },
    [count],
  );

  if (count === 0) return null;
  const current = images[active] ?? images[0]!;
  const format = (template: string, n: number) => template.replace("{n}", String(n)).replace("{total}", String(count));

  // Every image except the active one, in stored order — the active image lives in the main slot.
  const supporting = images.map((image, index) => ({ image, index })).filter((entry) => entry.index !== active);
  const featured = supporting.slice(0, 2);
  const more = supporting.slice(2);
  const order = supporting.map((entry) => entry.index);
  const forwardKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
  const layoutTransition = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.8 };

  const onTileKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const position = order.indexOf(index);
    let target: number | undefined;
    if (event.key === forwardKey) target = order[(position + 1) % order.length];
    else if (event.key === backKey) target = order[(position - 1 + order.length) % order.length];
    else if (event.key === "Home") target = order[0];
    else if (event.key === "End") target = order[order.length - 1];
    if (target === undefined) return;
    event.preventDefault();
    tileRefs.current.get(target)?.focus();
  };

  const tileTone =
    tone === "dark"
      ? "border-[rgba(242,245,235,0.16)] bg-black/20 focus-visible:outline-[var(--gold-on-dark,#ce8a39)] hover:border-[rgba(242,245,235,0.45)]"
      : "border-border bg-muted focus-visible:outline-[var(--focus-ring,#ce8a39)] hover:border-[var(--border-strong,var(--border))]";

  const tile = (entry: { image: GalleryImage; index: number }, size: "featured" | "more") => (
    <motion.button
      key={entry.image.url}
      layout
      layoutId={`${labelId}-${entry.image.url}`}
      transition={layoutTransition}
      ref={(node: HTMLButtonElement | null) => {
        tileRefs.current.set(entry.index, node);
      }}
      type="button"
      aria-label={format(copy.show, entry.index + 1)}
      onClick={() => select(entry.index)}
      onKeyDown={(event) => onTileKeyDown(event, entry.index)}
      data-gallery-thumb={entry.index}
      data-gallery-tile={size}
      className={cn(
        "group/tile relative overflow-hidden border transition-[border-color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none",
        size === "featured" ? "rounded-[var(--radius-lg)]" : "size-16 shrink-0 rounded-[var(--radius-md)] sm:size-[4.5rem]",
        tileTone,
      )}
      style={size === "featured" ? { aspectRatio: featured.length === 1 ? "16 / 7" : "4 / 3" } : undefined}
    >
      <Image
        src={entry.image.url}
        alt=""
        fill
        sizes={size === "featured" ? "(min-width: 1024px) 22vw, 50vw" : "72px"}
        unoptimized={unoptimized}
        className="object-cover transition-transform duration-[var(--dur-slow)] ease-out group-hover/tile:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/tile:scale-100"
      />
      <span aria-hidden="true" className="absolute inset-0 bg-black/0 transition-colors duration-[var(--dur-fast)] group-hover/tile:bg-black/5" />
    </motion.button>
  );

  return (
    <LayoutGroup id={labelId}>
      <div className={cn("flex flex-col gap-3", className)} role="group" aria-labelledby={labelId} data-media-gallery data-gallery-count={count} data-gallery-active={active}>
        <span id={labelId} className="sr-only">
          {copy.region}
        </span>

        {/* MAIN — the active image, dominant. */}
        <div
          className={cn("relative w-full overflow-hidden bg-black/10", frameClassName)}
          style={{ aspectRatio: count > 1 ? (multiAspect ?? aspect) : aspect }}
          data-gallery-stage
          onTouchStart={(event) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            const end = event.changedTouches[0]?.clientX;
            if (start === null || end === undefined || count < 2) return;
            const delta = end - start;
            if (Math.abs(delta) < 40) return;
            const towardsEnd = direction === "rtl" ? delta > 0 : delta < 0;
            select(active + (towardsEnd ? 1 : -1));
          }}
        >
          {images.map((image, index) =>
            shown.has(index) ? (
              <Image
                key={image.url}
                src={image.url}
                alt={index === active ? (image.alt ?? "") : ""}
                fill
                sizes={sizes}
                priority={priority && index === safeInitial}
                unoptimized={unoptimized}
                aria-hidden={index === active ? undefined : true}
                data-gallery-main={index === active ? "true" : undefined}
                className={cn(
                  "object-cover transition-[opacity,transform] duration-[var(--dur-slowest)] ease-out motion-reduce:transition-none",
                  index === active ? "scale-100 opacity-100" : "scale-[1.02] opacity-0",
                )}
              />
            ) : null,
          )}
          {count > 1 ? (
            <span className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-[rgba(8,24,18,0.62)] px-2.5 py-1 font-mono text-[length:var(--text-micro)] tabular-nums text-[#f2f5eb] backdrop-blur-sm" data-gallery-position aria-live="polite">
              <span className="sr-only">{format(copy.position, active + 1)}</span>
              <span aria-hidden="true" dir="ltr">
                {active + 1} / {count}
              </span>
            </span>
          ) : null}
          <span className="sr-only">{current.alt}</span>
        </div>

        {/* FEATURED — the next two supporting images, medium and visually important. */}
        {featured.length > 0 ? (
          <div className={cn("grid gap-3", featured.length === 1 ? "grid-cols-1" : "grid-cols-2")} data-gallery-featured>
            {featured.map((entry) => tile(entry, "featured"))}
          </div>
        ) : null}

        {/* MORE — every remaining image as a small, consistent thumbnail. */}
        {more.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" data-gallery-more>
            {more.map((entry) => tile(entry, "more"))}
          </div>
        ) : null}
      </div>
    </LayoutGroup>
  );
}
