"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";

import { EnglishCopy } from "@/components/locale/bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * The interactive vertical story section (Phase 5.5, UIF-054 — contract §18.1–§18.11).
 *
 * ── CONTENT IS ALREADY-APPROVED COPY ─────────────────────────────────────────────────────────────
 *
 * The four items are the reviewed `home.credibility.*` pillars — origin relationships, documented
 * quality, custody through to transfer, reviewed membership. They were already on this page as a flat
 * definition list; this section makes them image-led and timed **without writing a single new claim**.
 * Every string resolves from the T000 dictionary through the locale provider, so an approved Arabic
 * translation would flow in automatically and, until then, the reviewed English is shown honestly.
 *
 * The photographs are repository-owned editorial assets illustrating how Hills works. None is
 * presented as the media of a specific coffee or origin **record** — MEDIA-01 is untouched.
 *
 * ── ONE INTERACTION, ONE ENGINE ──────────────────────────────────────────────────────────────────
 *
 * The item advance — rail fill, active-item state and image crossfade — is **one** interaction, so
 * GSAP drives all three end to end (contract §13.2a). Motion is deliberately absent from this
 * subtree: a Presence crossfade here would put a second engine on the same sequence. CSS keeps hover
 * and focus.
 *
 * ── WHY PAUSE PRESERVES PROGRESS ─────────────────────────────────────────────────────────────────
 *
 * The timeline is rebuilt only when the **active item** changes. Pausing is applied imperatively to
 * the existing timeline through a ref, never by re-running the build effect — which is exactly what
 * makes `mouseleave` resume from the frozen playhead instead of restarting the fill at zero. It is
 * also why twenty hover cycles cannot accumulate timers or timelines: hovering creates nothing.
 *
 * ── PAUSE IS NOT HOVER-ONLY ──────────────────────────────────────────────────────────────────────
 *
 * Keyboard focus entering the section pauses it too, and every item is a real button, so a keyboard
 * or touch visitor has the same control a mouse visitor has (contract §18.11). Hover is an
 * enhancement on top, never the only way to stop the motion.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────────────────────────
 *
 * Under `prefers-reduced-motion: reduce` the timeline is never built: there is no auto-advance, the
 * image swaps instantly, and the rail renders its static state. Every item, arrow and word remains —
 * the section becomes a manually-driven gallery rather than a degraded one.
 */

/** Seconds each item holds before advancing. Contract §18.2 fixes this at approximately three. */
const INTERVAL_SECONDS = 3;

/** Image paths are technical constants, never copy (contract §3.7). */
type StoryItem = {
  id: string;
  src: string;
  pick: (c: PublicCopy) => { title: string; body: string };
  alt: (c: PublicCopy) => string;
};

const ITEMS: readonly StoryItem[] = [
  {
    id: "origin",
    src: "/images/roasting-profile.jpg",
    pick: (c) => c.home.credibility.origin,
    alt: (c) => c.home.story.alt.origin,
  },
  {
    id: "quality",
    src: "/images/cupping-lab.jpg",
    pick: (c) => c.home.credibility.quality,
    alt: (c) => c.home.story.alt.quality,
  },
  {
    id: "custody",
    src: "/images/warehouse-bags.jpg",
    pick: (c) => c.home.credibility.custody,
    alt: (c) => c.home.story.alt.custody,
  },
  {
    id: "membership",
    src: "/images/greenCoffe1.png",
    pick: (c) => c.home.credibility.membership,
    alt: (c) => c.home.story.alt.membership,
  },
];

