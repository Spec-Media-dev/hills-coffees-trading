import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Bilingual, type CopySelector } from "@/components/locale/bilingual";
import { ACCOUNT_ROUTES, PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Trading Portal gateway (Feature 002 T018 — FR-016; rewritten in the final non-payment closure run).
 *
 * WHY THIS CHANGED. This route used to state that membership and sign-in were "not open here yet",
 * because Feature 003 (accounts, onboarding, KYB) did not exist. It does now: `/sign-up/` creates an
 * account, email confirmation and organization onboarding/KYB follow, and a Hills reviewer approves the
 * organization manually. Keeping the old copy would have made every "Trade with Hills" / "Apply for
 * membership" link a dead end, so the page is now the TRUTHFUL gateway into that flow.
 *
 * STILL A PUBLIC, STATIC, IDENTITY-FREE PAGE:
 *   - no form field of any kind — account creation happens on `/sign-up/`, sign-in on `/sign-in/`;
 *   - no call into the request-identity resolver, no Supabase client, no session read anywhere;
 *   - no member, organization or trading data — none is queried, so none can leak;
 *   - no invented `next=`/return-URL parameter (the sign-up and sign-in routes do not support one).
 * The four steps restate the approved membership rules (manual KYB approval; registration alone never
 * authorizes trading). The commercial contact route stays available as the tertiary path.
 *
 * Server Component; no client JavaScript.
 */

const PATH = "/portal-entry/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);
  return {
    title: copy.portalEntry.metaTitle,
    description: copy.portalEntry.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.portalEntry.metaTitle,
      description: copy.portalEntry.metaDescription,
    },
  };
}

const STEPS: readonly { key: string; icon: "users" | "file-text" | "shield" | "package"; title: CopySelector; body: CopySelector }[] = [
  { key: "account", icon: "users", title: (c) => c.portalEntry.steps.account.title, body: (c) => c.portalEntry.steps.account.body },
  { key: "organization", icon: "file-text", title: (c) => c.portalEntry.steps.organization.title, body: (c) => c.portalEntry.steps.organization.body },
  { key: "review", icon: "shield", title: (c) => c.portalEntry.steps.review.title, body: (c) => c.portalEntry.steps.review.body },
  { key: "trade", icon: "package", title: (c) => c.portalEntry.steps.trade.title, body: (c) => c.portalEntry.steps.trade.body },
];

export default function PortalEntryPage() {
  return (
    <article className="bg-background" data-portal-gateway>
      <div className="hc-container grid gap-12 py-[clamp(3.5rem,8vw,7rem)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-16">
        <div className="relative hidden min-h-[34rem] overflow-hidden rounded-b-2xl rounded-t-[8rem] border border-border bg-muted lg:block">
          <Image src="/images/coffee-lot-1.jpg" alt={copy.portalEntry.imageAlt} fill sizes="(min-width: 1024px) 38vw, 90vw" className="object-cover" />
        </div>

        <div className="flex min-w-0 flex-col items-start gap-6">
          <span className="hc-eyebrow font-semibold tracking-wider text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.portalEntry.eyebrow} />
          </span>
          <h1 className="font-heading text-[clamp(2.25rem,1.7rem+2.6vw,4rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance rtl:leading-[1.2] rtl:tracking-normal">
            <Bilingual pick={(c) => c.portalEntry.title} />
          </h1>
          <span aria-hidden="true" className="h-0.5 w-16 bg-[var(--hc-accent)]" />
          <p className="max-w-[56ch] text-[clamp(1rem,0.95rem+0.25vw,1.15rem)] leading-[1.7] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.portalEntry.lead} />
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center" data-portal-actions>
            <Link href={ACCOUNT_ROUTES.signUp} className="hc-btn-accent justify-center">
              <Bilingual pick={(c) => c.portalEntry.createAccount} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
            <span className="flex items-center gap-2 text-[length:var(--text-small)] text-muted-foreground">
              <Bilingual pick={(c) => c.portalEntry.memberPrompt} />
              <Link href={ACCOUNT_ROUTES.signIn} className="font-semibold text-foreground underline decoration-[var(--hc-accent)] underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                <Bilingual pick={(c) => c.portalEntry.signIn} />
              </Link>
            </span>
          </div>

          <div className="mt-2 flex w-full flex-col gap-4">
            <h2 className="font-sans text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.14em] text-muted-foreground rtl:tracking-normal">
              <Bilingual pick={(c) => c.portalEntry.stepsHeading} />
            </h2>
            <ol className="grid gap-3 sm:grid-cols-2" data-portal-steps>
              {STEPS.map((step, index) => (
                <li key={step.key} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-5">
                  <span className="flex items-center justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-secondary text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                      <Icon name={step.icon} className="size-4" aria-hidden="true" />
                    </span>
                    <span aria-hidden="true" dir="ltr" className="font-mono text-[length:var(--text-micro)] font-semibold text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                      0{index + 1}
                    </span>
                  </span>
                  <h3 className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                    <Bilingual pick={step.title} />
                  </h3>
                  <p className="text-[length:var(--text-small)] leading-[1.65] text-muted-foreground text-pretty">
                    <Bilingual pick={step.body} />
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <p className="flex flex-wrap items-center gap-2 border-t border-border pt-5 text-[length:var(--text-small)] text-muted-foreground">
            <Bilingual pick={(c) => c.portalEntry.contactPrompt} />
            <Link href={PUBLIC_ROUTES.contact} className="font-semibold text-foreground underline decoration-[var(--hc-accent)] underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              <Bilingual pick={(c) => c.portalEntry.contactAction} />
            </Link>
          </p>
        </div>
      </div>
    </article>
  );
}
