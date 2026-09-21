import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { AnimatedHero } from "@/components/public/animated-hero";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Homepage Hero — Tomorro-Level Editorial Stature & Truthful Hills Coffee Content.
 *
 * ── ARCHITECTURAL COMPOSITION ────────────────────────────────────────────────────────────────────
 *
 * 1. Deep photographic forest environment (`coffee-lot-5.jpg` desktop, `hero-banner.jpg` mobile).
 * 2. Header relationship: seamlessly integrated dark glass header over the opener.
 * 3. Elevated, sculptural editorial headline with tight leading and balanced line wrapping.
 * 4. Distinct floating pill tag with pulsing Burnt Orange (#a44819) live accent dot.
 * 5. High-contrast CTA cluster: Hills Burnt Orange primary pill button with warm shadow glow,
 *    paired with an elegant secondary pill action.
 * 6. Floating Evidence Stage: A framed, translucent overview of Hills Coffee's three core
 *    sourcing pillars (Origin, Quality, Custody), 100% backed by approved copy dictionary.
 *
 * ── MOTION & CLIENT INTEGRITY ────────────────────────────────────────────────────────────────────
 *
 * Server Component. GSAP entrance owned by `AnimatedHero` via `data-hero-step` attributes.
 * Parallax drift owned by CSS scroll-timeline on `[data-hero-parallax]`.
 */

export function Hero() {
  return (
    <AnimatedHero>
      <section
        data-page-opener="dark"
        className="relative isolate -mt-[var(--header-h)] flex min-h-[min(100svh,68rem)] flex-col overflow-hidden bg-[var(--hc-forest)] pt-[var(--header-h)] text-[#f2f5eb]"
      >
        {/* ── MEDIA STAGE ── Wrapper owns CSS scroll drift; images own GSAP settle. */}
        <div data-hero-parallax className="hc-hero-parallax absolute inset-0">
          <Image
            src="/images/coffee-lot-5.jpg"
            alt={copy.home.hero.landscapeAlt}
            fill
            priority
            sizes="100vw"
            data-hero-media
            className="hidden object-cover object-[50%_30%] md:block"
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

        {/* ── SCRIMS ── Multilayer cinematic gradients ensuring contrast and atmospheric depth. */}
        <span
          data-hero-scrim
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-[linear-gradient(180deg,rgba(18,35,20,0.88)_0%,rgba(18,35,20,0.48)_50%,transparent_100%)]"
        />
        <span
          data-hero-scrim
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[85%] bg-[linear-gradient(0deg,rgba(18,35,20,0.98)_0%,rgba(18,35,20,0.72)_48%,transparent_100%)]"
        />
        <span
          data-hero-scrim
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 hidden w-[65%] bg-[linear-gradient(90deg,rgba(18,35,20,0.75)_0%,transparent_100%)] md:block rtl:bg-[linear-gradient(270deg,rgba(18,35,20,0.75)_0%,transparent_100%)]"
        />

        {/* ── AMBIENT RADIAL SPOTLIGHT ── Subtle warm burnt-ember glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_45%,rgba(164,72,25,0.12),transparent_70%)]"
        />

        {/* ── CONTENT CONTAINER ── Paced editorial hierarchy with generous breathing room. */}
        <div className="hc-public-container relative flex flex-1 flex-col justify-between pb-[clamp(3rem,6vw,5.5rem)] pt-[calc(var(--header-h)+2.5rem)]">
          <div className="flex max-w-[56rem] flex-col items-start gap-5 sm:gap-6">
            {/* Frosted floating pill badge */}
            <div
              data-hero-step
              className="inline-flex items-center gap-2.5 rounded-full border border-[rgba(242,245,235,0.2)] bg-[rgba(18,35,20,0.7)] px-4 py-1.5 shadow-sm backdrop-blur-md"
            >
              <span className="size-2 rounded-full bg-[var(--hc-accent)] animate-pulse" />
              <span className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-[#f2f5eb]">
                <Bilingual pick={(c) => c.home.hero.eyebrow} />
              </span>
            </div>

            {/* Main sculptural display headline */}
            <h1
              data-hero-step
              className="font-heading text-[clamp(2.125rem,1.5rem+3.4vw,5.75rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-[#f2f5eb] text-balance [text-shadow:0_2px_32px_rgba(0,0,0,0.45)]"
            >
              <Bilingual pick={(c) => c.home.hero.headline} />
            </h1>

            {/* Burnt Orange editorial rule */}
            <span
              data-hero-step
              aria-hidden="true"
              className="h-0.5 w-16 bg-[var(--hc-accent)] opacity-90"
            />

            {/* Clear, spacious lead text */}
            <p
              data-hero-step
              className="max-w-[44rem] text-[clamp(1.0625rem,1rem+0.25vw,1.25rem)] leading-[1.7] text-[rgba(242,245,235,0.88)] text-pretty"
            >
              <Bilingual pick={(c) => c.home.hero.lead} />
            </p>

            {/* High-contrast action cluster */}
            <div data-hero-step className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 sm:gap-4 w-full sm:w-auto">
              <Link
                href={PUBLIC_ROUTES.contact}
                className="hc-btn-accent h-12 px-7 text-sm font-semibold tracking-[0.01em] shadow-[0_4px_22px_rgba(164,72,25,0.4)] w-full sm:w-auto justify-center"
              >
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href={PUBLIC_ROUTES.coffee}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[rgba(242,245,235,0.3)] bg-[rgba(18,35,20,0.5)] px-6 text-sm font-semibold text-[#f2f5eb] transition-all hover:border-[rgba(242,245,235,0.55)] hover:bg-[rgba(242,245,235,0.12)] backdrop-blur-sm w-full sm:w-auto"
              >
                <Bilingual pick={(c) => c.home.hero.exploreAction} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4 opacity-70" />
              </Link>
            </div>
          </div>

          {/* ── FRAMED EVIDENCE STAGE (Tomorro Floating Window) ── 100% Truthful Approved Content */}
          <div
            data-hero-step
            className="mt-8 sm:mt-12 w-full max-w-[68rem] rounded-[var(--radius-xl)] sm:rounded-[var(--radius-2xl)] border border-[rgba(242,245,235,0.18)] bg-[rgba(18,35,20,0.85)] p-5 sm:p-8 shadow-[0_32px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          >
            {/* Stage header bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(242,245,235,0.12)] pb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[rgba(242,245,235,0.7)]">
              <span className="flex items-center gap-2 text-[#f2f5eb]">
                <span className="size-2 rounded-full bg-[var(--hc-accent)]" />
                <Bilingual pick={(c) => c.site.name} /> — <Bilingual pick={(c) => c.site.tagline} />
              </span>
              <span className="text-[var(--gold-on-dark)] font-medium">
                <Bilingual pick={(c) => c.footer.locationLine} />
              </span>
            </div>

            {/* 3 Core Truthful Sourcing Pillars */}
            <div className="grid gap-3 pt-5 sm:grid-cols-3 sm:gap-6">
              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[rgba(242,245,235,0.08)] bg-[rgba(242,245,235,0.04)] p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-on-dark)]">
                  <Bilingual pick={(c) => c.nav.origins} />
                </span>
                <span className="font-heading text-base font-semibold text-[#f2f5eb]">
                  <Bilingual pick={(c) => c.home.credibility.origin.title} />
                </span>
                <span className="text-xs leading-relaxed text-[rgba(242,245,235,0.75)] text-pretty">
                  <Bilingual pick={(c) => c.home.credibility.origin.body} />
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[rgba(242,245,235,0.08)] bg-[rgba(242,245,235,0.04)] p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-on-dark)]">
                  <Bilingual pick={(c) => c.nav.sourcing} />
                </span>
                <span className="font-heading text-base font-semibold text-[#f2f5eb]">
                  <Bilingual pick={(c) => c.home.credibility.quality.title} />
                </span>
                <span className="text-xs leading-relaxed text-[rgba(242,245,235,0.75)] text-pretty">
                  <Bilingual pick={(c) => c.home.credibility.quality.body} />
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[rgba(242,245,235,0.08)] bg-[rgba(242,245,235,0.04)] p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-on-dark)]">
                  <Bilingual pick={(c) => c.home.traceability.eyebrow} />
                </span>
                <span className="font-heading text-base font-semibold text-[#f2f5eb]">
                  <Bilingual pick={(c) => c.home.credibility.custody.title} />
                </span>
                <span className="text-xs leading-relaxed text-[rgba(242,245,235,0.75)] text-pretty">
                  <Bilingual pick={(c) => c.home.credibility.custody.body} />
                </span>
              </div>
            </div>

            {/* Reassurance footer */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[rgba(242,245,235,0.1)] pt-4 text-xs text-[rgba(242,245,235,0.7)]">
              <span className="flex items-center gap-1.5">
                <Icon name="check" className="size-3.5 text-[var(--hc-accent)]" />
                <Bilingual pick={(c) => c.footer.brandStatement} />
              </span>
            </div>
          </div>

          {/* Scroll cue */}
          <div
            data-hero-step
            aria-hidden="true"
            className="relative hidden items-center gap-3 pt-6 text-[length:var(--text-micro)] font-semibold uppercase tracking-[var(--tracking-label)] text-[rgba(242,245,235,0.6)] lg:flex"
          >
            <Icon name="arrow-down" className="size-3.5 text-[var(--hc-accent)]" />
            <Bilingual pick={(c) => c.home.hero.scrollCue} />
          </div>
        </div>
      </section>
    </AnimatedHero>
  );
}
