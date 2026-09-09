import Image from "next/image";
import Link from "next/link";

import {
  CONTAINER,
  EYEBROW,
} from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/public/copy";

/**
 * Homepage hero (Feature 002, T012 — FR-021, PS1).
 *
 * THE ONE PLACE THIS DESIGN SPENDS ITS BOLDNESS. Everything below the hero is deliberately quiet, so
 * the first screen carries the positioning on its own: a full-bleed deep-forest editorial ground, a
 * headline set at the brand's largest display step, and an asymmetric split against a tall portrait
 * media area — the composition the approved public-website kit establishes for this page
 * in the approved public website reference.
 *
 * The message is the one the design guidance requires: Dubai-based regional green-coffee supply,
 * stated immediately, with two clear actions — explore the coffee, or start a commercial
 * conversation. B2B throughout; no retail-cafe or roasted-coffee language anywhere in it.
 *
 * Colour comes entirely from Feature 001's token mapping of the Hills ramp — `bg-sidebar` is
 * forest #173C32, `text-sidebar-foreground` the warm cream, and `text-sidebar-ring` the lighter
 * gold the brand reserves for dark grounds (the darker ochre does not hold contrast there). No
 * second colour, type or spacing system is introduced (FR-030).
 *
 * Server Component: zero client JavaScript, and both actions are real anchors that work with
 * JavaScript disabled.
 */

/** `--text-hero`: clamp(44px, 1.6rem + 5.6vw, 112px) at `--lh-display` / `--tracking-display`. */
const HERO_HEADLINE =
  "hc-display font-semibold text-balance";

export function Hero() {
  return (
    <section className="bg-sidebar text-sidebar-foreground">
      <div
        className={`${CONTAINER} grid gap-12 py-[clamp(3.5rem,8vw,8rem)] lg:min-h-[46rem] lg:grid-cols-[minmax(0,1.08fr)_minmax(19rem,0.92fr)] lg:items-center lg:gap-16`}
      >
        <div className="flex flex-col items-start gap-6">
          <span className={`${EYEBROW} text-sidebar-ring`}>
            {copy.home.hero.eyebrow}
          </span>

          <h1 className={HERO_HEADLINE}>{copy.home.hero.headline}</h1>

          {/* A gold hairline between headline and lead — the brand's rule device, used once. */}
          <span aria-hidden="true" className="h-px w-16 bg-sidebar-ring" />

          <p className="max-w-[54ch] text-[1.0625rem] leading-[1.7] text-sidebar-foreground/85 text-pretty">
            {copy.home.hero.lead}
          </p>

          <div className="mt-2 flex flex-wrap gap-3">
            <Button variant="accent" render={<Link href={PUBLIC_ROUTES.coffee} />}>
              {copy.home.hero.exploreAction}
            </Button>
            <Button
              variant="outline"
              className="border-sidebar-foreground/40 text-sidebar-foreground hover:bg-white/8"
              render={<Link href={PUBLIC_ROUTES.contact} />}
            >
              {copy.cta.requestAnOffer}
            </Button>
          </div>
        </div>

        {/* Repository-owned editorial photography, not media for a catalogue entity (MEDIA-01). */}
        <div className="relative min-h-[28rem] overflow-hidden rounded-b-2xl rounded-t-[9rem] border border-sidebar-border bg-sidebar-accent shadow-[0_24px_70px_rgba(0,0,0,0.2)] sm:min-h-[34rem] lg:min-h-[38rem]">
          <Image
            src="/images/hero-banner.jpg"
            alt={copy.home.hero.imageAlt}
            fill
            preload
            sizes="(min-width: 1024px) 42vw, (min-width: 640px) 86vw, 90vw"
            className="object-cover object-center"
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-sidebar/45 to-transparent"
          />
        </div>
      </div>
    </section>
  );
}
