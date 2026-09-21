import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Final Commercial Closing Stage — Tomorro-Level Visual Redesign & Approved Content.
 *
 * ── MONUMENTAL BRANDED CLOSING STAGE ─────────────────────────────────────────────────────────────
 *
 * 1. Deep Forest backdrop (#122314) that flows seamlessly into the Deep Forest footer.
 * 2. Warm ambient radial ember glow (rgba(164, 72, 25, 0.12)) behind the closing proposition.
 * 3. Documentary origin photography (`origin-yemen.jpg`) filling the background under atmospheric
 *    forest grading.
 * 4. Sculptural headline hierarchy with Burnt Orange (#a44819) badge, hairline rule, and high-impact
 *    action cluster.
 * 5. Integrated commercial dialogue panel strictly using approved bilingual copy from `copy.footer.*`.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────────────────────────
 *
 * Server Component. Entrance animation driven by Motion `Reveal`.
 */

export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--hc-forest)] text-[#f2f5eb]">
      {/* Background photographic atmosphere */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/origin-yemen.jpg"
          alt={copy.home.rfq.imageAlt}
          fill
          sizes="100vw"
          className="object-cover object-[70%_45%] opacity-30"
        />
        {/* Multilayer gradient scrims */}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,35,20,0.85)_0%,rgba(18,35,20,0.95)_60%,var(--hc-forest)_100%)]"
        />
        {/* Warm radial ember spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(164,72,25,0.12),transparent_75%)]"
        />
      </div>

      <div className="hc-public-container py-[clamp(6rem,11vw,11.5rem)]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
          {/* Main proposal column */}
          <Reveal className="flex flex-col items-start gap-6 sm:gap-7" distance={24}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(242,245,235,0.2)] bg-[rgba(18,35,20,0.7)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#f2f5eb] backdrop-blur-md shadow-sm">
              <span className="size-1.5 rounded-full bg-[var(--hc-accent)] animate-pulse" />
              <Bilingual pick={(c) => c.nav.contact} />
            </div>

            <h2 className="font-heading text-[clamp(2.125rem,1.6rem+3.5vw,5.5rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-[#f2f5eb] text-balance [text-shadow:0_2px_32px_rgba(0,0,0,0.45)]">
              <Bilingual pick={(c) => c.home.rfq.title} />
            </h2>

            <span aria-hidden="true" className="h-0.5 w-16 bg-[var(--hc-accent)]" />

            <p className="max-w-[46ch] text-[clamp(1.0625rem,1rem+0.25vw,1.25rem)] leading-[1.7] text-[rgba(242,245,235,0.86)] text-pretty">
              <Bilingual pick={(c) => c.home.rfq.lead} />
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2 w-full sm:w-auto">
              <Link
                href={PUBLIC_ROUTES.contact}
                className="hc-btn-accent h-12 px-8 text-sm font-semibold tracking-[0.01em] shadow-[0_4px_22px_rgba(164,72,25,0.4)] w-full sm:w-auto justify-center"
              >
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href={PUBLIC_ROUTES.coffee}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[rgba(242,245,235,0.3)] bg-[rgba(18,35,20,0.5)] px-6 text-sm font-semibold text-[#f2f5eb] transition-all hover:border-[rgba(242,245,235,0.55)] hover:bg-[rgba(242,245,235,0.12)] backdrop-blur-sm w-full sm:w-auto"
              >
                <Bilingual pick={(c) => c.cta.exploreAllCoffee} />
              </Link>
            </div>
          </Reveal>

          {/* Floating Commercial Trust Panel — 100% Approved Content */}
          <Reveal
            className="flex flex-col rounded-[var(--radius-2xl)] border border-[rgba(242,245,235,0.16)] bg-[rgba(18,35,20,0.82)] p-6 sm:p-9 shadow-[0_24px_64px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            distance={24}
            transition={{ delay: 0.15 }}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-[rgba(242,245,235,0.12)] pb-4">
                <span className="font-heading text-lg font-semibold text-[#f2f5eb]">
                  <Bilingual pick={(c) => c.footer.commercialHeading} />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-on-dark)]">
                  <Bilingual pick={(c) => c.footer.locationLine} />
                </span>
              </div>

              <p className="text-sm leading-[1.75] text-[rgba(242,245,235,0.88)] text-pretty">
                <Bilingual pick={(c) => c.footer.commercialBody} />
              </p>

              <div className="border-t border-[rgba(242,245,235,0.1)] pt-5">
                <p className="font-heading text-sm leading-relaxed text-[rgba(242,245,235,0.78)] text-pretty">
                  <Bilingual pick={(c) => c.footer.brandStatement} />
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
