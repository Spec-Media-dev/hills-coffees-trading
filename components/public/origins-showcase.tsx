"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { OriginCard, type OriginCardTone } from "@/components/public/origin-card";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import type { PublicOriginSummary } from "@/lib/public/origins";

/**
 * Origins horizontal showcase (Phase 5.5, UIF-055 — contract §18.12, §18.5–§18.11).
 *
 * ── DATA ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Rendered from the **already-fetched** public origins DTO handed down by the homepage's Server
 * Component. No route, no query and no database call is added, and nothing beyond
 * `PublicOriginSummary` crosses the boundary — so no availability, quantity or private field can
 * appear, because none exists on the object.
 *
 * No image occupies an origin **record's** media slot: `OriginCard` is deliberately typographic
 * (MEDIA-01), and the `22`–`25_origin_*_landscape.jpg` crops are not used — their filenames match
 * some origin names by coincidence of the asset pack, not by provenance.
 *
 * ── ONE ENGINE OWNS THE ADVANCE ──────────────────────────────────────────────────────────────────
 *
 * The advance is **native scroll** — CSS scroll-snap for the track, `scrollTo` for the controls —
 * and that single mechanism owns it end to end. Neither GSAP nor Motion animates this interaction,
 * so contract §13.2a's one-engine rule holds by construction.
 *
 * The task offers GSAP *or* Motion, on the assumption that a synchronised progress indicator needs a
 * driven timeline. It does not: the indicator is **derived state**, read back from the real
 * `scrollLeft` on every scroll event. That is strictly better than animating a second value in
 * parallel — the bar cannot drift from the track, momentum scrolling and trackpad gestures stay
 * accurate, and there is no timeline to leak. It is recorded in `ANIMATION-OWNERSHIP.md`.
 *
 * ── DIRECTION ────────────────────────────────────────────────────────────────────────────────────
 *
 * `scrollLeft` is negative-going in RTL in Chromium's spec-compliant mode, so every measurement uses
 * `Math.abs` and every step is applied in the writing direction rather than as a physical left/right
 * offset. Previous/next therefore keep their *semantics* under `dir="rtl"` while the icons mirror
 * through the shared `[data-directional-icon]` rule.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────────────────────────
 *
 * Under `prefers-reduced-motion: reduce` the smooth-scroll behaviour becomes an instant jump. Every
 * control keeps working and every card stays reachable — the section is never gated behind motion.
 */

/** How far a single previous/next press travels, as a fraction of the visible track. */
const STEP_RATIO = 0.9;

/**
 * Slack when deciding whether the track is resting at an end.
 *
 * Scroll-snap settles a card a pixel or two off the exact target, so an equality test would
 * intermittently miss the edge and skip a wrap.
 */
const EDGE_TOLERANCE = 4;

export function OriginsShowcase({
  origins,
  tone = "light",
}: {
  origins: PublicOriginSummary[];
  /** "dark" renders glass cards and cream controls for the homepage's forest environment. */
  tone?: OriginCardTone;
}) {
  const { t } = useLocale();
  const trackRef = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState(0);
  /**
   * Whether the track can actually scroll at this viewport.
   *
   * Card count alone does not decide it: two cards fit inside a 1440px frame without overflowing, and
   * rendering previous/next there would put a control on screen that cannot do anything — exactly the
   * decorative non-functional control contract §18.5 forbids. Measured, not assumed, and re-measured
   * on resize so the controls appear the moment the track genuinely overflows.
   */
  const [scrollable, setScrollable] = useState(false);

  /**
   * The track's resting position at the beginning is **not** zero.
   *
   * The track carries `padding-inline` so its cards line up with the product grid, and
   * `scroll-snap-align: start` rests the first card against the padding box — so `scrollLeft` settles
   * at the inline-start padding (16px at mobile, up to 48px at wide viewports), never at 0. Comparing
   * against 0 therefore made "am I at the start?" permanently false, and `previous` refused to wrap.
   * Every edge test below is measured against this value instead.
   */
  const startEdge = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
  }, []);

  /** Reads the indicator straight off the track, so it can never disagree with what is on screen. */
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    // RTL reports scrollLeft as negative in the spec-compliant mode Chromium uses.
    const offset = Math.abs(track.scrollLeft);
    const edge = startEdge();
    const span = Math.max(1, max - edge);
    setScrollable(max > EDGE_TOLERANCE);
    setProgress(max > 1 ? Math.min(1, Math.max(0, (offset - edge) / span)) : 1);
  }, [startEdge]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    track.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      track.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;

    const max = track.scrollWidth - track.clientWidth;
    const current = Math.abs(track.scrollLeft);
    const delta = track.clientWidth * STEP_RATIO;
    const edge = startEdge();

    // Wrap in both directions, as contract §18.5 requires — measured against the real resting
    // position at each end, not against 0 (see `startEdge`).
    let next = current + direction * delta;
    if (direction === 1 && current >= max - EDGE_TOLERANCE) next = edge;
    else if (direction === -1 && current <= edge + EDGE_TOLERANCE) next = max;
    next = Math.max(0, Math.min(max, next));

    const rtl = getComputedStyle(track).direction === "rtl";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: rtl ? -next : next, behavior: reduce ? "auto" : "smooth" });
  }, [startEdge]);

  if (origins.length === 0) return null;

  const labels = t.origins.showcase;
  const controlClass =
    tone === "dark"
      ? "border-[color-mix(in_srgb,var(--brand-cream)_40%,transparent)] text-[var(--brand-cream)] hover:bg-[color-mix(in_srgb,var(--brand-cream)_12%,transparent)] focus-visible:outline-[var(--gold-on-dark)]"
      : undefined;

  return (
    <div className="flex flex-col gap-8">
      {/*
        `overflow-x-auto` with scroll-snap. `scrollbar-width: none` hides the native bar because the
        progress indicator below already reports position; the track stays keyboard-scrollable and
        every card remains a real focusable link.
      */}
      <ul
        ref={trackRef}
        data-origins-track
        aria-label={labels.trackLabel}
        className="-mx-[var(--gutter-page)] flex snap-x snap-mandatory gap-6 overflow-x-auto px-[var(--gutter-page)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {origins.map((origin) => (
          <li
            key={origin.slug}
            className="w-[min(21rem,78vw)] shrink-0 snap-start sm:w-[min(23rem,60vw)]"
          >
            <OriginCard origin={origin} tone={tone} />
          </li>
        ))}
      </ul>

      {scrollable ? (
        <div className="flex items-center gap-5">
          {/* Progress: derived from real scroll position, never from an animated value. */}
          <div
            role="progressbar"
            aria-label={labels.progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            data-origins-progress
            className={`h-px flex-1 ${tone === "dark" ? "bg-[color-mix(in_srgb,var(--brand-cream)_22%,transparent)]" : "bg-border"}`}
          >
            <span
              className={`block h-px transition-[width] duration-[var(--dur-fast)] ${tone === "dark" ? "bg-[var(--gold-on-dark)]" : "bg-[var(--gold-on-light)] dark:bg-[var(--gold-on-dark)]"}`}
              style={{ width: `${Math.max(8, progress * 100)}%` }}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <IconButton
              type="button"
              variant="outline"
              aria-label={labels.previous}
              onClick={() => step(-1)}
              className={controlClass}
            >
              <Icon name="chevron-left" data-directional-icon="true" className="size-4" />
            </IconButton>
            <IconButton
              type="button"
              variant="outline"
              aria-label={labels.next}
              onClick={() => step(1)}
              className={controlClass}
            >
              <Icon name="chevron-right" data-directional-icon="true" className="size-4" />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
