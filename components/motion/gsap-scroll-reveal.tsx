"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";

/**
 * Scoped GSAP scroll reveal (public design convergence pass — contract §13.1, §13.2, §13.3, §13.5;
 * the "scoped GSAP helper" half of contract §16 island 5).
 *
 * ── WHAT IT OWNS ─────────────────────────────────────────────────────────────────────────────────
 *
 * One editorial reveal per mounted subtree, played once when the subtree enters the viewport:
 *
 *   - `[data-draw="x"|"y"]` connectors are drawn from zero along their axis (scaleX / scaleY, with
 *     the origin set from the writing direction so the line grows from the inline-start under RTL
 *     as well);
 *   - `[data-step]` blocks rise in, staggered, after the line begins.
 *
 * The connector draw and the step stagger are one synchronised sequence, so one engine — GSAP —
 * owns both end to end. Nothing inside a subtree wrapped by this component may be wrapped by the
 * Motion `Reveal` (that would be two engines on one interaction, contract §13.2a).
 *
 * ── SCOPING AND CLEANUP ──────────────────────────────────────────────────────────────────────────
 *
 * Everything is created inside `gsap.context()` bound to this element and reverted on unmount; the
 * observer is disconnected as soon as it fires or the component unmounts. Mount → unmount → remount
 * leaves the global timeline child count unchanged.
 *
 * ── REDUCED MOTION, AND NO JAVASCRIPT ────────────────────────────────────────────────────────────
 *
 * The markup ships fully visible. Under `prefers-reduced-motion: reduce` the timeline is never built
 * and nothing is ever hidden, so the section renders finished and immediately. The initial hidden
 * states are set in a layout effect only when motion is allowed, so there is no flash either way.
 */
export function GsapScrollReveal({
  children,
  className,
  threshold = 0.22,
}: {
  children: ReactNode;
  className?: string;
  /** Fraction of the subtree that must be visible before the sequence plays. */
  threshold?: number;
}) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const context = gsap.context(() => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const rtl = getComputedStyle(scope).direction === "rtl";
        const drawsX = scope.querySelectorAll<HTMLElement>('[data-draw="x"]');
        const drawsY = scope.querySelectorAll<HTMLElement>('[data-draw="y"]');
        const steps = scope.querySelectorAll<HTMLElement>("[data-step]");

        // GSAP warns on an empty target list, so each group is only wired when it exists — a
        // section may draw only a horizontal line (the chain) or only a vertical one (mobile path).
        if (drawsX.length) gsap.set(drawsX, { scaleX: 0, transformOrigin: rtl ? "100% 50%" : "0% 50%" });
        if (drawsY.length) gsap.set(drawsY, { scaleY: 0, transformOrigin: "50% 0%" });
        if (steps.length) gsap.set(steps, { opacity: 0, y: 18 });

        const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
        if (drawsX.length) timeline.to(drawsX, { scaleX: 1, duration: 1.2, ease: "power2.inOut", stagger: 0.12 }, 0);
        if (drawsY.length) timeline.to(drawsY, { scaleY: 1, duration: 1.2, ease: "power2.inOut", stagger: 0.12 }, 0);
        if (steps.length) timeline.to(steps, { opacity: 1, y: 0, duration: 0.65, stagger: 0.11 }, 0.18);

        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              timeline.play();
              observer.disconnect();
            }
          },
          { threshold },
        );
        observer.observe(scope);

        return () => {
          observer.disconnect();
          timeline.kill();
        };
      });

      return () => media.revert();
    }, scope);

    return () => context.revert();
  }, [threshold]);

  return (
    <div ref={scopeRef} className={className}>
      {children}
    </div>
  );
}
