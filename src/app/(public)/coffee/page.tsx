import type { Metadata } from "next";

import { Bilingual } from "@/components/locale/bilingual";
import { CatalogueFilter } from "@/components/public/catalogue-filter";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public coffee index (Feature 002 T014; visual completion by Phase 5.5 UIF-027 + UIF-030).
 *
 * Served at `/coffee/` — the `(public)` directory is a route *group*, so it contributes no URL
 * segment. Only `PUBLISHED` coffees can appear: the status gate lives in the read layer's query and
 * in RLS, not in this page, so there is no way to render a draft from here.
 *
 * Data comes from Block A's cached public read layer. Repeat requests inside the TTL are served from
 * the same `unstable_cache` entry rather than re-querying, and that entry is public-shared — it does
 * not vary by user, session or organization, and this page never resolves a request identity.
 *
 * ── STILL EXACTLY ONE INDEXABLE URL ──────────────────────────────────────────────────────────────
 *
 * The route reads no `searchParams`. UIF-030's filtering is entirely client-side state, so it
 * generates no query-string permutations for a crawler to find, and this page stays **statically
 * prerendered** — reading search params here would have made it dynamic and damaged the Feature-001
 * cache architecture.
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * A forest opening band carries the page identity, exactly as the homepage hero does, and the
 * catalogue itself sits on the page ground below it. That gives `/coffee/` the same forest→cream
 * rhythm the homepage established instead of dropping straight into a bare card grid under a
 * heading.
 *
 * `generateMetadata` lives in this same file, as the task requires — metadata and the route it
 * describes stay in one place so they cannot drift.
 *
 * Server Component. The only client JavaScript is the `CatalogueFilter` island, which receives the
 * already-fetched public DTO and nothing else.
 */

const PATH = "/coffee/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);

  return {
    title: copy.coffee.index.metaTitle,
    description: copy.coffee.index.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.coffee.index.metaTitle,
      description: copy.coffee.index.metaDescription,
    },
  };
}

export default async function CoffeeIndexPage() {
  const coffees = await getPublicCoffeeIndex();

  return (
    <>
      {/* Page opening — the forest band that ties every public index to the homepage hero. */}
      <section data-page-opener="dark" className="-mt-[var(--header-h)] bg-sidebar pt-[var(--header-h)] text-sidebar-foreground">
        <div className="hc-container flex flex-col gap-5 py-[clamp(3rem,6vw,5.5rem)]">
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.coffee.index.eyebrow} />
          </span>
          <h1 className="font-heading text-[length:var(--text-h1)] font-semibold leading-[var(--lh-display)] tracking-[var(--tracking-display)] text-balance">
            <Bilingual pick={(c) => c.coffee.index.title} />
          </h1>
          <span aria-hidden="true" className="h-px w-16 bg-[var(--gold-on-dark)]" />
          <p className="hc-body-lg max-w-[58ch] text-sidebar-foreground/85 text-pretty">
            <Bilingual pick={(c) => c.coffee.index.lead} />
          </p>
        </div>
      </section>

      <section className="bg-background py-[clamp(3rem,6vw,6rem)] text-foreground">
        <div className="hc-container">
          {coffees.length > 0 ? (
            <CatalogueFilter coffees={coffees} />
          ) : (
            // Honest empty state: the catalogue is genuinely empty, and saying so beats an invented
            // row. No filter chrome renders over nothing.
            <p className="max-w-[52ch] hc-body text-muted-foreground">
              <Bilingual pick={(c) => c.coffee.index.empty} />
            </p>
          )}
        </div>
      </section>
    </>
  );
}
