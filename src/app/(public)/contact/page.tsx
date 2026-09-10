import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { Reveal } from "@/components/motion/reveal";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public Contact page — honest static surface (public design convergence pass).
 *
 * ── WHAT THIS PAGE IS, AND DELIBERATELY IS NOT ───────────────────────────────────────────────────
 *
 * `/contact/` is the destination of every "Request an offer" CTA in the product, and until now it
 * returned 404 (recorded as the approved deferred destination in the UIF-022 reconciliation). This
 * page makes the route real as a **static communication page**: what a conversation with Hills
 * covers, where each intent leads, and where the business operates.
 *
 * THERE IS NO FORM HERE, AND NO PRETENCE OF ONE. The request-for-quote form, its Zod schema, its
 * Server Action and its abuse safeguards are owned by Feature 002 Phase 6 (T019–T022) and are
 * blocked on **DB-BLOCK-02** (no approved anonymous RFQ destination) and **CRM-DEST-01** (no approved
 * CRM hand-off). A form that could not deliver its submission would be a fake affordance, so this
 * page says plainly that the structured form is the next stage and describes what to prepare. When
 * T020 lands, the form slots into this page beneath the intents; nothing here needs to be undone.
 *
 * NO CONTACT DETAIL IS INVENTED. No email, phone, street address, map or social handle appears —
 * none is approved for this surface — and the boards' sample details are not reproduced (contract
 * §14.1). The only location statement is the two operating offices the business publicly names.
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * A dark photographic opener the header dissolves into; three hairline-divided intent panels on
 * the page ground, each with its real destination where one exists; a gold-ruled notice about the
 * form; and the operating-locations block. Server Component; the only client code is `Reveal`.
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
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
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
                  <span aria-hidden="true" className="h-px w-10 bg-[var(--gold-on-light)] dark:bg-[var(--gold-on-dark)]" />
                  <h3 className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
                    <Bilingual pick={(c) => intent.pick(c).title} />
                  </h3>
                  <p className="max-w-[44ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
                    <Bilingual pick={(c) => intent.pick(c).body} />
                  </p>
                  {intent.href ? (
                    <Link
                      href={intent.href}
                      className="group/link mt-auto inline-flex min-h-11 items-center gap-2 pt-2 text-[length:var(--text-small)] font-semibold underline-offset-4 decoration-[var(--gold-on-light)] decoration-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] dark:decoration-[var(--gold-on-dark)]"
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

      {/* ── THE FORM, HONESTLY ── and where Hills operates. */}
      <section className="bg-secondary py-[clamp(4rem,8vw,8rem)] text-foreground">
        <div className="hc-container grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
          {/*
            DB-BLOCK-02 / CRM-DEST-01: no approved destination exists for an anonymous request, so no
            form is rendered. This panel states that plainly rather than shipping a control that
            cannot deliver. The form arrives with T019–T022.
          */}
          <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--gold-on-light)_45%,transparent)] bg-card p-7 shadow-[var(--shadow-md)] sm:p-9 dark:border-[color-mix(in_srgb,var(--gold-on-dark)_40%,transparent)] dark:shadow-none">
            <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.contact.formNotice.title} />
            </span>
            <p className="max-w-[56ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.contact.formNotice.body} />
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
              <Bilingual pick={(c) => c.contact.detailsHeading} />
            </h2>
            <p className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.footer.locationLine} />
            </p>
            <p className="max-w-[48ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.contact.detailsBody} />
            </p>
          </div>
        </div>
      </section>
    </article>
  );
}
