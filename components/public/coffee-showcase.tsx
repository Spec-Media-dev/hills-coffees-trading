import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Static coffee showcase — "What every published coffee carries" (public design convergence pass).
 *
 * ── WHY THE HOMEPAGE NO LONGER PREVIEWS CATALOGUE ROWS ───────────────────────────────────────────
 *
 * Until record photography exists (MEDIA-01) a live catalogue row on the homepage renders as a
 * placeholder card with a fixture-looking name — which is what the previous "What we are carrying"
 * grid showed. That is honest, but on the homepage it reads as an unfinished product rather than as
 * a catalogue. So this section is deliberately **static and editorial for now**: it shows the three
 * things every published coffee carries — origin and region, processing method and variety,
 * packaging and certifications — which is the approved `intents.explore.body` sentence made visual,
 * and it hands off to the real dynamic `/coffee/` index with one CTA.
 *
 * It is easy to replace later: swap this component for a dynamic preview once record media exists;
 * `src/app/page.tsx` still fetches nothing extra for it.
 *
 * ── HONESTY LINE ─────────────────────────────────────────────────────────────────────────────────
 *
 * Editorial photography only, describing categories of information rather than any coffee. Nothing
 * here is inventory, availability, stock, a seller, a price, a grade or a cup score, and no image is
 * presented as a record's media. The lead says plainly that the catalogue is a sourcing reference,
 * not a live order book.
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * An asymmetric editorial grid rather than three equal cards: one tall portrait panel on the
 * inline-start and two landscape panels stacked on the inline-end, each photograph carrying its
 * caption on a scrim. Hover lifts the image slightly (CSS); entrance is a staggered `Reveal`.
 */

type Panel = {
  key: "origin" | "process" | "packaging";
  image: string;
  pick: (c: PublicCopy) => { title: string; body: string };
  alt: (c: PublicCopy) => string;
  className: string;
  sizes: string;
};

const PANELS: readonly Panel[] = [
  {
    key: "origin",
    image: "/images/origin-ethiopia.jpg",
    pick: (c) => c.home.showcase.origin,
    alt: (c) => c.home.showcase.alt.origin,
    className: "aspect-[4/5] lg:row-span-2 lg:aspect-auto lg:min-h-[36rem]",
    sizes: "(min-width: 1024px) 46vw, 100vw",
  },
  {
    key: "process",
    image: "/images/coffee-lot-2.jpg",
    pick: (c) => c.home.showcase.process,
    alt: (c) => c.home.showcase.alt.process,
    className: "aspect-[16/10] lg:aspect-auto lg:min-h-[17rem]",
    sizes: "(min-width: 1024px) 46vw, 100vw",
  },
  {
    key: "packaging",
    image: "/images/coffee-lot-3.jpg",
    pick: (c) => c.home.showcase.packaging,
    alt: (c) => c.home.showcase.alt.packaging,
    className: "aspect-[16/10] lg:aspect-auto lg:min-h-[17rem]",
    sizes: "(min-width: 1024px) 46vw, 100vw",
  },
] as const;

export function CoffeeShowcase() {
  return (
    <section className="bg-secondary py-[clamp(4rem,8vw,8.5rem)] text-foreground">
      <div className="hc-container flex flex-col gap-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-[44rem] flex-col gap-3">
            <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.home.showcase.eyebrow} />
            </span>
            <h2 className="hc-heading-2 font-semibold text-balance">
              <Bilingual pick={(c) => c.home.showcase.title} />
            </h2>
            <p className="hc-body-lg max-w-[58ch] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.home.showcase.lead} />
            </p>
          </div>
          <Link
            href={PUBLIC_ROUTES.coffee}
            className="group/cta inline-flex min-h-11 shrink-0 items-center gap-2 text-[length:var(--text-small)] font-semibold text-foreground underline-offset-4 decoration-[var(--gold-on-light)] decoration-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] dark:decoration-[var(--gold-on-dark)]"
          >
            <Bilingual pick={(c) => c.home.showcase.action} />
            <Icon
              name="arrow-right"
              data-directional-icon="true"
              className="size-4 transition-transform duration-[var(--dur-base)] group-hover/cta:translate-x-1 rtl:group-hover/cta:-translate-x-1"
            />
          </Link>
        </div>

        <ul className="grid gap-4 lg:grid-cols-2 lg:grid-rows-2 lg:gap-5">
          {PANELS.map((panel, index) => (
            <li key={panel.key} className={`relative ${panel.className}`}>
              <Reveal
                className="absolute inset-0"
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: index * 0.08 }}
              >
                <figure className="group/panel relative h-full w-full overflow-hidden rounded-[var(--radius-xl)] border border-border bg-muted">
                  <Image
                    src={panel.image}
                    alt={panel.alt(copy)}
                    fill
                    sizes={panel.sizes}
                    className="object-cover object-center transition-transform duration-[1400ms] ease-[var(--ease-out)] group-hover/panel:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover/panel:scale-100"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-[linear-gradient(0deg,color-mix(in_srgb,var(--forest-900)_88%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_40%,transparent)_55%,transparent_100%)]"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-6 text-[var(--brand-cream)] sm:p-7">
                    <span className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                      <Bilingual pick={(c) => panel.pick(c).title} />
                    </span>
                    <span className="max-w-[40ch] text-[length:var(--text-small)] leading-[1.6] text-[color-mix(in_srgb,var(--brand-cream)_80%,transparent)]">
                      <Bilingual pick={(c) => panel.pick(c).body} />
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
