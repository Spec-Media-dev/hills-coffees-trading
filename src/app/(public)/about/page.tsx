import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { TraceabilityBand } from "@/components/public/traceability-band";
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
 * Pre-Stripe hardening run redesign: a dark photographic opener (`data-page-opener="dark"`) with the
 * commercial actions and an "at a glance" panel of already-approved facts (Dubai brand origin, Egypt
 * operational office, who Hills supplies, how trade happens); the four commitments as a 2×2 of cards
 * beside arch-cropped editorial photography (no dead column); the homepage's `TraceabilityBand`, so
 * the chain-of-responsibility story is told once and consistently; and a photographic closing band
 * with the RFQ and Trading Portal actions. Photographs are root-library editorial assets; none is a
 * record's media (MEDIA-01). Server Component; the only client code is the `Reveal` wrapper and the
 * band's scroll reveal.
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

type Pillar = { key: "identity" | "model" | "custody" | "evidence"; icon: "map-pin" | "key-round" | "shield" | "badge-check"; pick: (c: PublicCopy) => { title: string; body: string } };

const PILLARS: readonly Pillar[] = [
  { key: "identity", icon: "map-pin", pick: (c) => c.about.identity },
  { key: "model", icon: "key-round", pick: (c) => c.about.model },
  { key: "custody", icon: "shield", pick: (c) => c.about.custody },
  { key: "evidence", icon: "badge-check", pick: (c) => c.about.evidence },
] as const;

type Glance = { key: string; label: (c: PublicCopy) => string; value: (c: PublicCopy) => string };

const GLANCE: readonly Glance[] = [
  { key: "origin", label: (c) => c.about.glance.originLabel, value: (c) => c.about.glance.originValue },
  { key: "office", label: (c) => c.about.glance.officeLabel, value: (c) => c.about.glance.officeValue },
  { key: "buyers", label: (c) => c.about.glance.buyersLabel, value: (c) => c.about.glance.buyersValue },
  { key: "trade", label: (c) => c.about.glance.tradeLabel, value: (c) => c.about.glance.tradeValue },
];

