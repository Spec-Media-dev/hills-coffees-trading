import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { ContactLocation } from "@/components/public/contact-location";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { RfqForm } from "@/components/public/rfq-form";
import { Icon } from "@/components/ui/icon";
import { HILLS_DUBAI, telHref } from "@/lib/public/contact";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public Contact page — honest static surface, now carrying the real RFQ form (Feature 002 T020).
 *
 * ── WHAT THIS PAGE IS ────────────────────────────────────────────────────────────────────────────
 *
 * `/contact/` is the destination of every "Request an offer" CTA in the product: what a conversation
 * with Hills covers, where each intent leads, the request form itself, and where the business
 * operates.
 *
 * ── THE FORM IS REAL, AND HONEST ABOUT WHERE IT STOPS ───────────────────────────────────────────
 *
 * `RfqForm` (`components/public/rfq-form.tsx`) is the one narrow Client Component on this page: an
 * accessible React Hook Form validated against the SAME Zod schema (`lib/validation/rfq.ts`) the
 * Server Action (`./actions.ts`) enforces. **DB-BLOCK-02** (no approved anonymous-RFQ persistence
 * destination) and **CRM-DEST-01** (no approved CRM hand-off) are still unresolved, so a genuinely
 * valid submission returns the documented *unavailable* result — never a success claim — with the
 * alternative contact route already on this page. This page's own server-rendered content (title,
 * H1, intents, operating locations) exists and is crawlable whether or not the form's client JS ever
 * loads (contract §10, §26).
 *
 * CONTACT DETAILS (final non-payment closure run): the Dubai office · warehouse · factory site the
 * business confirmed — address, facility, working hours and the two phone lines — rendered from the
 * typed model in `lib/public/contact.ts` by `ContactLocation`, with a real key-less Google Maps preview
 * and "Open in Google Maps" action. Dubai only; no other office is listed. Email, WhatsApp, social
 * profiles and a direct place URL are `null` until supplied, and a `null` channel renders nothing (never
 * a dead `#` link). Nothing is invented.
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * A dark photographic opener the header dissolves into; three hairline-divided intent panels on the
 * page ground, each with its real destination where one exists; the RFQ form; and the
 * operating-locations block. Server Component; the only client code is `Reveal` and `RfqForm`.
 */

const PATH = "/contact/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);
  return {
    title: copy.contact.metaTitle,
    description: copy.contact.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.contact.metaTitle,
      description: copy.contact.metaDescription,
    },
  };
}

type Intent = {
  key: "sourcing" | "coffee" | "membership";
  href?: string;
  pick: (c: PublicCopy) => { title: string; body: string; action?: string };
};

const INTENTS: readonly Intent[] = [
  { key: "sourcing", pick: (c) => c.contact.intents.sourcing },
  { key: "coffee", href: PUBLIC_ROUTES.coffee, pick: (c) => c.contact.intents.coffee },
  { key: "membership", href: PUBLIC_ROUTES.portalEntry, pick: (c) => c.contact.intents.membership },
] as const;

