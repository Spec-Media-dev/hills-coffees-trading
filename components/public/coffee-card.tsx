import Link from "next/link";
import { Bilingual } from "@/components/locale/bilingual";

import { MediaPlaceholder } from "@/components/public/media-placeholder";
import type { PublicCoffeeSummary } from "@/lib/public/coffees";

/**
 * A published coffee, as it appears in a listing (Phase 5.5, UIF-027).
 *
 * ── WHAT THIS CARD DELIBERATELY DOES NOT SHOW ────────────────────────────────────────────────────
 *
 * The approved design kit's listing card carries grade, harvest, quantity and price — but that card
 * belongs to the authorised member marketplace. On the public surface those are private trading
 * data, and the source-priority order puts the database baseline and the SRS above the design kit.
 * So this card is built from the public DTO alone: name, origin, description, coffee type and
 * processing method. There is no grade, no cup score, no crop year, no quantity, no MOQ, no
 * availability, no seller and no price anywhere in it — and none of those fields exists on
 * `PublicCoffeeSummary` to render even by accident.
 *
 * ── EDITORIAL, NOT A DATABASE ROW IN A BOX ───────────────────────────────────────────────────────
 *
 * The card follows the homepage's visual language rather than a generic shadcn surface: a gold
 * origin overline in the eyebrow treatment, the coffee name in the Benito display face, the
 * description given real room, and the two specification facts a professional buyer scans for first
 * sitting below a hairline rather than floating as loose text.
 *
 * `description` was previously fetched and then discarded. It is approved public copy and is the
 * single biggest thing that makes a catalogue read as a catalogue rather than a list of names, so it
 * is rendered here, clamped to keep the grid even.
 *
 * Radius is `--radius-lg` (14px) per contract §6 — the card token, not Tailwind's `rounded-xl`.
 *
 * The whole card is one link target, so the hit area matches what a visitor perceives as clickable.
 * Server Component; a real anchor, traversable with JavaScript disabled.
 */
/**
 * Heading level for the card title.
 *
 * The correct level depends on what precedes the grid, so the caller decides: on `/coffee/` the
 * cards sit directly under the page `h1`, making them `h2`; on the homepage and on origin detail
 * they sit under a section `h2`, making them `h3`. Hard-coding one level would skip a level on one
 * of those surfaces, which is exactly the heading-order defect an audit flags.
 */
export type CoffeeCardProps = {
  coffee: PublicCoffeeSummary;
  headingLevel?: 2 | 3;
};

export function CoffeeCard({ coffee, headingLevel = 3 }: CoffeeCardProps) {
  const origin = coffee.origin;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const specs = [coffee.coffeeType?.name, coffee.processingMethod?.name].filter(Boolean);

  return (
    <li className="group">
      <Link
        href={`/coffee/${coffee.slug}/`}
        className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transform-none"
      >
        {/*
          Record media stays a placeholder: MEDIA-01 is unresolved, and a generic repository
          photograph here would assert that it depicts this specific coffee. The reserved box keeps
          the grid even and shifts nothing when real photography eventually lands.
        */}
        <MediaPlaceholder aspectRatio="4 / 3" className="rounded-none border-0 border-b" />

        <div className="flex flex-1 flex-col gap-3 p-6">
          {origin ? (
            <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              {origin.name}
              {origin.countryCode ? ` · ${origin.countryCode}` : ""}
            </span>
          ) : null}

          <Heading className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-foreground">
            {coffee.name}
          </Heading>

          {coffee.description ? (
            <p className="line-clamp-3 text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
              {coffee.description}
            </p>
          ) : null}

          {/*
            Type and process are public taxonomy. Rendered as a definition list so the label/value
            pairing survives without a screen reader having to infer it from layout, and set on a
            hairline so the card has a base rather than trailing off.
          */}
          {specs.length > 0 ? (
            <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4 text-[length:var(--text-meta)] text-muted-foreground">
              {coffee.coffeeType ? (
                <div className="flex gap-2">
                  <dt className="sr-only"><Bilingual pick={(c) => c.coffee.detail.coffeeType} /></dt>
                  <dd>{coffee.coffeeType.name}</dd>
                </div>
              ) : null}
              {specs.length === 2 ? (
                <span aria-hidden="true" className="text-border">
                  ·
                </span>
              ) : null}
              {coffee.processingMethod ? (
                <div className="flex gap-2">
                  <dt className="sr-only"><Bilingual pick={(c) => c.coffee.detail.processingMethod} /></dt>
                  <dd>{coffee.processingMethod.name}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** Shared grid framing, so the index and the homepage preview cannot drift apart. */
export const COFFEE_GRID = "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";
