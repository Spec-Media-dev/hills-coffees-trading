import { copy } from "@/lib/public/copy";

/**
 * Stable labelled media placeholder (Feature 002, T006 — FR-028; MEDIA-01).
 *
 * MEDIA-01: the approved database has no bucket and no public file-delivery path, so there is
 * nothing legitimate to render in a media slot yet. This component fills that slot honestly:
 *
 *   - it builds NO file URL — not from a row id, not by convention, not by proxy;
 *   - it creates no bucket and reads no asset table;
 *   - it says plainly that imagery has not been published, rather than mimicking a broken image.
 *
 * When MEDIA-01 is resolved, the owning feature replaces the inner content — the *reserved box*
 * stays, which is what keeps the layout stable across the change.
 *
 * LAYOUT STABILITY (SC-005 / CLS): the box reserves its space before anything loads, via
 * `aspect-ratio` on a full-width block. Nothing is fetched, so there is no load event and therefore
 * no shift. Callers pass the ratio that matches the slot they are filling.
 *
 * All user-facing text comes from T000's dictionary (FR-018, SC-012) — including the accessible
 * name, which is copy, not a technical constant (copy contract §3.6).
 *
 * Server Component — zero client JavaScript. Logical CSS properties only (FR-018).
 */

export type MediaPlaceholderProps = {
  /**
   * CSS `aspect-ratio` for the reserved box, e.g. `"16 / 9"` or `"1 / 1"`. Defaults to a 3:2
   * landscape slot. A technical layout value, not copy.
   */
  aspectRatio?: string;
  /** Optional extra classes for the caller's own spacing/rounding needs. */
  className?: string;
};

const DEFAULT_ASPECT_RATIO = "3 / 2";

export function MediaPlaceholder({
  aspectRatio = DEFAULT_ASPECT_RATIO,
  className,
}: MediaPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={copy.media.placeholderLabel}
      data-media-placeholder="true"
      // The inline aspect-ratio is what reserves the space deterministically for any caller-supplied
      // ratio; Tailwind cannot generate an arbitrary runtime value here.
      style={{ aspectRatio }}
      className={[
        "relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-border bg-muted px-6 py-4 text-center",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/*
        `aria-hidden` on the visible text: the accessible name already comes from the `aria-label`
        above, so exposing both would make a screen reader announce the same thing twice.
      */}
      <span
        aria-hidden="true"
        className="absolute size-28 rounded-t-full border border-accent/35 opacity-60"
      />
      <span aria-hidden="true" className="relative text-sm font-semibold text-foreground">
        {copy.media.placeholderLabel}
      </span>
      <span aria-hidden="true" className="relative max-w-56 text-xs leading-relaxed text-muted-foreground">
        {copy.media.placeholderDescription}
      </span>
    </div>
  );
}
