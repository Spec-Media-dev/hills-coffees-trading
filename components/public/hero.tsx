import Image from "next/image";
import Link from "next/link";

import { EnglishCopy } from "@/components/locale/bilingual";
import { AnimatedHero } from "@/components/public/animated-hero";
import { EYEBROW } from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/public/copy";

/**
 * Homepage hero (Phase 5.5, UIF-024 — contract §4, §13, §14; design guidance hero row).
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * An asymmetric editorial split on the brand's deep-forest ground: type on the inline-start, a tall
 * portrait photograph on the inline-end, both aligned to the 96rem product frame while the forest
 * ground itself runs full-bleed. The Claude Design public-website kit sets this shape — eyebrow →
 * display headline → rule → lead → primary + secondary CTA against a 4/5 portrait media block — and
 * `hero-banner.jpg` (1288×1600, drying beds at origin) is the one asset the UIF-052 map classes
 * `homepage-hero`. No `features/` crop appears here: none is hero-grade (plan §11.1).
 *
 * The headline is measured, not merely large: `hc-display` at a capped `--container-narrow`-style
 * measure keeps it to three or four lines at every width instead of stretching into a banner.
 *
 * ── MOBILE IS A DIFFERENT COMPOSITION, NOT A NARROWER ONE ────────────────────────────────────────
 *
 * At mobile the split collapses and the photograph moves *behind* the type as a full-bleed backdrop
 * with a stronger scrim, so the first screen is image-led rather than a tall text block above a
 * cropped picture. `object-[50%_38%]` holds the worker and the drying beds in frame at 390px, where a
 * centre crop would cut to empty sky. Two `sizes` branches keep the delivered bytes honest.
 *
 * ── TEXT IS NEVER ON UNPROTECTED IMAGERY ─────────────────────────────────────────────────────────
 *
 * On mobile the type sits over the photograph, so a two-stop forest scrim carries it; on desktop the
 * type sits on the forest ground itself and the scrim only softens the photograph's lower edge into
 * the band. Contrast is therefore forest-on-cream in both cases, never cream-on-photograph.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────────────────────────
 *
 * `AnimatedHero` (contract §16 island 7) owns the entrance and is GSAP end to end. This file stays a
 * **Server Component** — it ships the finished markup, tagged with `data-hero-*` hooks, and the island
 * animates it. Nothing is hidden by default, so under reduced motion (or with JavaScript disabled)
 * the hero simply renders complete.
 *
 * No fabricated statistic row appears here (UIF-024 MUST NOT); the board's `12+ Origins` /
 * `200+ Global Partners` / `100% Traceable` figures are not Hills-evidenced and are excluded.
 */

/**
 * The display face and display metrics, set at the `--text-h1` step (36->72px) rather than
 * `--text-hero` (44->112px).
 *
 * `--text-hero` is the token for a hero whose headline owns the full frame. This hero is a split
 * composition, so at 1440px the hero step renders ~106px inside a ~700px column — five lines, and the
 * CTA pair falls out of the first viewport. The h1 step holds the same editorial weight at three
 * lines and keeps the whole message, including both actions, above the fold.
 */
const HERO_HEADLINE =
  "font-heading text-[length:var(--text-h1)] leading-[var(--lh-display)] tracking-[var(--tracking-display)] font-semibold text-balance";

export function Hero() {
  return (
    <AnimatedHero>
      <section className="relative isolate overflow-hidden bg-sidebar text-sidebar-foreground">
        {/*
          MOBILE BACKDROP — the photograph as the ground itself, below `lg`. `aria-hidden` because the
          desktop media block below carries the single meaningful alt for the same photograph; two
          announcements of one image would be noise.
        */}
        <div aria-hidden="true" className="absolute inset-0 lg:hidden">
          <Image
            src="/images/hero-banner.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            data-hero-media
            className="object-cover object-[50%_38%]"
          />
          <span
            data-hero-scrim
            className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--forest-800)_86%,transparent)_0%,color-mix(in_srgb,var(--forest-800)_72%,transparent)_46%,color-mix(in_srgb,var(--forest-800)_92%,transparent)_100%)]"
          />
        </div>

        <div className="hc-container relative grid gap-12 py-[clamp(3rem,6vw,6rem)] lg:min-h-[40rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)] lg:items-center lg:gap-16">
          <div className="flex max-w-[38rem] flex-col items-start gap-6">
            <span data-hero-step className={`${EYEBROW} text-[var(--gold-on-dark)]`}>
              {copy.home.hero.eyebrow}
            </span>

            <h1 data-hero-step className={HERO_HEADLINE}>
              <EnglishCopy>{copy.home.hero.headline}</EnglishCopy>
            </h1>

            {/* The brand's gold hairline, used once on the page. */}
            <span
              data-hero-step
              aria-hidden="true"
              className="h-px w-16 bg-[var(--gold-on-dark)]"
            />

            <p
              data-hero-step
              className="max-w-[34rem] text-[length:var(--text-body-lg)] leading-[var(--lh-body)] text-sidebar-foreground/85 text-pretty"
            >
              <EnglishCopy>{copy.home.hero.lead}</EnglishCopy>
            </p>

            <div data-hero-step className="mt-2 flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="accent"
                nativeButton={false}
                render={<Link href={PUBLIC_ROUTES.coffee} />}
              >
                <EnglishCopy>{copy.home.hero.exploreAction}</EnglishCopy>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-sidebar-foreground/45 text-sidebar-foreground hover:bg-sidebar-foreground/10"
                nativeButton={false}
                render={<Link href={PUBLIC_ROUTES.contact} />}
              >
                {copy.cta.requestAnOffer}
              </Button>
            </div>
          </div>

          {/*
            DESKTOP MEDIA — the arch crop the design system reserves for editorial media
            (`--radius-arch`). Repository-owned editorial photography, never the media of a catalogue
            record (MEDIA-01). Intrinsic ratio is preserved by `fill` inside a fixed-ratio box, so the
            entrance scale animates without shifting layout.
          */}
          <div className="relative hidden aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-arch)] border border-sidebar-border/70 bg-sidebar-accent shadow-[0_28px_72px_rgba(0,0,0,0.28)] lg:block">
            <Image
              src="/images/hero-banner.jpg"
              alt={copy.home.hero.imageAlt}
              fill
              priority
              sizes="(min-width: 1536px) 30vw, 38vw"
              data-hero-media
              className="object-cover object-[50%_42%]"
            />
            <span
              data-hero-scrim
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[color-mix(in_srgb,var(--forest-800)_60%,transparent)] to-transparent"
            />
          </div>
        </div>
      </section>
    </AnimatedHero>
  );
}