const TOTAL = ITEMS.length;
const pad = (n: number) => String(n).padStart(2, "0");

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
  // this mirror is always current by the time the build effect reads it. Writing the ref during
  // render instead would be a React Compiler violation.
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

  const items = ITEMS.map((item) => ({ ...item, ...item.pick(t), altText: item.alt(t) }));
  const current = items[active];
  const position = t.home.story.positionLabel
    .replace("{current}", pad(active + 1))
    .replace("{total}", pad(TOTAL));

  const overlayControl =
    "border-[color-mix(in_srgb,var(--brand-cream)_45%,transparent)] bg-[color-mix(in_srgb,var(--forest-800)_45%,transparent)] text-[var(--brand-cream)] hover:bg-[color-mix(in_srgb,var(--forest-800)_68%,transparent)]";

  return (
    <section className="bg-secondary py-[clamp(3.5rem,7vw,7.5rem)] text-foreground">
      <div
        ref={rootRef}
        className="hc-container"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={onBlurCapture}
      >
        <div className="flex max-w-[46rem] flex-col gap-3">
          <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <EnglishCopy>{t.home.story.eyebrow}</EnglishCopy>
          </span>
          <h2 className="hc-heading-2 font-semibold">
            <EnglishCopy>{t.home.story.title}</EnglishCopy>
          </h2>
          <p className="hc-body-lg max-w-[58ch] text-muted-foreground text-pretty">
            <EnglishCopy>{t.home.story.lead}</EnglishCopy>
          </p>
        </div>

        {/*
          DESKTOP: media on the inline-end, the timed list on the inline-start. Logical properties
          only, so RTL mirrors the whole composition without a physical rule anywhere.
          MOBILE: a different composition — media first, then the list beneath it — rather than the
          desktop split squeezed narrow.
        */}
        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
          {/* ── MEDIA STAGE — a reserved, fixed-ratio box so no swap can shift layout ── */}
          <div className="relative order-1 aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-arch)] border border-border bg-muted shadow-[var(--shadow-lg)] sm:aspect-[3/4] lg:order-2 lg:aspect-[4/5]">
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
                  alt={item.altText}
                  fill
                  sizes="(min-width: 1024px) 44vw, 92vw"
                  className="object-cover object-center"
                />
              </div>
            ))}

            {/* Warm forest scrim so the counter and arrows stay legible over any photograph. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[color-mix(in_srgb,var(--forest-800)_80%,transparent)] to-transparent"
            />

            <div className="absolute inset-x-0 bottom-4 flex items-center justify-between px-5">
              <span
                dir="ltr"
                data-story-counter
                className="hc-meta font-semibold tracking-[0.14em] text-[var(--brand-cream)]"
              >
                {pad(active + 1)} / {pad(TOTAL)}
              </span>
              <div className="flex items-center gap-2">
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={t.home.story.previous}
                  onClick={() => step(-1)}
                  className={overlayControl}
                >
                  <Icon name="chevron-left" className="size-4" />
                </IconButton>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={t.home.story.next}
                  onClick={() => step(1)}
                  className={overlayControl}
                >
                  <Icon name="chevron-right" className="size-4" />
                </IconButton>
              </div>
            </div>
          </div>

          {/* ── THE TIMED LIST — items with the progress rail running beside them ── */}
          <ul aria-label={t.home.story.listLabel} className="order-2 flex flex-col lg:order-1">
            {items.map((item, index) => {
              const isActive = index === active;
              return (
                <li key={item.id} className="flex gap-5">
                  {/* Rail: a track per item, its fill scaled by GSAP over the interval. */}
                  <span
                    aria-hidden="true"
                    className="relative mt-2 w-px shrink-0 self-stretch bg-border"
                  >
                    <span
                      data-rail-fill
                      className="absolute inset-0 origin-top bg-[var(--gold-on-light)] dark:bg-[var(--gold-on-dark)]"
                      style={{ transform: "scaleY(0)" }}
                    />
                    <span
                      style={{ insetInlineStart: "-3px" }}
                      className={`absolute top-0 size-[7px] rounded-full border transition-colors duration-[var(--dur-fast)] ${
                        isActive
                          ? "border-[var(--gold-on-light)] dark:border-[var(--gold-on-dark)] bg-[var(--gold-on-light)] dark:bg-[var(--gold-on-dark)]"
                          : "border-border bg-secondary"
                      }`}
                    />
                  </span>

                  <button
                    type="button"
                    onClick={() => select(index)}
                    aria-current={isActive ? "true" : undefined}
                    className="group/story flex-1 rounded-[var(--radius-sm)] pb-8 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <span
                      className={`flex min-h-11 items-center text-[1.0625rem] font-semibold transition-colors duration-[var(--dur-fast)] ${
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground group-hover/story:text-foreground"
                      }`}
                    >
                      <EnglishCopy>{item.title}</EnglishCopy>
                    </span>
                    <span
                      className={`mt-1 block max-w-[46ch] text-[0.9375rem] leading-[1.7] text-pretty transition-opacity duration-[var(--dur-base)] ${
                        isActive ? "text-muted-foreground opacity-100" : "text-muted-foreground/70"
                      }`}
                    >
                      <EnglishCopy>{item.body}</EnglishCopy>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Announced to assistive technology independently of any visual affordance. */}
        <p className="sr-only" aria-live="polite">
          {position} — {current.title}
        </p>
      </div>
    </section>
  );
}
