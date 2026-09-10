import Image from "next/image";

import { EnglishCopy } from "@/components/locale/bilingual";
import { copy } from "@/lib/public/copy";

/**
 * Full-bleed traceability band (Phase 5.5, UIF-025 / UIF-026).
 *
 * ── THE PAGE'S ONE FULL-BLEED PHOTOGRAPHIC MOMENT ────────────────────────────────────────────────
 *
 * Everything else on the homepage keeps its media inside a bordered frame. This band lets the
 * photograph run edge to edge while its *content* stays aligned to the 96rem product grid — the
 * "edge-to-edge media, constrained inner content" pattern the design guidance asks for, used once so
 * it stays an event rather than a habit.
 *
 * It also does structural work: it sits between two grid-shaped sections and breaks them apart, which
 * is what stops the middle of the page reading as three identical card walls.
 *
 * ── THE CLAIM IS THE REVIEWED ONE ────────────────────────────────────────────────────────────────
 *
 * The body is `copy.coffee.detail.traceabilityBody` — the wording already approved for the coffee
 * detail page. It is reused verbatim rather than restated more strongly here, so this band adds
 * emphasis without adding a claim.
 *
 * ── TEXT OVER IMAGERY IS ALWAYS PROTECTED ────────────────────────────────────────────────────────
 *
 * A two-stop forest scrim runs the full height, deepest on the inline-start where the type sits, so
 * cream-on-photograph never happens at any breakpoint. `object-[50%_45%]` keeps the drying beds and
 * the hillside in frame when the band is short on mobile.
 */
export function TraceabilityBand() {
  return (
    <section className="relative isolate overflow-hidden bg-sidebar text-sidebar-foreground">
      <Image
        src="/images/farm-landscape.jpg"
        alt={copy.home.traceability.imageAlt}
        fill
        sizes="100vw"
        className="object-cover object-[50%_45%]"
      />

      {/*
        Scrim: a strong forest wash that eases toward the inline-end, so the photograph stays visible
        on the side without type. Logical direction — it mirrors correctly under RTL.
      */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_srgb,var(--forest-800)_92%,transparent)_0%,color-mix(in_srgb,var(--forest-800)_78%,transparent)_48%,color-mix(in_srgb,var(--forest-800)_46%,transparent)_100%)] rtl:bg-[linear-gradient(to_left,color-mix(in_srgb,var(--forest-800)_92%,transparent)_0%,color-mix(in_srgb,var(--forest-800)_78%,transparent)_48%,color-mix(in_srgb,var(--forest-800)_46%,transparent)_100%)]"
      />

      <div className="hc-container relative py-[clamp(4.5rem,11vw,10rem)]">
        <div className="flex max-w-[38rem] flex-col gap-5">
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <EnglishCopy>{copy.home.traceability.eyebrow}</EnglishCopy>
          </span>
          <h2 className="hc-heading-2 font-semibold text-balance">
            <EnglishCopy>{copy.home.traceability.title}</EnglishCopy>
          </h2>
          <p className="hc-body-lg text-sidebar-foreground/85 text-pretty">
            <EnglishCopy>{copy.coffee.detail.traceabilityBody}</EnglishCopy>
          </p>
        </div>
      </div>
    </section>
  );
}
