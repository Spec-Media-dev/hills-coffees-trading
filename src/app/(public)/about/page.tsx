import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public About page (public design convergence pass — authorised public amendment).
 *
 * ── WHY THIS PAGE EXISTS NOW ─────────────────────────────────────────────────────────────────────
 *
 * Feature 002's route contract had no About surface. The product owner directed that the public
 * navigation carry a real About Us, so this page is added as a **static editorial brand page**
 * inside the `(public)` group, at the canonical trailing-slash path, with the same metadata pattern
 * as every other owned public route (FR-006).
 *
 * ── EVERY SENTENCE IS ALREADY-APPROVED POSITIONING ───────────────────────────────────────────────
 *
 * The copy (`copy.about`) restates only what the SRS and design guidance already establish:
 * Dubai-born, an operational office in Egypt, B2B for the Arab region, origin sourcing,
 * Hills-approved custody, reviewed membership, and "only what we can evidence". No founding date,
 * headcount, volume, client, certification, partner count or origin count is stated — none is
 * evidenced for this surface, and the boards' `EST. 2020`-style details are not reproduced
 * (contract §14.1).
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * A dark photographic opener the header dissolves into (`data-page-opener="dark"`); a cream
 * editorial split — a display statement on the inline-start, four hairline-ruled pillars on the
 * inline-end; and a photographic closing band with the commercial CTA. Photographs are root-library
 * editorial assets; none is a record's media (MEDIA-01). Server Component; the only client code is
 * the `Reveal` motion wrapper.
 */

const PATH = "/about/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);
  return {
    title: copy.about.metaTitle,
    description: copy.about.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.about.metaTitle,
      description: copy.about.metaDescription,
    },
  };
}

type Pillar = { key: "identity" | "model" | "custody" | "evidence"; pick: (c: PublicCopy) => { title: string; body: string } };

const PILLARS: readonly Pillar[] = [
  { key: "identity", pick: (c) => c.about.identity },
  { key: "model", pick: (c) => c.about.model },
  { key: "custody", pick: (c) => c.about.custody },
  { key: "evidence", pick: (c) => c.about.evidence },
] as const;

export default function AboutPage() {
  return (
    <article>
      {/* ── OPENER ── */}
      <section
        data-page-opener="dark"
        className="relative isolate -mt-[var(--header-h)] overflow-hidden bg-[var(--forest-900)] pt-[var(--header-h)] text-[var(--brand-cream)]"
      >
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/coffee-lot-4.jpg"
            alt={copy.about.imageAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[64%_40%]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--forest-900)_94%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_78%,transparent)_48%,color-mix(in_srgb,var(--forest-900)_30%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,color-mix(in_srgb,var(--forest-900)_94%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_78%,transparent)_48%,color-mix(in_srgb,var(--forest-900)_30%,transparent)_100%)]"
          />
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[color-mix(in_srgb,var(--forest-900)_70%,transparent)] to-transparent" />
        </div>

        <div className="hc-container flex min-h-[min(72svh,40rem)] flex-col justify-end gap-6 pb-[clamp(3rem,7vw,6rem)] pt-[clamp(4rem,10vw,7rem)]">
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.about.eyebrow} />
          </span>
          <h1 className="hc-display max-w-[16ch] font-semibold text-balance">
            <Bilingual pick={(c) => c.about.title} />
          </h1>
          <p className="hc-body-lg max-w-[58ch] text-[color-mix(in_srgb,var(--brand-cream)_80%,transparent)] text-pretty">
            <Bilingual pick={(c) => c.about.lead} />
          </p>
        </div>
      </section>

      {/* ── THE FOUR PILLARS ── an editorial split on cream. */}
      <section className="bg-secondary py-[clamp(4rem,8vw,8.5rem)] text-foreground">
        <div className="hc-container grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
            <span aria-hidden="true" className="h-px w-16 bg-[var(--gold-on-light)] dark:bg-[var(--gold-on-dark)]" />
            <p className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-balance">
              <Bilingual pick={(c) => c.site.tagline} />
            </p>
            <p className="max-w-[44ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.footer.brandStatement} />
            </p>
          </div>

          <ol className="flex flex-col">
            {PILLARS.map((pillar, index) => (
              <li key={pillar.key} className="border-t border-border last:border-b">
                <Reveal
                  className="grid gap-4 py-8 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-8 lg:py-10"
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.06 }}
                >
                  <span
                    dir="ltr"
                    aria-hidden="true"
                    className="font-heading text-[length:var(--text-meta)] font-semibold tabular-nums text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-3">
                    <h2 className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                      <Bilingual pick={(c) => pillar.pick(c).title} />
                    </h2>
                    <p className="max-w-[56ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
                      <Bilingual pick={(c) => pillar.pick(c).body} />
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CLOSING ── photograph and the commercial next step. */}
      <section className="relative isolate overflow-hidden bg-[var(--forest-800)] text-[var(--brand-cream)]">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/warehouse-bags.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-[50%_55%]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,var(--forest-800)_0%,color-mix(in_srgb,var(--forest-800)_88%,transparent)_45%,color-mix(in_srgb,var(--forest-800)_40%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,var(--forest-800)_0%,color-mix(in_srgb,var(--forest-800)_88%,transparent)_45%,color-mix(in_srgb,var(--forest-800)_40%,transparent)_100%)]"
          />
        </div>
        <div className="hc-container flex flex-col gap-6 py-[clamp(4rem,9vw,8rem)]">
          <h2 className="hc-heading-2 max-w-[20ch] font-semibold text-balance">
            <Bilingual pick={(c) => c.about.ctaTitle} />
          </h2>
          <p className="hc-body-lg max-w-[48ch] text-[color-mix(in_srgb,var(--brand-cream)_78%,transparent)]">
            <Bilingual pick={(c) => c.about.ctaLead} />
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={PUBLIC_ROUTES.contact}
              className="inline-flex h-[var(--control-h-lg)] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--sand-100)] bg-[var(--sand-100)] px-7 text-sm font-semibold text-[var(--forest-800)] transition-[background-color,border-color,transform] duration-[var(--dur-fast)] hover:border-[var(--sand-200)] hover:bg-[var(--sand-200)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] motion-reduce:transform-none"
            >
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
            <Link
              href={PUBLIC_ROUTES.sourcing}
              className="inline-flex h-[var(--control-h-lg)] items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--brand-cream)_45%,transparent)] px-7 text-sm font-semibold text-[var(--brand-cream)] transition-[background-color,transform] duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,var(--brand-cream)_12%,transparent)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] motion-reduce:transform-none"
            >
              <Bilingual pick={(c) => c.megaMenu.sourcing.primary} />
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
