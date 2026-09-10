import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { AnimatedHero } from "@/components/public/animated-hero";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Homepage hero (Phase 5.5, UIF-024; re-art-directed by the public design convergence pass —
 * contract §4, §13, §14; design guidance hero row; reference `08_hero_mountain_origin` for the
 * header-and-hero *relationship* only).
 *
 * ── THE PHOTOGRAPH IS THE SECTION ────────────────────────────────────────────────────────────────
 *
 * The earlier split (type on the inline-start, an arched photograph on the inline-end) read as a
 * template. Now the photograph fills the whole first viewport and the header sits inside it: the
 * section pulls itself up under the sticky bar by one header height, and the bar's dark-glass state
 * (`globals.css`, `--hdr-p`) is triggered by the `data-page-opener="dark"` attribute here. The
 * editorial content is placed deliberately on top — a display headline low on the inline-start, and
 * a glass panel carrying the lead and the CTA pair at the inline-end — so the first screen is an
 * environment with a message in it, not a text column beside a picture.
 *
 * ── ASSETS ───────────────────────────────────────────────────────────────────────────────────────
 *
 * Desktop: `coffee-lot-5.jpg` (1600×893) — a grower picking cherries on a hillside above a mountain
 * valley, cloud over the ridge. It is the root-library landscape UIF-024 names as a hero alternate,
 * and it gives the bar a dark, low-detail sky to sit on. Mobile: `hero-banner.jpg` (1288×1600
 * portrait, drying beds at low sun) — a portrait frame holds a phone screen far better than a
 * landscape crop, and it is the asset the UIF-052 map classes `homepage-hero`. The restricted
 * `08_hero_mountain_origin` crop is **not** rendered; it informed the composition only (ASSET-REF-01).
 * No `features/` crop appears here.
 *
 * ── TEXT IS NEVER ON UNPROTECTED IMAGERY ─────────────────────────────────────────────────────────
 *
 * Three scrims: a top band for the header, a bottom band for the headline, and an inline-start wash
 * so the display type sits on deep forest rather than on foliage. The lead and CTAs sit on the glass
 * panel — blurred, tinted, hairlined — which is what keeps small text legible at every crop.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────────────────────────
 *
 * `AnimatedHero` (contract §16 island 7) owns the entrance and is GSAP end to end: media settle →
 * scrims → eyebrow → headline → rule → panel. The *scroll response* is a separate, purely decorative
 * CSS scroll-driven drift on the media **wrapper** (`data-hero-parallax`), never on the node GSAP
 * animates, so no property has two owners (contract §13.2b). Both collapse under reduced motion.
 * Nothing is hidden by default: with JavaScript disabled the hero renders complete.
 *
 * No fabricated statistic row appears (UIF-024 MUST NOT); the board's `12+ Origins` /
 * `200+ Global Partners` / `100% Traceable` figures are not Hills-evidenced and are excluded.
 */

const GLASS_PANEL =
  "rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--brand-cream)_22%,transparent)] bg-[color-mix(in_srgb,var(--forest-900)_38%,transparent)] shadow-[0_24px_64px_rgba(0,0,0,0.28)] supports-[backdrop-filter]:[backdrop-filter:saturate(140%)_blur(18px)]";

const CTA_BASE =
  "inline-flex h-[var(--control-h-lg)] items-center justify-center gap-2 rounded-[var(--radius-md)] border px-7 text-sm font-semibold tracking-[0.005em] transition-[color,background-color,border-color,transform] duration-[var(--dur-fast)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] motion-reduce:transform-none";

