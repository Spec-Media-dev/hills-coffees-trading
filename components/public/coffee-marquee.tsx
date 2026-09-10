import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Continuous coffee strip (public design convergence pass).
 *
 * ── A SECOND DISCOVERY MOMENT, MOVING ────────────────────────────────────────────────────────────
 *
 * A full-bleed band of documentary photographs from origin that travels continuously toward the
 * inline-start, with the catalogue CTA in its header. It exists to give the coffee story momentum
 * between the static showcase and the origins band, and to hand off to `/coffee/` a second time.
 *
 * ── SEAMLESS BY CONSTRUCTION ─────────────────────────────────────────────────────────────────────
 *
 * The track renders its item set twice, and the CSS animation (`globals.css`, `.hc-marquee-track`)
 * translates the track by exactly half its own width. At the end of one cycle the second set sits
 * precisely where the first began, so the loop never reaches a last item, never stops and never
 * visibly jumps. The clone is `aria-hidden` with its links unfocusable, so assistive technology and
 * the keyboard see each card once. Hover or focus anywhere in the strip pauses it.
 *
 * Direction is art-directed, not mirrored by accident: the strip moves toward the inline-start in
 * both writing modes (`[dir="rtl"]` swaps the keyframes), which is the reading direction in each.
 *
 * Under reduced motion the animation is removed, the clone is hidden and the strip becomes an
 * ordinary horizontal scroller, so every card stays reachable with no motion.
 *
 * ── HONESTY LINE ─────────────────────────────────────────────────────────────────────────────────
 *
 * Captions name only what each photograph shows. No coffee, origin, farm, variety, grade,
 * availability or price is stated or implied, and no image is presented as a record's media
 * (MEDIA-01). Pure CSS: the section is a Server Component and adds no client island.
 */

type Card = {
  key: keyof PublicCopy["home"]["marquee"]["captions"];
  image: string;
};

const CARDS: readonly Card[] = [
  { key: "cherries", image: "/images/coffee-cherry.jpg" },
  { key: "basket", image: "/images/farmer-partnership.jpg" },
  { key: "beds", image: "/images/farm-landscape.jpg" },
  { key: "ripening", image: "/images/origin-colombia.jpg" },
  { key: "sorting", image: "/images/coffee-lot-6.jpg" },
  { key: "grower", image: "/images/coffee-lot-4.jpg" },
  { key: "sackCherries", image: "/images/origin-yemen.jpg" },
  { key: "hands", image: "/images/origin-guatemala.jpg" },
] as const;

function Strip({ clone }: { clone: boolean }) {
  return (
    <ul
      aria-hidden={clone ? "true" : undefined}
      className={`flex shrink-0 gap-4 pe-4 sm:gap-5 sm:pe-5 ${clone ? "hc-marquee-clone" : ""}`}
    >
      {CARDS.map((card) => (
        <li key={card.key} className="w-[15rem] shrink-0 sm:w-[17rem]">
          <Link
            href={PUBLIC_ROUTES.coffee}
            tabIndex={clone ? -1 : undefined}
            className="group/card relative block aspect-[3/4] overflow-hidden rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--brand-cream)_14%,transparent)] bg-[var(--forest-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]"
          >
            <Image
              src={card.image}
              alt=""
              fill
              sizes="17rem"
              className="object-cover object-center transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover/card:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[color-mix(in_srgb,var(--forest-900)_86%,transparent)] to-transparent"
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4 text-[var(--brand-cream)]">
              <span className="text-[length:var(--text-small)] font-semibold">
                <Bilingual pick={(c) => c.home.marquee.captions[card.key]} />
              </span>
              <Icon
                name="arrow-right"
                data-directional-icon="true"
                className="size-4 shrink-0 opacity-0 transition-[opacity,transform] duration-[var(--dur-base)] group-hover/card:opacity-100 group-hover/card:translate-x-0.5 group-focus-visible/card:opacity-100 rtl:group-hover/card:-translate-x-0.5"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CoffeeMarquee() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--forest-800)] py-[clamp(3.5rem,7vw,6.5rem)] text-[var(--brand-cream)]">
      <div className="hc-container flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-[40rem] flex-col gap-3">
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.home.marquee.eyebrow} />
          </span>
          <h2 className="hc-heading-2 font-semibold text-balance">
            <Bilingual pick={(c) => c.home.marquee.title} />
          </h2>
        </div>
        <Link
          href={PUBLIC_ROUTES.coffee}
          className="group/cta inline-flex h-[var(--control-h)] shrink-0 items-center gap-2 self-start rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--gold-on-dark)_55%,transparent)] px-5 text-sm font-semibold text-[var(--brand-cream)] transition-colors duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,var(--brand-cream)_10%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] sm:self-auto"
        >
          <Bilingual pick={(c) => c.cta.exploreAllCoffee} />
          <Icon
            name="arrow-right"
            data-directional-icon="true"
            className="size-4 transition-transform duration-[var(--dur-base)] group-hover/cta:translate-x-1 rtl:group-hover/cta:-translate-x-1"
          />
        </Link>
      </div>

      {/* Full-bleed strip. No padding on the track: the two sets must be exactly half the track each,
          or the half-width translation would not land on the seam. */}
      <div
        className="hc-marquee mt-10 [--marquee-duration:56s] sm:mt-12"
        aria-label={copy.home.marquee.trackLabel}
        role="region"
      >
        <div className="hc-marquee-track">
          <Strip clone={false} />
          <Strip clone />
        </div>
      </div>
    </section>
  );
}
