import Link from "next/link";

import { HEADING_3, LINK_QUIET } from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { copy } from "@/lib/public/copy";

/**
 * Homepage intent cards (Feature 002, T012 — FR-021, PS1, PS4).
 *
 * The design guidance names exactly three public intents and requires each to lead to the correct
 * journey: **Source coffee** → the commercial conversation, **Explore available coffee** → the public
 * catalogue, **Trade with Hills** → the authorised-member entry. Separating them here is what stops
 * the homepage funnelling every visitor into the Trading Portal, which the positioning explicitly
 * forbids.
 *
 * These are cards because the content genuinely is three parallel, comparable choices — the one
 * place on this page where a card grid is the honest structure. They are NOT numbered: three routes
 * into the business are a set, not a sequence.
 *
 * Server Component; each card's action is a real anchor. All copy resolves through T000's dictionary.
 */

const INTENTS = [
  {
    key: "source",
    href: PUBLIC_ROUTES.contact,
    title: copy.home.intents.source.title,
    body: copy.home.intents.source.body,
    action: copy.home.intents.source.action,
  },
  {
    key: "explore",
    href: PUBLIC_ROUTES.coffee,
    title: copy.home.intents.explore.title,
    body: copy.home.intents.explore.body,
    action: copy.home.intents.explore.action,
  },
  {
    key: "trade",
    href: PUBLIC_ROUTES.portalEntry,
    title: copy.home.intents.trade.title,
    body: copy.home.intents.trade.body,
    action: copy.home.intents.trade.action,
  },
] as const;

export function IntentCards() {
  return (
    <ul className="grid gap-5 md:grid-cols-3">
      {INTENTS.map((intent) => (
        <li
          key={intent.key}
          className="group flex min-h-64 flex-col gap-5 rounded-xl border border-border bg-card p-7 shadow-[0_12px_38px_rgba(23,60,50,0.045)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_18px_46px_rgba(23,60,50,0.09)] motion-reduce:transform-none motion-reduce:transition-none dark:shadow-none"
        >
          {/* The gold rule marks each card's head without adding a third type size. */}
          <span aria-hidden="true" className="h-px w-10 bg-accent" />
          <h3 className={HEADING_3}>{intent.title}</h3>
          <p className="text-[0.9375rem] leading-[1.6] text-muted-foreground text-pretty">
            {intent.body}
          </p>
          <Link
            href={intent.href}
            className={`${LINK_QUIET} mt-auto self-start pt-4`}
          >
            {intent.action}
          </Link>
        </li>
      ))}
    </ul>
  );
}
