"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import type { ReactNode } from "react";

/**
 * The hero entrance choreography (Phase 5.5, UIF-024 — contract §13.1, §13.2a, §13.3, §13.5).
 *
 * ── WHY THIS IS THE ISLAND BOUNDARY ──────────────────────────────────────────────────────────────
 *
 * This is contract §16 **island 7**, and it is deliberately the *animated subtree only*. It receives
 * the already-rendered hero markup as `children` from a Server Component parent, so `hero.tsx`,
 * `src/app/page.tsx` and the whole public page tree stay Server Components. No copy, no DTO and no
 * image decision crosses the boundary — only the elements that move.
 *
 * ── ONE ENGINE, END TO END ───────────────────────────────────────────────────────────────────────
 *
 * The hero entrance is **one interaction**, so exactly one engine drives it: **GSAP**. Motion is not
 * used anywhere inside this subtree (contract §13.2a), and CSS keeps hover/focus on the CTAs. That is
 * why the children are addressed by `data-hero-*` attributes rather than wrapped in `<Reveal>` — a
 * Motion wrapper here would put two engines on one sequence.
 *
 * ── SCOPING AND CLEANUP ──────────────────────────────────────────────────────────────────────────
 *
 * Every tween is created inside a `gsap.context()` bound to this element's ref and reverted on
 * unmount, so a mount → unmount → remount cycle leaves `gsap.globalTimeline` at its previous child
 * count. `context.revert()` also restores every inline style GSAP wrote, which is what keeps a
 * remount from inheriting a half-finished transform.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────────────────────────
 *
 * `gsap.matchMedia()` is the guard rather than a hand-rolled query: under
 * `prefers-reduced-motion: reduce` the timeline is simply never built, and because the markup ships
 * visible by default (no `opacity-0` class), the hero renders complete and immediately. Nothing is
 * hidden behind motion, so no information can be lost — the sequence is an enhancement on top of a
 * finished page, not the thing that makes it appear.
 */

/** Selectors the timeline drives. The hero markup tags its parts with these. */
const MEDIA = "[data-hero-media]";
const SCRIM = "[data-hero-scrim]";
const STAGGER = "[data-hero-step]";

export function AnimatedHero({ children }: { children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const context = gsap.context(() => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({
          defaults: { ease: "power3.out" },
          // A single frame of delay lets the font swap settle, so the headline does not animate and
          // then reflow.
          delay: 0.05,
        });

        // Media settle first — the photograph fills the frame, a slow scale-down reads as a camera
        // coming to rest — then the scrims deepen, then the words arrive on the environment.
        timeline
          .fromTo(
            scope.querySelectorAll(MEDIA),
            { opacity: 0, scale: 1.07 },
            { opacity: 1, scale: 1, duration: 1.5, ease: "power2.out" },
          )
          .fromTo(
            scope.querySelectorAll(SCRIM),
            { opacity: 0 },
            { opacity: 1, duration: 0.8 },
            "-=1.1",
          )
          // Eyebrow → headline → rule → glass panel → scroll cue, as one staggered rise.
          .fromTo(
            scope.querySelectorAll(STAGGER),
            { opacity: 0, y: 22 },
            { opacity: 1, y: 0, duration: 0.7, stagger: 0.09 },
            "-=0.7",
          );

        return () => {
          timeline.kill();
        };
      });

      return () => {
        media.revert();
      };
    }, scope);

    return () => context.revert();
  }, []);

  return (
    <div ref={scopeRef} className="contents">
      {children}
    </div>
  );
}