export default function AboutPage() {
  return (
    <article data-about-page>
      {/* ── OPENER ── the business in one sentence, with the facts a B2B buyer checks first. */}
      <section
        data-page-opener="dark"
        className="relative isolate -mt-[var(--header-h)] overflow-hidden bg-[var(--forest-900)] pt-[var(--header-h)] text-[var(--brand-cream)]"
      >
        <div className="absolute inset-0 -z-10">
          <Image src="/images/coffee-lot-4.jpg" alt={copy.about.imageAlt} fill priority sizes="100vw" className="object-cover object-[64%_40%]" />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--forest-900)_95%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_82%,transparent)_50%,color-mix(in_srgb,var(--forest-900)_45%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,color-mix(in_srgb,var(--forest-900)_95%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_82%,transparent)_50%,color-mix(in_srgb,var(--forest-900)_45%,transparent)_100%)]"
          />
        </div>

        <div className="hc-container grid min-h-[min(78svh,44rem)] items-end gap-10 pb-[clamp(3rem,7vw,6rem)] pt-[clamp(3rem,8vw,6rem)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
          <div className="flex flex-col gap-6">
            <span className="hc-eyebrow font-semibold tracking-wider text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.about.eyebrow} />
            </span>
            <h1 className="max-w-[16ch] font-heading text-[clamp(2.6rem,1.8rem+3.8vw,5.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance rtl:leading-[1.18] rtl:tracking-normal">
              <Bilingual pick={(c) => c.about.title} />
            </h1>
            <span aria-hidden="true" className="h-0.5 w-16 bg-[var(--hc-accent)]" />
            <p className="hc-body-lg max-w-[56ch] text-[color-mix(in_srgb,var(--brand-cream)_84%,transparent)] text-pretty">
              <Bilingual pick={(c) => c.about.lead} />
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent justify-center">
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href={PUBLIC_ROUTES.sourcing}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[rgba(242,245,235,0.3)] px-6 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]"
              >
                <Bilingual pick={(c) => c.megaMenu.sourcing.primary} />
              </Link>
            </div>
          </div>

          <Reveal className="rounded-[var(--radius-xl)] border border-[rgba(242,245,235,0.16)] bg-[rgba(8,24,18,0.62)] p-6 backdrop-blur-md sm:p-7" distance={20} data-about-glance>
            <h2 className="hc-eyebrow text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.about.glance.heading} />
            </h2>
            <dl className="mt-4 flex flex-col divide-y divide-[rgba(242,245,235,0.12)]">
              {GLANCE.map((item) => (
                <div key={item.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <dt className="text-[length:var(--text-meta)] text-[rgba(242,245,235,0.68)]">
                    <Bilingual pick={item.label} />
                  </dt>
                  <dd className="text-[length:var(--text-body)] font-semibold leading-snug">
                    <Bilingual pick={item.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ── THE FOUR COMMITMENTS ── photography + a 2×2 of cards (no dead column). */}
      <section className="bg-secondary py-[clamp(4rem,8vw,7.5rem)] text-foreground" aria-labelledby="about-principles-heading">
        <div className="hc-container flex flex-col gap-10">
          <div className="flex max-w-[52rem] flex-col gap-4">
            <span className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.about.principlesEyebrow} />
            </span>
            <h2 id="about-principles-heading" className="font-heading text-[clamp(2rem,1.55rem+2vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance rtl:leading-[1.2] rtl:tracking-normal">
              <Bilingual pick={(c) => c.about.principlesTitle} />
            </h2>
            <p className="max-w-[56ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.footer.brandStatement} />
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-stretch">
            <Reveal className="relative hidden min-h-[26rem] overflow-hidden rounded-t-[min(12rem,40%)] rounded-b-[var(--radius-xl)] border border-border lg:block" distance={20}>
              <Image src="/images/farmer-partnership.jpg" alt="" fill sizes="36vw" className="object-cover" />
              <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,transparent_60%,rgba(8,24,18,0.45))]" />
            </Reveal>

            <ol className="grid gap-4 sm:grid-cols-2">
              {PILLARS.map((pillar, index) => (
                <li key={pillar.key}>
                  <Reveal
                    className="flex h-full flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] motion-reduce:transition-none"
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.06 }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-full bg-secondary text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                        <Icon name={pillar.icon} className="size-5" aria-hidden="true" />
                      </span>
                      <span dir="ltr" aria-hidden="true" className="font-mono text-[length:var(--text-micro)] font-semibold tabular-nums text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                      <Bilingual pick={(c) => pillar.pick(c).title} />
                    </h3>
                    <p className="text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
                      <Bilingual pick={(c) => pillar.pick(c).body} />
                    </p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── THE CHAIN OF RESPONSIBILITY ── the same band the homepage uses, so the story is told once. */}
      <TraceabilityBand />

      {/* ── CLOSING ── photograph and the commercial next step. */}
      <section className="relative isolate overflow-hidden bg-[var(--forest-800)] text-[var(--brand-cream)]">
        <div className="absolute inset-0 -z-10">
          <Image src="/images/warehouse-bags.jpg" alt="" fill sizes="100vw" className="object-cover object-[50%_55%]" />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,var(--forest-800)_0%,color-mix(in_srgb,var(--forest-800)_88%,transparent)_45%,color-mix(in_srgb,var(--forest-800)_40%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,var(--forest-800)_0%,color-mix(in_srgb,var(--forest-800)_88%,transparent)_45%,color-mix(in_srgb,var(--forest-800)_40%,transparent)_100%)]"
          />
        </div>
        <div className="hc-container flex flex-col gap-6 py-[clamp(4rem,9vw,7.5rem)]">
          <h2 className="max-w-[20ch] font-heading text-[clamp(2rem,1.55rem+2vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance rtl:leading-[1.2] rtl:tracking-normal">
            <Bilingual pick={(c) => c.about.ctaTitle} />
          </h2>
          <p className="hc-body-lg max-w-[48ch] text-[color-mix(in_srgb,var(--brand-cream)_80%,transparent)]">
            <Bilingual pick={(c) => c.about.ctaLead} />
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent justify-center">
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
            <Link
              href={PUBLIC_ROUTES.portalEntry}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[rgba(242,245,235,0.35)] px-6 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]"
            >
              <Bilingual pick={(c) => c.about.portalAction} />
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
