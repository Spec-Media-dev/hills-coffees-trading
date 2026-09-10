import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Homepage intent panels (Feature 002, T012 — FR-021, PS1, PS4; rebuilt by the public design
 * convergence pass).
 *
 * The design guidance names exactly three public intents and requires each to lead to the correct
 * journey: **Source coffee** → the commercial conversation, **Explore available coffee** → the
 * public catalogue, **Trade with Hills** → the authorised-member entry. Separating them is what stops
 * the homepage funnelling every visitor into the Trading Portal.
 *
 * ── THREE PATHWAYS, NOT THREE FEATURE CARDS ──────────────────────────────────────────────────────
 *
 * The three white cards are gone. The intents are now three editorial columns on the page ground,
 * divided by hairlines rather than boxed — no border, no card surface, no shadow at rest — with the
 * sourcing path given the widest column because it is the primary commercial journey. Each whole
 * column is the link. On hover or keyboard focus a documentary photograph rises behind it under a
 * forest wash, the ink turns cream, the gold rule extends and the arrow advances — the
 * "one panel becomes dominant" response the brief asks for, carried entirely by CSS so the section
 * stays a Server Component. Entrance is a short staggered `Reveal` (Motion) per panel; CSS owns the
 * hover state; the two never touch the same property on the same node.
 *
 * They are NOT numbered: three routes into the business are a set, not a sequence.
 *
 * The photographs are repository editorial assets illustrating each path; none is presented as the
 * media of a coffee or origin record (MEDIA-01). Every string resolves through the T000 dictionary.
 */

type Intent = {
  key: "source" | "explore" | "trade";
  href: string;
  image: string;
  pick: (c: PublicCopy) => { title: string; body: string; action: string };
};

const INTENTS: readonly Intent[] = [
  {
    key: "source",
    href: PUBLIC_ROUTES.contact,
    image: "/images/origin-guatemala.jpg",
    pick: (c) => c.home.intents.source,
  },
  {
    key: "explore",
    href: PUBLIC_ROUTES.coffee,
    image: "/images/coffee-lot-2.jpg",
    pick: (c) => c.home.intents.explore,
  },
  {
    key: "trade",
    href: PUBLIC_ROUTES.portalEntry,
    image: "/images/coffee-lot-7.jpg",
    pick: (c) => c.home.intents.trade,
  },
] as const;

const PANEL =
  "group/intent relative isolate flex min-h-[20rem] flex-col justify-between gap-10 overflow-hidden rounded-[var(--radius-xl)] p-7 text-foreground transition-[color,background-color,transform] duration-[var(--dur-slow)] ease-[var(--ease-standard)] hover:text-[var(--brand-cream)] focus-visible:text-[var(--brand-cream)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] lg:min-h-[28rem] lg:p-9";

export function IntentCards() {
  return (
    <ul className="grid gap-2 border-t border-border lg:-mx-9 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-0 lg:border-t-0">
      {INTENTS.map((intent, index) => (
        <li
          key={intent.key}
          className="flex border-b border-border py-2 lg:border-b-0 lg:border-s lg:py-0 lg:ps-5 lg:first:border-s-0 lg:first:ps-0 lg:last:pe-0"
        >
          <Reveal className="flex w-full" transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.09 }}>
            <Link href={intent.href} className={PANEL}>
              {/* Background photograph and wash — invisible at rest, revealed by hover/focus. */}
              <span aria-hidden="true" className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-[var(--dur-slowest)] ease-[var(--ease-standard)] group-hover/intent:opacity-100 group-focus-visible/intent:opacity-100 motion-reduce:transition-none">
                <Image
                  src={intent.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 34vw, 100vw"
                  className="object-cover object-center transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover/intent:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/intent:scale-100"
                />
                <span className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--forest-900)_62%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_86%,transparent)_100%)]" />
              </span>

              <span className="flex flex-col gap-4">
                {/* Gold rule: short at rest, extended when the panel is dominant. */}
                <span aria-hidden="true" className="h-px w-10 bg-[var(--gold-on-light)] transition-[width,background-color] duration-[var(--dur-slow)] ease-[var(--ease-out)] group-hover/intent:w-20 group-hover/intent:bg-[var(--gold-on-dark)] group-focus-visible/intent:w-20 group-focus-visible/intent:bg-[var(--gold-on-dark)] dark:bg-[var(--gold-on-dark)]" />
                <span className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-balance lg:text-[length:var(--text-h2)] lg:leading-[var(--lh-heading)]">
                  <Bilingual pick={(c) => intent.pick(c).title} />
                </span>
                <span className="max-w-[38ch] text-[length:var(--text-body)] leading-[1.65] text-muted-foreground transition-colors duration-[var(--dur-slow)] group-hover/intent:text-[color-mix(in_srgb,var(--brand-cream)_84%,transparent)] group-focus-visible/intent:text-[color-mix(in_srgb,var(--brand-cream)_84%,transparent)] text-pretty">
                  <Bilingual pick={(c) => intent.pick(c).body} />
                </span>
              </span>

              <span className="inline-flex min-h-11 items-center gap-2 text-[length:var(--text-small)] font-semibold">
                <Bilingual pick={(c) => intent.pick(c).action} />
                <Icon
                  name="arrow-right"
                  data-directional-icon="true"
                  className="size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/intent:translate-x-1 rtl:group-hover/intent:-translate-x-1 motion-reduce:transition-none"
                />
              </span>
            </Link>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
