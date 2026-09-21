import Image from "next/image";

import { Bilingual } from "@/components/locale/bilingual";
import { GsapScrollReveal } from "@/components/motion/gsap-scroll-reveal";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Process / Logistics Journey — Tomorro-Level Visual Redesign (Phase 5.5, UIF-056).
 *
 * ── ARCHITECTURAL JOURNEY COMPOSITION & APPROVED CONTENT ──────────────────────────────────────────
 *
 * 1. Botanical light surface (`bg-background`) providing calm visual rhythm after the dark sections.
 * 2. High-impact editorial headline with Burnt Orange (#a44819) badge and hairline rule.
 * 3. 4-Stage Connected Physical Logistics Path:
 *    - 01 Origin Relationships (`copy.sourcing.relationships`)
 *    - 02 Quality Documentation (`copy.sourcing.quality`)
 *    - 03 Controlled Custody (`copy.sourcing.custody`)
 *    - 04 Regional Logistics (`copy.sourcing.logistics`)
 *    100% sourced from approved bilingual copy dictionary.
 *
 * ── MOTION & ACCESSIBILITY ───────────────────────────────────────────────────────────────────────
 *
 * Server Component. Entrance animated via `GsapScrollReveal` with drawn vector path and
 * staggered card rises.
 */

type Stage = {
  key: "relationships" | "custody" | "logistics" | "quality";
  image: string;
  pick: (c: PublicCopy) => { title: string; body: string };
};

const STAGES: readonly Stage[] = [
  {
    key: "relationships",
    image: "/images/coffee-lot-4.jpg",
    pick: (c) => c.sourcing.relationships,
  },
  {
    key: "quality",
    image: "/images/coffee-lot-6.jpg",
    pick: (c) => c.sourcing.quality,
  },
  {
    key: "custody",
    image: "/images/coffee-lot-7.jpg",
    pick: (c) => c.sourcing.custody,
  },
  {
    key: "logistics",
    image: "/images/coffee-lot-1.jpg",
    pick: (c) => c.sourcing.logistics,
  },
] as const;

export function ProcessJourney() {
  return (
    <section className="bg-background py-[clamp(5rem,9vw,9.5rem)] text-foreground">
      <GsapScrollReveal className="hc-public-container" threshold={0.12}>
        {/* Section Header */}
        <div className="flex max-w-[50rem] flex-col items-start gap-4 sm:gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--hc-accent)] shadow-sm">
            <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
            <Bilingual pick={(c) => c.home.journey.eyebrow} />
          </div>

          <h2 className="font-heading text-[clamp(2.25rem,1.7rem+3vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance">
            <Bilingual pick={(c) => c.home.journey.title} />
          </h2>

          <span aria-hidden="true" className="h-0.5 w-14 bg-[var(--hc-accent)]" />

          <p className="max-w-[48ch] text-[clamp(1rem,0.95rem+0.25vw,1.1875rem)] leading-[1.7] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.home.journey.lead} />
          </p>
        </div>

        {/* The Logistics Path */}
        <div className="relative mt-14 sm:mt-20">
          {/* Horizontal drawn line on desktop */}
          <span
            aria-hidden="true"
            data-draw="x"
            className="absolute inset-x-0 top-[1.25rem] hidden h-px bg-[linear-gradient(90deg,var(--hc-accent)_0%,rgba(164,72,25,0.3)_100%)] lg:block rtl:bg-[linear-gradient(270deg,var(--hc-accent)_0%,rgba(164,72,25,0.3)_100%)]"
          />
          {/* Vertical drawn line on mobile */}
          <span
            aria-hidden="true"
            data-draw="y"
            className="absolute inset-y-0 start-[1.25rem] w-px bg-[var(--hc-accent)] opacity-50 lg:hidden"
          />

          <ol className="grid gap-8 lg:grid-cols-4 lg:gap-6">
            {STAGES.map((stage, index) => (
              <li
                key={stage.key}
                data-step
                className="group/stage relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 lg:grid-cols-1 lg:gap-x-0"
              >
                {/* Milestone Node */}
                <div className="flex items-center gap-3">
                  <span
                    dir="ltr"
                    aria-hidden="true"
                    className="relative z-10 inline-flex size-10 items-center justify-center rounded-full border-2 border-[var(--hc-accent)] bg-background font-heading text-sm font-semibold tabular-nums text-[var(--hc-accent)] shadow-sm"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                {/* Stage Card */}
                <div className="flex flex-col justify-between overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-[var(--hc-accent)] hover:shadow-[0_16px_36px_rgba(164,72,25,0.1)] lg:mt-6 sm:p-6">
                  <div className="flex flex-col gap-4">
                    {/* Documentary photo frame */}
                    <div className="relative aspect-[16/11] w-full overflow-hidden rounded-[var(--radius-lg)] bg-muted">
                      <Image
                        src={stage.image}
                        alt={copy.home.journey.alt[stage.key]}
                        fill
                        sizes="(min-width: 1024px) 23vw, 80vw"
                        className="object-cover object-center transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover/stage:scale-[1.06]"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="sr-only">
                        <Bilingual pick={(c) => c.home.journey.stepLabel} /> {index + 1}
                      </span>
                      <h3 className="font-heading text-xl font-semibold leading-[1.2] tracking-tight text-foreground transition-colors group-hover/stage:text-[var(--hc-accent)]">
                        <Bilingual pick={(c) => stage.pick(c).title} />
                      </h3>
                      <p className="text-sm leading-[1.7] text-muted-foreground text-pretty">
                        <Bilingual pick={(c) => stage.pick(c).body} />
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </GsapScrollReveal>
    </section>
  );
}
