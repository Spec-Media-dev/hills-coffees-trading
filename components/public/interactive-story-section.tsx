"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";

import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * The interactive vertical story section (Phase 5.5, UIF-054 — contract §18.1–§18.11; visually
 * rebuilt and re-authored by the public design convergence pass).
 *
 * ── WHAT CHANGED, AND WHAT DID NOT ───────────────────────────────────────────────────────────────
 *
 * The BEHAVIOUR is the verified UIF-054 machine, untouched: ~3s per item with the rail visibly
 * consuming the interval, 1→2→3→4→1 looping, hover and keyboard-focus pause that freezes the
 * playhead and resumes from it, manual selection that restarts timing with exactly one cycle
 * running, wrapping previous/next, no auto-advance under reduced motion. One interaction, one
 * engine: GSAP drives rail fill, active state and image crossfade end to end (contract §13.2a).
 *
 * The CONTENT changed. The four items were the credibility pillars, which put "Reviewed membership"
 * beside a photograph of green beans — the copy and the image had nothing to do with each other.
 * The items now follow the coffee's own lifecycle, and each title and body describes exactly what
 * its photograph shows: cherries picked → drying beds → inspection in the sack → green coffee ready.
 * Every body is grounded in a claim already approved elsewhere in the dictionary; no variety,
 * origin, farm or grade is named. The credibility pillars moved to the traceability chain, where
 * they are the subject.
 *
 * The COMPOSITION changed. Board 1 example 2 and board 3 concept 1 set the shape: a deep-forest
 * panel; the story items and rail on the inline-start; a smaller, rounded image stage on the
 * inline-end with a fine offset hairline frame, the position counter at its top and the arrows at
 * its foot. The image is ~45% of the composition rather than the giant rectangle it was.
 *
 * ── SERVER/CLIENT ────────────────────────────────────────────────────────────────────────────────
 *
 * Contract §16 island 8 — the animated subtree only. Strings resolve from the T000 dictionary
 * through the locale provider, so the Arabic overlay flows in with no change here.
 */

/** Seconds each item holds before advancing. Contract §18.2 fixes this at approximately three. */
const INTERVAL_SECONDS = 3;

/** Image paths are technical constants, never copy (contract §3.7). */
type StoryItem = {
  id: "cherry" | "drying" | "inspection" | "green";
  src: string;
};

const ITEMS: readonly StoryItem[] = [
  { id: "cherry", src: "/images/roasting-profile.jpg" },
  { id: "drying", src: "/images/warehouse-bags.jpg" },
  { id: "inspection", src: "/images/cupping-lab.jpg" },
  { id: "green", src: "/images/greenCoffe1.png" },
];

const TOTAL = ITEMS.length;
const pad = (n: number) => String(n).padStart(2, "0");

const pickItem = (c: PublicCopy, id: StoryItem["id"]) => c.home.story.items[id];

