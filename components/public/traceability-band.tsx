import Image from "next/image";

import { Bilingual } from "@/components/locale/bilingual";
import { GsapScrollReveal } from "@/components/motion/gsap-scroll-reveal";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Traceability — Architectural Custody Dossier (Phase 5.5, UIF-025 / UIF-026).
 *
 * ── ARCHITECTURAL COMPOSITION & APPROVED CONTENT ─────────────────────────────────────────────────
 *
 * 1. Deep photographic forest atmosphere (`origin-kenya.jpg`) with cinematic grading and warm
 *    ambient spotlight.
 * 2. High-impact headline hierarchy with Burnt Orange (#a44819) badge and editorial rule.
 * 3. 4-Stage Connected Chain of Responsibility:
 *    - 01 Origin (Where it grew)
 *    - 02 Quality (What travels with it)
 *    - 03 Custody (Who holds it)
 *    - 04 Membership (Who can trade it)
 *    Strictly using approved bilingual copy from `c.home.traceability.links` and `c.home.credibility`.
 *
 * ── MOTION & ACCESSIBILITY ───────────────────────────────────────────────────────────────────────
 *
 * Server Component. Entrance animation driven by `GsapScrollReveal` (island 5 helper).
 * Draws the connector path (`data-draw="x"`) and staggers the four custody cards in sequence.
 */

type ChainLink = {
  key: "origin" | "quality" | "custody" | "membership";
  pick: (c: PublicCopy) => { title: string; body: string };
};

const CHAIN: readonly ChainLink[] = [
  {
    key: "origin",
    pick: (c) => c.home.credibility.origin,
  },
  {
    key: "quality",
    pick: (c) => c.home.credibility.quality,
  },
  {
    key: "custody",
    pick: (c) => c.home.credibility.custody,
  },
  {
    key: "membership",
    pick: (c) => c.home.credibility.membership,
  },
] as const;

export function TraceabilityBand() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--hc-forest)] text-[#f2f5eb]">
      {/* Background photographic atmosphere */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/origin-kenya.jpg"
          alt={copy.home.traceability.imageAlt}
          fill
          sizes="100vw"
          className="object-cover object-[60%_40%] opacity-35"
        />
        {/* Multilayer dark forest washes */}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,35,20,0.92)_0%,rgba(18,35,20,0.85)_50%,rgba(18,35,20,0.96)_100%)]"
        />
        {/* Warm radial ember spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_40%,rgba(164,72,25,0.14),transparent_70%)]"
        />
      </div>

      <GsapScrollReveal className="hc-public-container py-[clamp(5rem,9vw,9.5rem)]">
        {/* Section Header */}
        <div className="flex max-w-[50rem] flex-col items-start gap-4 sm:gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(242,245,235,0.2)] bg-[rgba(18,35,20,0.65)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--hc-accent)] backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
            <Bilingual pick={(c) => c.home.traceability.eyebrow} />
          </div>

          <h2 className="font-heading text-[clamp(2.25rem,1.7rem+3vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-[#f2f5eb] text-balance">
            <Bilingual pick={(c) => c.home.traceability.title} />
          </h2>

          <span aria-hidden="true" className="h-0.5 w-14 bg-[var(--hc-accent)]" />

          <p className="max-w-[46ch] text-[clamp(1rem,0.95rem+0.25vw,1.1875rem)] leading-[1.7] text-[rgba(242,245,235,0.82)] text-pretty">
            <Bilingual pick={(c) => c.home.traceability.lead} />
          </p>
        </div>

        {/* The 4-Stage Architectural Chain */}
        <div className="relative mt-14 sm:mt-20">
          {/* Drawn connector line across the top */}
          <span
            aria-hidden="true"
            data-draw="x"
            className="absolute inset-x-0 top-6 hidden h-px bg-[linear-gradient(90deg,var(--hc-accent)_0%,rgba(164,72,25,0.35)_100%)] lg:block rtl:bg-[linear-gradient(270deg,var(--hc-accent)_0%,rgba(164,72,25,0.35)_100%)]"
          />

          <ol
            aria-label={copy.home.traceability.chainLabel}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6"
          >
            {CHAIN.map((link, index) => (
              <li
                key={link.key}
                data-step
                className="group/chain relative flex flex-col justify-between rounded-[var(--radius-xl)] border border-[rgba(242,245,235,0.14)] bg-[rgba(18,35,20,0.72)] p-6 sm:p-7 shadow-[0_16px_36px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all duration-500 hover:border-[var(--hc-accent)] hover:shadow-[0_20px_48px_rgba(164,72,25,0.2)]"
              >
                <div className="flex flex-col gap-4">
                  {/* Top numeral and approved link marker */}
                  <div className="flex items-center justify-between">
                    <span
                      dir="ltr"
                      aria-hidden="true"
                      className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--hc-accent)] bg-[rgba(164,72,25,0.12)] font-heading text-sm font-semibold tabular-nums text-[var(--hc-accent)]"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[rgba(242,245,235,0.65)]">
                      <Bilingual pick={(c) => c.home.traceability.links[link.key]} />
                    </span>
                  </div>

                  <h3 className="font-heading text-xl font-semibold leading-[1.2] text-[#f2f5eb] transition-colors group-hover/chain:text-[var(--hc-accent)]">
                    <Bilingual pick={(c) => link.pick(c).title} />
                  </h3>

                  <p className="text-sm leading-[1.7] text-[rgba(242,245,235,0.78)] text-pretty">
                    <Bilingual pick={(c) => link.pick(c).body} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </GsapScrollReveal>
    </section>
  );
}
