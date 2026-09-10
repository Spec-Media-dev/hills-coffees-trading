import Image from "next/image";

import { EnglishCopy } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";

/**
 * Process / journey editorial section (Phase 5.5, UIF-056 — contract §18.12, §14.1).
 *
 * ── WHY THIS ONE IS STATIC ───────────────────────────────────────────────────────────────────────
 *
 * UIF-056 permits "a purely static presentation ... if the selector adds nothing", and here it adds
 * nothing: `InteractiveStorySection` already gives this page one timed selector, and a second one a
 * few sections later would read as a gimmick rather than as editorial rhythm. So this section stays a
 * **Server Component**, introduces no `"use client"`, and contract §16 island 10
 * (`ProcessJourneySection`) is deliberately never created. The page keeps one interactive moment and
 * spends its variety on composition instead.
 *
 * ── CONTENT IS APPROVED COPY, NOT AN INVENTED PROCESS ────────────────────────────────────────────
 *
 * The four stages are the reviewed `copy.sourcing.*` pillars — origin relationships, custody,
 * logistics, quality documentation. Nothing here describes a step Hills does not operate, and no
 * logistics, custody or compliance claim is strengthened beyond the wording already approved for the
 * sourcing page. The complementary framing lives in `copy.home.journey`.
 *
 * ── THE NUMERALS ARE TEXT ────────────────────────────────────────────────────────────────────────
 *
 * Stage numbers are rendered as real text, never baked into an image. That is what lets them mirror
 * under `dir="rtl"` and translate under `ar` — and it is why the restricted `18`–`21_process_*.jpg`
 * crops, which carry burned-in "01 Cultivation" style English, are excluded (ASSET-REF-01).
 *
 * Thumbnails are small-slot `features/` crops used at small-slot size, exactly as the UIF-052 asset
 * map classes them. They illustrate the stage; none is the media of a database record (MEDIA-01).
 */

/** Image paths and dictionary keys are technical constants, never copy (contract §3.7). */
const STAGES = [
  { id: "relationships", thumb: "/images/features/03_coffee_farm_landscape.jpg", pick: copy.sourcing.relationships },
  { id: "custody", thumb: "/images/features/17_process_mountain_farm.jpg", pick: copy.sourcing.custody },
  { id: "logistics", thumb: "/images/features/28_cta_green_beans_closeup.jpg", pick: copy.sourcing.logistics },
  { id: "quality", thumb: "/images/features/16_interactive_cherries.jpg", pick: copy.sourcing.quality },
] as const;

export function ProcessJourney() {
  return (
    <section className="bg-background py-[clamp(3.5rem,7vw,7.5rem)] text-foreground">
      <div className="hc-container">
        <div className="flex max-w-[48rem] flex-col gap-3">
          <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <EnglishCopy>{copy.home.journey.eyebrow}</EnglishCopy>
          </span>
          <h2 className="hc-heading-2 font-semibold text-balance">
            <EnglishCopy>{copy.home.journey.title}</EnglishCopy>
          </h2>
          <p className="hc-body-lg max-w-[58ch] text-muted-foreground text-pretty">
            <EnglishCopy>{copy.home.journey.lead}</EnglishCopy>
          </p>
        </div>

        {/*
          A numbered editorial rail rather than a card grid: each stage is a row with its numeral, a
          small illustrative crop, and the approved copy. At mobile the thumbnail sits beside the
          numeral so the row stays scannable instead of becoming a stack of large images.
        */}
        <ol className="mt-12 flex flex-col border-t border-border lg:mt-16">
          {STAGES.map((stage, index) => (
            <li
              key={stage.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5 gap-y-4 border-b border-border py-8 sm:gap-x-8 lg:grid-cols-[auto_minmax(0,7rem)_minmax(0,1fr)] lg:items-center lg:py-10"
            >
              {/* Numeral as text — mirrors under RTL, translates under ar. */}
              <span
                aria-hidden="true"
                className="font-heading text-[length:var(--text-h3)] font-semibold leading-none text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)] tabular-nums"
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className="relative hidden aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted lg:block">
                <Image
                  src={stage.thumb}
                  alt=""
                  fill
                  sizes="7rem"
                  className="object-cover object-center"
                />
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="hc-heading-3 font-semibold">
                  <EnglishCopy>{stage.pick.title}</EnglishCopy>
                </h3>
                <p className="hc-body max-w-[62ch] text-muted-foreground text-pretty">
                  <EnglishCopy>{stage.pick.body}</EnglishCopy>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