export function Hero() {
  return (
    <AnimatedHero>
      <section
        data-page-opener="dark"
        className="relative isolate -mt-[var(--header-h)] flex min-h-[min(100svh,58rem)] flex-col overflow-hidden bg-[var(--forest-900)] pt-[var(--header-h)] text-[var(--brand-cream)]"
      >
        {/* ── MEDIA STAGE ── the wrapper owns the CSS scroll drift; the images own the GSAP settle. */}
        <div data-hero-parallax className="hc-hero-parallax absolute inset-0">
          <Image
            src="/images/coffee-lot-5.jpg"
            alt={copy.home.hero.landscapeAlt}
            fill
            priority
            sizes="100vw"
            data-hero-media
            className="hidden object-cover object-[50%_32%] md:block"
          />
          <Image
            src="/images/hero-banner.jpg"
            alt={copy.home.hero.imageAlt}
            fill
            priority
            sizes="100vw"
            data-hero-media
            className="object-cover object-[50%_40%] md:hidden"
          />
        </div>

        {/* ── SCRIMS ── top for the bar, bottom for the headline, inline-start for the display type. */}
        <span
          data-hero-scrim
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--forest-900)_82%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_40%,transparent)_45%,transparent_100%)] md:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--forest-900)_66%,transparent)_0%,transparent_100%)]"
        />
        <span
          data-hero-scrim
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-[linear-gradient(0deg,color-mix(in_srgb,var(--forest-900)_94%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_58%,transparent)_46%,transparent_100%)]"
        />
        <span
          data-hero-scrim
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 hidden w-[58%] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--forest-900)_60%,transparent)_0%,transparent_100%)] md:block rtl:bg-[linear-gradient(270deg,color-mix(in_srgb,var(--forest-900)_60%,transparent)_0%,transparent_100%)]"
        />

        {/* ── CONTENT ── bottom-anchored, asymmetric: headline inline-start, glass panel inline-end. */}
        <div className="hc-container relative flex flex-1 flex-col justify-end gap-8 pb-[clamp(2.5rem,6vw,5.5rem)] pt-[clamp(6rem,14vw,9rem)] lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="flex max-w-[44rem] flex-col items-start gap-5">
            <span data-hero-step className="hc-eyebrow text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.home.hero.eyebrow} />
            </span>

            <h1
              data-hero-step
              className="hc-display font-semibold text-balance [text-shadow:0_2px_24px_rgba(0,0,0,0.25)]"
            >
              <Bilingual pick={(c) => c.home.hero.headline} />
            </h1>

            {/* The brand's gold hairline, used once on the page. */}
            <span data-hero-step aria-hidden="true" className="h-px w-20 bg-[var(--gold-on-dark)]" />
          </div>

          <div
            data-hero-step
            className={`${GLASS_PANEL} flex w-full max-w-[26rem] shrink-0 flex-col gap-6 p-6 sm:p-7 lg:max-w-[24rem] xl:max-w-[26rem]`}
          >
            <p className="text-[length:var(--text-body)] leading-[1.7] text-[color-mix(in_srgb,var(--brand-cream)_88%,transparent)] text-pretty">
              <Bilingual pick={(c) => c.home.hero.lead} />
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={PUBLIC_ROUTES.coffee}
                className={`${CTA_BASE} border-[var(--sand-100)] bg-[var(--sand-100)] text-[var(--forest-800)] hover:border-[var(--sand-200)] hover:bg-[var(--sand-200)]`}
              >
                <Bilingual pick={(c) => c.home.hero.exploreAction} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href={PUBLIC_ROUTES.contact}
                className={`${CTA_BASE} border-[color-mix(in_srgb,var(--brand-cream)_45%,transparent)] bg-transparent text-[var(--brand-cream)] hover:bg-[color-mix(in_srgb,var(--brand-cream)_12%,transparent)]`}
              >
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll cue — a quiet, non-interactive orientation mark; hidden where the fold is short. */}
        <div
          data-hero-step
          aria-hidden="true"
          className="hc-container relative hidden items-center gap-3 pb-6 text-[length:var(--text-micro)] font-semibold uppercase tracking-[var(--tracking-label)] text-[color-mix(in_srgb,var(--brand-cream)_70%,transparent)] lg:flex"
        >
          <Icon name="arrow-down" className="size-3.5" />
          <Bilingual pick={(c) => c.home.hero.scrollCue} />
        </div>
      </section>
    </AnimatedHero>
  );
}