export default function ContactPage() {
  return (
    <article>
      {/* ── OPENER ── */}
      <section
        data-page-opener="dark"
        className="relative isolate -mt-[var(--header-h)] overflow-hidden bg-[var(--forest-900)] pt-[var(--header-h)] text-[var(--brand-cream)]"
      >
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/coffee-lot-7.jpg"
            alt={copy.contact.imageAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[70%_50%]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--forest-900)_94%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_80%,transparent)_48%,color-mix(in_srgb,var(--forest-900)_34%,transparent)_100%)] rtl:bg-[linear-gradient(270deg,color-mix(in_srgb,var(--forest-900)_94%,transparent)_0%,color-mix(in_srgb,var(--forest-900)_80%,transparent)_48%,color-mix(in_srgb,var(--forest-900)_34%,transparent)_100%)]"
          />
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[color-mix(in_srgb,var(--forest-900)_70%,transparent)] to-transparent" />
        </div>

        <div className="hc-container flex min-h-[min(64svh,36rem)] flex-col justify-end gap-6 pb-[clamp(3rem,7vw,6rem)] pt-[clamp(4rem,10vw,7rem)]">
          <span className="hc-eyebrow text-[var(--gold-on-dark)] font-semibold tracking-wider">
            <Bilingual pick={(c) => c.contact.eyebrow} />
          </span>
          <h1 className="hc-display max-w-[14ch] font-semibold text-balance">
            <Bilingual pick={(c) => c.contact.title} />
          </h1>
          <p className="hc-body-lg max-w-[56ch] text-[color-mix(in_srgb,var(--brand-cream)_80%,transparent)] text-pretty">
            <Bilingual pick={(c) => c.contact.lead} />
          </p>
        </div>
      </section>

      {/* ── THE DUBAI SITE ── address, hours, phones and the real Google Maps location. */}
      <ContactLocation />

      {/* ── WHAT A CONVERSATION COVERS ── three hairline-divided intents. */}
      <section className="bg-background py-[clamp(4rem,8vw,8rem)] text-foreground">
        <div className="hc-container flex flex-col gap-10">
          <h2 className="hc-heading-2 max-w-[20ch] font-semibold text-balance">
            <Bilingual pick={(c) => c.contact.intentsHeading} />
          </h2>

          <ul className="grid border-t border-border lg:grid-cols-3">
            {INTENTS.map((intent, index) => (
              <li
                key={intent.key}
                className="border-b border-border lg:border-b-0 lg:border-e lg:px-8 lg:first:ps-0 lg:last:border-e-0 lg:last:pe-0"
              >
                <Reveal
                  className="flex h-full flex-col gap-4 py-8 lg:py-10"
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.07 }}
                >
                  <span aria-hidden="true" className="h-px w-10 bg-[var(--hc-accent)]" />
                  <h3 className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                    <Bilingual pick={(c) => intent.pick(c).title} />
                  </h3>
                  <p className="max-w-[44ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
                    <Bilingual pick={(c) => intent.pick(c).body} />
                  </p>
                  {intent.href ? (
                    <Link
                      href={intent.href}
                      className="group/link mt-auto inline-flex min-h-11 items-center gap-2 pt-2 text-[length:var(--text-small)] font-semibold underline-offset-4 decoration-[var(--hc-accent)] decoration-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
                    >
                      <Bilingual pick={(c) => intent.pick(c).action ?? ""} />
                      <Icon
                        name="arrow-right"
                        data-directional-icon="true"
                        className="size-4 transition-transform duration-[var(--dur-base)] group-hover/link:translate-x-1 rtl:group-hover/link:-translate-x-1"
                      />
                    </Link>
                  ) : null}
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── THE REQUEST FORM ── and where Hills operates. */}
      <section className="bg-secondary py-[clamp(4rem,8vw,8rem)] text-foreground">
        <div className="hc-container grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
          {/*
            DB-BLOCK-02 / CRM-DEST-01: the form is real (T019–T022), but a genuinely valid submission
            still returns the documented *unavailable* result — RfqForm renders that honestly rather
            than claiming success. RfqForm resolves its own copy client-side via useLocale(), so this
            server-rendered wrapper only supplies the heading through Bilingual, exactly like every
            other server-rendered string on this page.
          */}
          <div className="flex flex-col gap-6 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--hc-accent)_35%,transparent)] bg-card p-7 shadow-[var(--shadow-md)] sm:p-9 dark:border-[color-mix(in_srgb,var(--hc-accent)_30%,transparent)] dark:shadow-none">
            <div className="flex flex-col gap-2">
              <span className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.contact.rfq.heading} />
              </span>
              <p className="max-w-[56ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
                <Bilingual pick={(c) => c.contact.rfq.lead} />
              </p>
            </div>
            <RfqForm />
          </div>

          <aside className="flex flex-col gap-4 self-start rounded-[var(--radius-xl)] border border-border bg-card p-6 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]" data-contact-quick>
            <h2 className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
              <Bilingual pick={(c) => c.contact.location.quickHeading} />
            </h2>
            <p className="text-[length:var(--text-small)] leading-[1.65] text-muted-foreground">
              <Bilingual pick={(c) => c.contact.location.quickBody} />{" "}
              <Bilingual pick={(c) => c.contact.location.hoursValue} />
            </p>
            <ul className="flex flex-col gap-2">
              {HILLS_DUBAI.phones.map((phone) => (
                <li key={phone.key}>
                  <a
                    href={telHref(phone.tel)}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border px-4 py-2 text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon name="phone" className="size-4" aria-hidden="true" />
                      <Bilingual pick={(c) => c.contact.location.call} />
                    </span>
                    <span dir="ltr" className="font-mono text-sm tabular-nums">
                      {phone.display}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <Link href="#location" className="inline-flex min-h-11 items-center gap-2 self-start text-[length:var(--text-small)] font-semibold underline decoration-[var(--hc-accent)] underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              <Icon name="map-pin" className="size-4" aria-hidden="true" />
              <Bilingual pick={(c) => c.contact.location.seeLocation} />
            </Link>
          </aside>
        </div>
      </section>
    </article>
  );
}
