import Image from "next/image";

import { Bilingual } from "@/components/locale/bilingual";
import { GsapScrollReveal } from "@/components/motion/gsap-scroll-reveal";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Traceability — the chain of responsibility (Phase 5.5, UIF-025 / UIF-026; rebuilt as a grid by
 * the public design convergence pass).
 *
 * ── FROM A CAPTIONED PHOTOGRAPH TO A STRUCTURE ───────────────────────────────────────────────────
 *
 * The previous band was a full-width photograph with a paragraph on it. It now keeps the
 * photographic atmosphere — `origin-kenya.jpg`, drying beds at golden hour, filling the inline-end —
 * and builds a 2 × 2 grid of glass panels into it on the inline-start: the four links in the chain a
 * lot passes through, from the region it grew in to the member who may trade it. The links ARE a
 * sequence, so they are numbered, and a gold connector is drawn across them as the section enters.
 *
 * ── CONTENT IS THE APPROVED PILLARS ──────────────────────────────────────────────────────────────
 *
 * The four bodies are the reviewed `home.credibility.*` texts, verbatim. They used to be the story
 * section's items, where they did not match their photographs; here they are the subject. Only the
 * short link titles are new, and they name a stage rather than make a claim.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────────────────────────
 *
 * `GsapScrollReveal` (the scoped GSAP helper, contract §16 island 5) draws the connector and
 * staggers the four panels as one sequence. No Motion wrapper is used inside it (§13.2a). The
 * photograph itself does not move. Under reduced motion everything renders complete at once.
 *
 * ── TEXT OVER IMAGERY IS ALWAYS PROTECTED ────────────────────────────────────────────────────────
 *
 * A directional forest wash deepens toward the inline-start where the grid sits, and each panel
 * carries its own tinted, blurred surface, so cream text never meets the photograph directly.
 */

type ChainLink = {
  key: "origin" | "quality" | "custody" | "membership";
  pick: (c: PublicCopy) => { title: string; body: string };
};

const CHAIN: readonly ChainLink[] = [
  { key: "origin", pick: (c) => c.home.credibility.origin },
  { key: "quality", pick: (c) => c.home.credibility.quality },
  { key: "custody", pick: (c) => c.home.credibility.custody },
  { key: "membership", pick: (c) => c.home.credibility.membership },
] as const;

const GLASS =
  "rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--brand-cream)_16%,transparent)] bg-[color-mix(in_srgb,var(--forest-900)_46%,transparent)] supports-[backdrop-filter]:[backdrop-filter:saturate(130%)_blur(16px)]";

export function TraceabilityBand() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--forest-900)] text-[var(--brand-cream)]">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/origin-kenya.jpg"
          alt={copy.home.traceability.imageAlt}
          fill
          sizes="100vw"
          className="object-cover object-[62%_50%]"
        />
        {/* Directional wash: deepest under the grid on the inline-start, open at the inline-end. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--forest-900)_96%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_84%,transparent)_46%,color-mix(in_srgb,var(--forest-900)_40%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,color-mix(in_srgb,var(--forest-900)_96%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_84%,transparent)_46%,color-mix(in_srgb,var(--forest-900)_40%,transparent)_100%)]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--forest-900)] to-transparent"
        />
      </div>

      <GsapScrollReveal className="hc-container py-[clamp(4rem,9vw,9rem)]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
          <div className="flex flex-col gap-10">
            <div className="flex max-w-[40rem] flex-col gap-3">
              <span className="hc-eyebrow text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.home.traceability.eyebrow} />
              </span>
              <h2 className="hc-heading-2 font-semibold text-balance">
                <Bilingual pick={(c) => c.home.traceability.title} />
              </h2>
              <p className="hc-body-lg max-w-[56ch] text-[color-mix(in_srgb,var(--brand-cream)_76%,transparent)] text-pretty">
                <Bilingual pick={(c) => c.home.traceability.lead} />
              </p>
            </div>

            {/* The chain: a drawn connector across the top, then the 2 × 2 grid of links. */}
            <div className="relative">
              <span
                aria-hidden="true"
                data-draw="x"
                className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,var(--gold-on-dark)_0%,color-mix(in_srgb,var(--gold-on-dark)_25%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,var(--gold-on-dark)_0%,color-mix(in_srgb,var(--gold-on-dark)_25%,transparent)_100%)]"
              />
              <ol
                aria-label={copy.home.traceability.chainLabel}
                className="grid gap-4 pt-8 sm:grid-cols-2 sm:gap-5"
              >
                {CHAIN.map((link, index) => (
                  <li key={link.key} data-step className={`${GLASS} flex flex-col gap-4 p-6 sm:p-7`}>
                    <span className="flex items-center gap-4">
                      <span
                        dir="ltr"
                        aria-hidden="true"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--gold-on-dark)] font-heading text-[length:var(--text-meta)] font-semibold tabular-nums text-[var(--gold-on-dark)]"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="hc-eyebrow text-[color-mix(in_srgb,var(--brand-cream)_62%,transparent)]">
                        <Bilingual pick={(c) => c.home.traceability.links[link.key]} />
                      </span>
                    </span>
                    <span className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                      <Bilingual pick={(c) => link.pick(c).title} />
                    </span>
                    <span className="max-w-[40ch] text-[length:var(--text-small)] leading-[1.7] text-[color-mix(in_srgb,var(--brand-cream)_74%,transparent)] text-pretty">
                      <Bilingual pick={(c) => link.pick(c).body} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* The inline-end column is the photograph itself: kept open so the environment breathes. */}
          <div aria-hidden="true" className="hidden lg:block" />
        </div>
      </GsapScrollReveal>
    </section>
  );
}
