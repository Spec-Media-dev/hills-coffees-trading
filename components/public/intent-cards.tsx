import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";

/**
 * Commercial Pathways — Tomorro-Level Asymmetric Redesign (Feature 002, T012).
 *
 * ── ASYMMETRIC EDITORIAL COMPOSITION ─────────────────────────────────────────────────────────────
 *
 * 1. Dominant primary commercial anchor (Source Coffee): A tall, photographic feature stage
 *    with documentary origin imagery, deep forest scrim, Burnt Orange pill badge, and prominent
 *    action button.
 * 2. Two stacked complementary pathways (Explore Catalogue & Member Trading Portal):
 *    Rich horizontal cards with dedicated visual crops, crisp micro-tags, and interactive hover lift.
 *
 * ── CONTENT TRUTHFULNESS & CLIENT INTEGRITY ───────────────────────────────────────────────────────
 *
 * All text strictly sourced from the approved copy dictionary via `<Bilingual>`.
 * Server Component architecture preserved. Hover/focus states driven by CSS.
 */

export function IntentCards() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
      {/* ── PRIMARY FEATURE: SOURCE COFFEE ── */}
      <Reveal transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Link
          href={PUBLIC_ROUTES.contact}
          className="group/main relative isolate flex min-h-[28rem] flex-col justify-between overflow-hidden rounded-[var(--radius-2xl)] border border-[rgba(23,60,50,0.12)] p-8 text-[#f2f5eb] shadow-[0_12px_40px_rgba(18,35,20,0.08)] transition-all duration-500 hover:border-[var(--hc-accent)] hover:shadow-[0_24px_60px_rgba(164,72,25,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)] sm:p-10 lg:min-h-[34rem]"
        >
          {/* Background photograph with slow zoom */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-[var(--hc-forest)]">
            <Image
              src="/images/origin-guatemala.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover object-center transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover/main:scale-[1.05]"
            />
            <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,35,20,0.65)_0%,rgba(18,35,20,0.92)_65%,rgba(18,35,20,0.98)_100%)]" />
          </div>

          {/* Top meta */}
          <div className="flex flex-col items-start gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(242,245,235,0.2)] bg-[rgba(18,35,20,0.65)] px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#f2f5eb] backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
              <span><Bilingual pick={(c) => c.home.intents.eyebrow} /></span>
            </div>
            <span aria-hidden="true" className="h-0.5 w-12 bg-[var(--hc-accent)]" />
          </div>

          {/* Core content */}
          <div className="flex flex-col gap-5 pt-12">
            <h3 className="font-heading text-[clamp(1.75rem,1.4rem+1.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-[#f2f5eb] text-balance">
              <Bilingual pick={(c) => c.home.intents.source.title} />
            </h3>

            <p className="max-w-[42ch] text-[clamp(0.95rem,0.9rem+0.2vw,1.0625rem)] leading-[1.7] text-[rgba(242,245,235,0.85)] text-pretty">
              <Bilingual pick={(c) => c.home.intents.source.body} />
            </p>

            {/* Action button */}
            <div className="pt-4">
              <span className="hc-btn-accent inline-flex h-11 items-center gap-2 px-6 text-sm font-semibold shadow-[0_4px_16px_rgba(164,72,25,0.3)]">
                <Bilingual pick={(c) => c.home.intents.source.action} />
                <Icon
                  name="arrow-right"
                  data-directional-icon="true"
                  className="size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/main:translate-x-1 rtl:group-hover/main:-translate-x-1"
                />
              </span>
            </div>
          </div>
        </Link>
      </Reveal>

      {/* ── SECONDARY STACK: EXPLORE CATALOGUE & TRADING PORTAL ── */}
      <div className="flex flex-col gap-6 lg:gap-8">
        {/* Pathway 2: Explore Coffee */}
        <Reveal transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}>
          <Link
            href={PUBLIC_ROUTES.coffee}
            className="group/card relative isolate flex flex-col justify-between overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card p-7 text-card-foreground shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-[var(--hc-accent)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)] sm:p-8"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                  <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
                  <Bilingual pick={(c) => c.nav.coffee} />
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  <Bilingual pick={(c) => c.megaMenu.coffee.primary} />
                </span>
              </div>

              <h4 className="font-heading text-2xl font-semibold leading-[1.15] tracking-tight text-foreground transition-colors group-hover/card:text-[var(--hc-accent)]">
                <Bilingual pick={(c) => c.home.intents.explore.title} />
              </h4>

              <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground text-pretty">
                <Bilingual pick={(c) => c.home.intents.explore.body} />
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground group-hover/card:text-[var(--hc-accent)]">
                <Bilingual pick={(c) => c.home.intents.explore.action} />
                <Icon
                  name="arrow-right"
                  data-directional-icon="true"
                  className="size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/card:translate-x-1 rtl:group-hover/card:-translate-x-1"
                />
              </span>
            </div>
          </Link>
        </Reveal>

        {/* Pathway 3: Trade with Hills (Member Portal) */}
        <Reveal transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}>
          <Link
            href={PUBLIC_ROUTES.portalEntry}
            className="group/card relative isolate flex flex-col justify-between overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card p-7 text-card-foreground shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-500 hover:border-[var(--hc-accent)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)] sm:p-8"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                  <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
                  <Bilingual pick={(c) => c.nav.portalEntry} />
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  <Bilingual pick={(c) => c.home.credibility.membership.title} />
                </span>
              </div>

              <h4 className="font-heading text-2xl font-semibold leading-[1.15] tracking-tight text-foreground transition-colors group-hover/card:text-[var(--hc-accent)]">
                <Bilingual pick={(c) => c.home.intents.trade.title} />
              </h4>

              <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground text-pretty">
                <Bilingual pick={(c) => c.home.intents.trade.body} />
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground group-hover/card:text-[var(--hc-accent)]">
                <Bilingual pick={(c) => c.home.intents.trade.action} />
                <Icon
                  name="arrow-right"
                  data-directional-icon="true"
                  className="size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/card:translate-x-1 rtl:group-hover/card:-translate-x-1"
                />
              </span>
            </div>
          </Link>
        </Reveal>
      </div>
    </div>
  );
}