export function InteractiveStorySection() {
  const { t } = useLocale();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // Read inside the build effect without making `paused` a dependency — that is what stops a hover
  // from tearing down and rebuilding the timeline (and losing the playhead).
  const pausedRef = useRef(false);

  // Declared BEFORE the build effect on purpose: React runs layout effects in declaration order, so
  // this mirror is always current by the time the build effect reads it.
  useLayoutEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const select = useCallback((index: number) => {
    setActive(((index % TOTAL) + TOTAL) % TOTAL);
  }, []);

  const step = useCallback((delta: number) => {
    setActive((current) => (current + delta + TOTAL) % TOTAL);
  }, []);

  /**
   * The advance timeline. Rebuilt only when `active` changes, so manual selection restarts timing
   * from the selected item and exactly one cycle is ever running.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const context = gsap.context(() => {
      const fills = root.querySelectorAll<HTMLElement>("[data-rail-fill]");
      const layers = root.querySelectorAll<HTMLElement>("[data-story-layer]");

      // Rail: everything before the active item reads as consumed, everything after as pending.
      fills.forEach((fill, index) => {
        gsap.set(fill, { scaleY: index < active ? 1 : 0 });
      });

      const media = gsap.matchMedia();

      media.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (self) => {
          const allowsMotion = Boolean(self.conditions?.motion);

          // Image crossfade — GSAP owns opacity on this surface; Motion is not used here.
          layers.forEach((layer, index) => {
            const isActive = index === active;
            if (!allowsMotion) {
              gsap.set(layer, { opacity: isActive ? 1 : 0, scale: 1 });
              return;
            }
            gsap.to(layer, {
              opacity: isActive ? 1 : 0,
              duration: 0.55,
              ease: "power2.inOut",
              overwrite: "auto",
            });
          });

          if (!allowsMotion) {
            // Static rail state, no auto-advance. Manual controls still drive everything.
            gsap.set(fills[active], { scaleY: 1 });
            return;
          }

          const timeline = gsap.timeline({ onComplete: () => step(1) });
          timeline.fromTo(
            fills[active],
            { scaleY: 0 },
            { scaleY: 1, duration: INTERVAL_SECONDS, ease: "none" },
          );
          // A subtle settle on the incoming photograph — part of the same GSAP sequence, so no
          // second engine ever touches this node.
          timeline.fromTo(
            layers[active],
            { scale: 1.035 },
            { scale: 1, duration: 1.1, ease: "power2.out" },
            0,
          );

          timelineRef.current = timeline;
          if (pausedRef.current) timeline.pause();

          return () => {
            timeline.kill();
            timelineRef.current = null;
          };
        },
      );

      return () => media.revert();
    }, root);

    return () => context.revert();
  }, [active, step]);

  /** Pause/resume the existing timeline in place, preserving the playhead. */
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (paused) timeline.pause();
    else timeline.resume();
  }, [paused]);

  /** Focus leaving the whole section resumes; moving between its own buttons does not. */
  const onBlurCapture = useCallback((event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setPaused(false);
    }
  }, []);

  const items = ITEMS.map((item) => ({ ...item, ...pickItem(t, item.id) }));
  const current = items[active];
  const position = t.home.story.positionLabel
    .replace("{current}", pad(active + 1))
    .replace("{total}", pad(TOTAL));

  const overlayControl =
    "border-[color-mix(in_srgb,var(--brand-cream)_40%,transparent)] bg-[color-mix(in_srgb,var(--forest-900)_45%,transparent)] text-[var(--brand-cream)] hover:bg-[color-mix(in_srgb,var(--forest-900)_70%,transparent)] focus-visible:outline-[var(--gold-on-dark)] supports-[backdrop-filter]:[backdrop-filter:blur(10px)]";

  return (
    <section className="relative isolate overflow-hidden bg-[var(--forest-900)] py-[clamp(4rem,8vw,8.5rem)] text-[var(--brand-cream)]">
      {/* A faint vignette so the panel has depth without a second background colour. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_0%,color-mix(in_srgb,var(--forest-600)_55%,transparent)_0%,transparent_60%)]"
      />
      <div
        ref={rootRef}
        className="hc-container"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={onBlurCapture}
      >
        {/*
          DESKTOP: the timed list on the inline-start, the image stage on the inline-end, at roughly
          55/45. Logical properties only, so RTL mirrors the whole composition.
          MOBILE: a different composition — media first, then the list beneath it.
        */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-20">
          <div className="order-2 flex flex-col gap-10 lg:order-1">
            <div className="flex max-w-[40rem] flex-col gap-3">
              <span className="hc-eyebrow text-[var(--gold-on-dark)]">{t.home.story.eyebrow}</span>
              <h2 className="hc-heading-2 font-semibold text-balance">{t.home.story.title}</h2>
              <p className="hc-body-lg max-w-[56ch] text-[color-mix(in_srgb,var(--brand-cream)_74%,transparent)] text-pretty">
                {t.home.story.lead}
              </p>
            </div>

            {/* ── THE TIMED LIST — items with the progress rail running beside them ── */}
            <ul aria-label={t.home.story.listLabel} className="flex flex-col">
              {items.map((item, index) => {
                const isActive = index === active;
                return (
                  <li key={item.id} className="flex gap-5 sm:gap-6">
                    {/* Rail: a track per item, its fill scaled by GSAP over the interval. */}
                    <span
                      aria-hidden="true"
                      className="relative mt-3 w-px shrink-0 self-stretch bg-[color-mix(in_srgb,var(--brand-cream)_22%,transparent)]"
                    >
                      <span
                        data-rail-fill
                        className="absolute inset-0 origin-top bg-[var(--gold-on-dark)]"
                        style={{ transform: "scaleY(0)" }}
                      />
                      <span
                        style={{ insetInlineStart: "-5px" }}
                        className={`absolute top-0 size-[11px] rounded-full border transition-[background-color,border-color,box-shadow] duration-[var(--dur-base)] ${
                          isActive
                            ? "border-[var(--gold-on-dark)] bg-[var(--gold-on-dark)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--gold-on-dark)_22%,transparent)]"
                            : index < active
                              ? "border-[var(--gold-on-dark)] bg-[var(--forest-900)]"
                              : "border-[color-mix(in_srgb,var(--brand-cream)_35%,transparent)] bg-[var(--forest-900)]"
                        }`}
                      />
                    </span>

                    <button
                      type="button"
                      onClick={() => select(index)}
                      aria-current={isActive ? "true" : undefined}
                      className="group/story flex-1 rounded-[var(--radius-sm)] pb-7 text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gold-on-dark)]"
                    >
                      <span className="flex min-h-11 items-baseline gap-4">
                        <span
                          dir="ltr"
                          className={`font-heading text-[length:var(--text-meta)] tabular-nums transition-colors duration-[var(--dur-base)] ${
                            isActive ? "text-[var(--gold-on-dark)]" : "text-[color-mix(in_srgb,var(--brand-cream)_45%,transparent)]"
                          }`}
                        >
                          {pad(index + 1)}
                        </span>
                        <span
                          className={`font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] transition-colors duration-[var(--dur-base)] ${
                            isActive
                              ? "text-[var(--brand-cream)]"
                              : "text-[color-mix(in_srgb,var(--brand-cream)_58%,transparent)] group-hover/story:text-[color-mix(in_srgb,var(--brand-cream)_85%,transparent)]"
                          }`}
                        >
                          {item.title}
                        </span>
                      </span>
                      <span
                        className={`mt-1.5 block max-w-[46ch] ps-[calc(1.5rem+1rem)] text-[length:var(--text-small)] leading-[1.7] text-pretty transition-[opacity,color] duration-[var(--dur-base)] ${
                          isActive
                            ? "text-[color-mix(in_srgb,var(--brand-cream)_74%,transparent)]"
                            : "text-[color-mix(in_srgb,var(--brand-cream)_42%,transparent)]"
                        }`}
                      >
                        {item.body}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── MEDIA STAGE — a reserved, fixed-ratio box so no swap can shift layout ── */}
          <div className="relative order-1 mx-auto w-full max-w-[30rem] lg:order-2 lg:max-w-none">
            {/* Offset hairline frame — the boards' fine gold outline, kept to one line. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-3 rounded-[calc(var(--radius-2xl)+0.75rem)] border border-[color-mix(in_srgb,var(--gold-on-dark)_35%,transparent)] sm:-inset-4"
            />
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--forest-800)] shadow-[0_32px_80px_rgba(0,0,0,0.42)] sm:aspect-[4/5] lg:max-h-[36rem]">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  data-story-layer
                  aria-hidden={index !== active}
                  className="absolute inset-0"
                  style={{ opacity: index === active ? 1 : 0 }}
                >
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(min-width: 1024px) 40vw, 92vw"
                    className="object-cover object-center"
                  />
                </div>
              ))}

              {/* Scrims so the counter and the arrows stay legible over any photograph. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[color-mix(in_srgb,var(--forest-900)_60%,transparent)] to-transparent"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[color-mix(in_srgb,var(--forest-900)_82%,transparent)] to-transparent"
              />

              <span
                dir="ltr"
                data-story-counter
                className="absolute end-5 top-5 font-heading text-[length:var(--text-small)] font-semibold tracking-[0.14em] text-[var(--brand-cream)]"
              >
                {pad(active + 1)} / {pad(TOTAL)}
              </span>

              <div className="absolute inset-x-0 bottom-5 flex items-end justify-between gap-4 px-5">
                <span className="max-w-[60%] font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] text-[var(--brand-cream)]">
                  {current.title}
                </span>
                <div className="flex items-center gap-2">
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={t.home.story.previous}
                    onClick={() => step(-1)}
                    className={overlayControl}
                  >
                    <Icon name="chevron-left" data-directional-icon="true" className="size-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={t.home.story.next}
                    onClick={() => step(1)}
                    className={overlayControl}
                  >
                    <Icon name="chevron-right" data-directional-icon="true" className="size-4" />
                  </IconButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Announced to assistive technology independently of any visual affordance. */}
        <p className="sr-only" aria-live="polite">
          {position} — {current.title}
        </p>
      </div>
    </section>
  );
}
