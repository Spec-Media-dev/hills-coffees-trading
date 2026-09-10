import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Final commercial CTA — the closing moment (public design convergence pass; board 3 concept 6 and
 * board 2's closing panel for the *shape*).
 *
 * ── A BRANDED MOMENT, NOT A LINE AND A BUTTON ────────────────────────────────────────────────────
 *
 * Deep-forest ground; a large photograph of ripe cherries beside green coffee on jute
 * (`origin-yemen.jpg`) filling the inline-end under a forest wash; the display headline and the
 * approved lead on the inline-start; a two-button hierarchy (cream primary, outlined secondary);
 * and the closing brand line held under a gold hairline. The section enters with one quiet
 * `Reveal` — the page's last motion, kept deliberately still after everything before it.
 *
 * The message is the approved `home.rfq` copy. No contact detail, quote, statistic or partner row
 * from the boards is reproduced (contract §14.1). The photograph is editorial, never record media.
 */
export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--forest-800)] text-[var(--brand-cream)]">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/origin-yemen.jpg"
          alt={copy.home.rfq.imageAlt}
          fill
          sizes="100vw"
          className="object-cover object-[70%_50%]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,var(--forest-800)_0%,color-mix(in_srgb,var(--forest-800)_92%,transparent)_38%,color-mix(in_srgb,var(--forest-800)_44%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,var(--forest-800)_0%,color-mix(in_srgb,var(--forest-800)_92%,transparent)_38%,color-mix(in_srgb,var(--forest-800)_44%,transparent)_100%)]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[var(--forest-800)] to-transparent"
        />
      </div>

      <div className="hc-container py-[clamp(5rem,11vw,11rem)]">
        <Reveal className="flex max-w-[40rem] flex-col gap-7" distance={20}>
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.nav.contact} />
          </span>
          <h2 className="hc-display font-semibold text-balance [font-size:clamp(2.5rem,1.4rem+4.2vw,5.5rem)]">
            <Bilingual pick={(c) => c.home.rfq.title} />
          </h2>
          <p className="hc-body-lg max-w-[52ch] text-[color-mix(in_srgb,var(--brand-cream)_78%,transparent)] text-pretty">
            <Bilingual pick={(c) => c.home.rfq.lead} />
          </p>

          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={PUBLIC_ROUTES.contact}
              className="inline-flex h-[var(--control-h-lg)] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--sand-100)] bg-[var(--sand-100)] px-7 text-sm font-semibold tracking-[0.005em] text-[var(--forest-800)] transition-[background-color,border-color,transform] duration-[var(--dur-fast)] hover:border-[var(--sand-200)] hover:bg-[var(--sand-200)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] motion-reduce:transform-none"
            >
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
            <Link
              href={PUBLIC_ROUTES.coffee}
              className="inline-flex h-[var(--control-h-lg)] items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--brand-cream)_45%,transparent)] px-7 text-sm font-semibold tracking-[0.005em] text-[var(--brand-cream)] transition-[background-color,transform] duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,var(--brand-cream)_12%,transparent)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] motion-reduce:transform-none"
            >
              <Bilingual pick={(c) => c.home.hero.exploreAction} />
            </Link>
          </div>

          <p className="mt-6 max-w-[34rem] border-t border-[color-mix(in_srgb,var(--gold-on-dark)_45%,transparent)] pt-5 font-heading text-[length:var(--text-body-lg)] leading-[1.5] text-[color-mix(in_srgb,var(--brand-cream)_70%,transparent)]">
            <Bilingual pick={(c) => c.footer.brandStatement} />
          </p>
        </Reveal>
      </div>
    </section>
  );
}
