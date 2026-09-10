import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import type { PublicOriginSummary } from "@/lib/public/origins";

/**
 * An active origin, as it appears in a listing (Phase 5.5, UIF-029).
 *
 * ── PUBLIC DTO ONLY ──────────────────────────────────────────────────────────────────────────────
 *
 * Built from `PublicOriginSummary` alone: name, region, country code and description. No raw
 * identifier and no private field can appear here, because the DTO does not carry one.
 *
 * The approved kit's origin card shows a lot count ("42 lots in stock"). That is member inventory
 * truth, not public catalogue data, so it is deliberately absent — a public origin card must not
 * imply a live order book (SRS MKT-06).
 *
 * ── WHY THERE IS NO IMAGE SLOT ───────────────────────────────────────────────────────────────────
 *
 * MEDIA-01 is unresolved, so there is no verified photograph for an origin **record**. The previous
 * version filled that gap with a `MediaPlaceholder` box on every card, which made a grid of origins
 * read as a grid of missing images. The repository's `origin-*.jpg` files cannot fill it either:
 * their filenames match some origin names by coincidence of the asset pack, not by provenance, and
 * mapping them by slug or name is exactly what UIF-029 forbids.
 *
 * So this card is deliberately **typographic**: the country code becomes a large quiet watermark and
 * the name carries the card. That is an honest premium answer to "no approved imagery" rather than a
 * placeholder apologising for one, and it needs no change when MEDIA-01 is resolved — the media slot
 * simply arrives as a new element.
 *
 * The whole card is one link target. Server Component; a real anchor.
 *
 * `tone` (public convergence pass): "light" is the catalogue card on the page ground; "dark" is the
 * same card as a glass panel for the homepage's forest showcase environment. Same DTO, same
 * structure — only surface, ink and hover differ.
 */
export type OriginCardTone = "light" | "dark";

const CARD_TONE: Record<OriginCardTone, { link: string; watermark: string; region: string; name: string; body: string; arrow: string }> = {
  light: {
    link: "border-border bg-card hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:outline-[var(--focus-ring)]",
    watermark: "text-foreground/[0.05] group-hover:text-foreground/[0.08]",
    region: "text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]",
    name: "text-foreground",
    body: "text-muted-foreground",
    arrow: "text-muted-foreground group-hover:text-foreground",
  },
  dark: {
    link: "min-h-[20rem] border-[color-mix(in_srgb,var(--brand-cream)_16%,transparent)] bg-[color-mix(in_srgb,var(--brand-cream)_6%,transparent)] hover:border-[color-mix(in_srgb,var(--gold-on-dark)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--brand-cream)_9%,transparent)] focus-visible:outline-[var(--gold-on-dark)] supports-[backdrop-filter]:[backdrop-filter:blur(12px)] sm:min-h-[22rem]",
    watermark: "text-[color-mix(in_srgb,var(--brand-cream)_7%,transparent)] group-hover:text-[color-mix(in_srgb,var(--gold-on-dark)_16%,transparent)]",
    region: "text-[var(--gold-on-dark)]",
    name: "text-[var(--brand-cream)]",
    body: "text-[color-mix(in_srgb,var(--brand-cream)_70%,transparent)]",
    arrow: "text-[color-mix(in_srgb,var(--brand-cream)_60%,transparent)] group-hover:text-[var(--gold-on-dark)]",
  },
};

export function OriginCard({ origin, tone = "light" }: { origin: PublicOriginSummary; tone?: OriginCardTone }) {
  const t = CARD_TONE[tone];
  return (
    <div className="group h-full">
      <Link
        href={`/origins/${origin.slug}/`}
        className={`relative flex h-full flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)] border p-7 transition-[border-color,box-shadow,transform,background-color] duration-[var(--dur-base)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transform-none ${t.link}`}
      >
        {/*
          The country code, set large and very quiet, as the card's ground. `dir="ltr"` because an
          ISO code is a Latin reference token and stays LTR inside an RTL layout (contract §12).
        */}
        {origin.countryCode ? (
          <span
            aria-hidden="true"
            dir="ltr"
            className={`pointer-events-none absolute -top-3 end-4 font-heading text-[5.5rem] font-black leading-none transition-colors duration-[var(--dur-base)] ${t.watermark}`}
          >
            {origin.countryCode}
          </span>
        ) : null}

        {origin.region ? (
          <span className={`hc-eyebrow relative ${t.region}`}>
            {origin.region.name}
          </span>
        ) : null}

        <h3 className={`relative font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] ${t.name}`}>
          {origin.name}
        </h3>

        {origin.description ? (
          <p className={`relative line-clamp-3 text-[length:var(--text-small)] leading-[1.7] text-pretty ${t.body}`}>
            {origin.description}
          </p>
        ) : null}

        <span
          aria-hidden="true"
          className={`relative mt-auto inline-flex items-center gap-2 pt-4 text-[length:var(--text-meta)] font-medium transition-colors duration-[var(--dur-fast)] ${t.arrow}`}
        >
          <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
        </span>
      </Link>
    </div>
  );
}
