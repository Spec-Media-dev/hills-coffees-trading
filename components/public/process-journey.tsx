import Image from "next/image";

import { Bilingual } from "@/components/locale/bilingual";
import { GsapScrollReveal } from "@/components/motion/gsap-scroll-reveal";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Process / journey editorial section (Phase 5.5, UIF-056 — contract §18.12, §14.1; rebuilt as a
 * drawn journey by the public design convergence pass).
 *
 * ── STILL STATIC, STILL A SERVER COMPONENT ───────────────────────────────────────────────────────
 *
 * UIF-056 permits a static presentation when a selector adds nothing, and it still adds nothing:
 * the story section already gives the page its one timed selector. So this section renders no
 * selector, introduces no `"use client"` of its own, and contract §16 island 10
 * (`ProcessJourneySection`) is deliberately never created. The only client code it touches is the
 * shared scoped-GSAP reveal (island 5), which is a motion wrapper, not a page island.
 *
 * ── FROM ROWS TO A PATH ──────────────────────────────────────────────────────────────────────────
 *
 * The four stages were a numbered row list with thumbnails — a company process list. Board 3
 * concept 2 sets the new shape: a journey. On desktop the four stages stand as image-led columns
 * along one gold path, each numeral a marker on the line; the path is drawn and the stages rise in
 * sequence as the section enters (GSAP, one interaction). On mobile the same path turns vertical
 * down the inline-start with the image beside each stage — a different composition, not a squeeze.
 * Hover lifts each stage's photograph slightly (CSS).
 *
 * ── CONTENT IS APPROVED COPY, NOT AN INVENTED PROCESS ────────────────────────────────────────────
 *
 * The four stages are the reviewed `copy.sourcing.*` pillars — origin relationships, custody,
 * logistics, quality documentation. Nothing describes a step Hills does not operate. Photographs
 * are root-library documentary assets illustrating each stage; the restricted `18`–`21_process_*`
 * crops with burned-in step text are excluded (ASSET-REF-01), and none is a record's media.
 *
 * ── THE NUMERALS ARE TEXT ────────────────────────────────────────────────────────────────────────
 *
 * Rendered as text, never baked into an image, so they mirror under `dir="rtl"` and translate.
 */

type Stage = {
  key: "relationships" | "custody" | "logistics" | "quality";
  image: string;
  pick: (c: PublicCopy) => { title: string; body: string };
};

const STAGES: readonly Stage[] = [
  { key: "relationships", image: "/images/coffee-lot-4.jpg", pick: (c) => c.sourcing.relationships },
  { key: "custody", image: "/images/coffee-lot-7.jpg", pick: (c) => c.sourcing.custody },
  { key: "logistics", image: "/images/coffee-lot-1.jpg", pick: (c) => c.sourcing.logistics },
  { key: "quality", image: "/images/coffee-lot-6.jpg", pick: (c) => c.sourcing.quality },
] as const;

export function ProcessJourney() {
  return (
    <section className="bg-background py-[clamp(4rem,8vw,8.5rem)] text-foreground">
      <GsapScrollReveal className="hc-container" threshold={0.15}>
        <div className="flex max-w-[48rem] flex-col gap-3">
          <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.home.journey.eyebrow} />
          </span>
          <h2 className="hc-heading-2 font-semibold text-balance">
            <Bilingual pick={(c) => c.home.journey.title} />
          </h2>
          <p className="hc-body-lg max-w-[58ch] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.home.journey.lead} />
          </p>
        </div>

        <div className="relative mt-14 lg:mt-20">
          {/* The path. Horizontal along the markers on desktop; vertical down the inline-start below. */}
          <span
            aria-hidden="true"
            data-draw="x"
            className="absolute inset-x-0 top-[1.125rem] hidden h-px bg-[var(--gold-on-light)] lg:block dark:bg-[var(--gold-on-dark)]"
          />
          <span
            aria-hidden="true"
            data-draw="y"
            className="absolute inset-y-0 start-[1.125rem] w-px bg-[var(--gold-on-light)] lg:hidden dark:bg-[var(--gold-on-dark)]"
          />

          <ol className="grid gap-10 lg:grid-cols-4 lg:gap-6">
            {STAGES.map((stage, index) => (
              <li
                key={stage.key}
                data-step
                className="group/stage relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-5 lg:grid-cols-1 lg:gap-x-0"
              >
                {/* Marker on the path — text numeral, mirrored and translated by the browser. */}
                <span
                  dir="ltr"
                  aria-hidden="true"
                  className="relative z-10 inline-flex size-9 items-center justify-center rounded-full border border-[var(--gold-on-light)] bg-background font-heading text-[length:var(--text-meta)] font-semibold tabular-nums text-[var(--gold-on-light)] dark:border-[var(--gold-on-dark)] dark:text-[var(--gold-on-dark)]"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="flex flex-col gap-5 lg:mt-8">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-muted">
                    <Image
                      src={stage.image}
                      alt={copy.home.journey.alt[stage.key]}
                      fill
                      sizes="(min-width: 1024px) 23vw, 80vw"
                      className="object-cover object-center transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover/stage:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/stage:scale-100"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    {/* The visible marker is aria-hidden; this is what a screen reader hears. */}
                    <span className="sr-only">
                      <Bilingual pick={(c) => c.home.journey.stepLabel} /> {index + 1}
                    </span>
                    <h3 className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                      <Bilingual pick={(c) => stage.pick(c).title} />
                    </h3>
                    <p className="max-w-[40ch] text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
                      <Bilingual pick={(c) => stage.pick(c).body} />
                    </p>
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
