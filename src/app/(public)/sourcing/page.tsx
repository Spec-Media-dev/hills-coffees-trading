import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  CONTAINER,
  CTA_ON_FOREST,
  EYEBROW,
  HEADING_2,
  HEADING_3,
  LEAD,
} from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public sourcing page (Feature 002, T017 — FR-002, FR-003, FR-021; PS2).
 *
 * CONTENT-DRIVEN, NOT DATA-DRIVEN. Every claim on this page comes from 002-owned reviewed copy in
 * T000's dictionary — it is never derived from a database row. In particular this page never queries
 * the private storage-location table denylisted in `contracts/public-dto-allowlist.md` §3 (it carries
 * owner-organization identity and an exact address — private commercial data forbidden on a public
 * surface, SEO-APP-02). Custody and logistics below are reviewed positioning copy, not facts read
 * from a specific storage-facility row — the wording is deliberately consistent with the homepage
 * credibility section rather than asserting anything new or unevidenced.
 *
 * The two photographs are repository-owned static assets under `public/images/` — editorial context
 * for the page, not evidence of a specific fact about a specific facility. They are unrelated to
 * MEDIA-01 (which blocks database-backed coffee/entity media) and unrelated to any catalogue record,
 * so `MediaPlaceholder` does not apply here.
 *
 * `generateMetadata` in this file, matching the FR-006 pattern established for every other owned
 * public route: title, description and a trailing-slash canonical.
 *
 * ARTICLE MEASURE: the four themed sections render as flowing prose in a single column capped at
 * `max-w-[62ch]`, not a card grid — this page is this surface's entire depth on the subject, so it
 * reads as an article rather than a teaser.
 *
 * Server Component; no client JavaScript.
 */

const PATH = "/sourcing/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);

  return {
    title: copy.sourcing.metaTitle,
    description: copy.sourcing.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.sourcing.metaTitle,
      description: copy.sourcing.metaDescription,
    },
  };
}

export default function SourcingPage() {
  return (
    <article>
      {/* Intro — an asymmetric editorial opener, mirroring the homepage hero's composition at a
          quieter, page-tone scale rather than repeating the dark hero treatment. */}
      <div
        className={`${CONTAINER} grid gap-10 py-[clamp(3rem,7vw,6rem)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] lg:items-center lg:gap-16`}
      >
        <div className="flex flex-col gap-5">
          <span className={`${EYEBROW} text-accent`}>
            {copy.sourcing.eyebrow}
          </span>
          <h1 className={HEADING_2}>{copy.sourcing.title}</h1>
          <span aria-hidden="true" className="h-px w-16 bg-accent" />
          <p className={`${LEAD} text-muted-foreground text-pretty`}>
            {copy.sourcing.lead}
          </p>
        </div>

        <div
          className="overflow-hidden rounded-xl"
          style={{ aspectRatio: "4 / 5" }}
        >
          <Image
            src="/images/coffee-cherry.jpg"
            alt={copy.sourcing.images.harvestAlt}
            width={1344}
            height={752}
            sizes="(min-width: 1024px) 38vw, 90vw"
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Article body — one narrow reading column, not a card grid (the article-measure requirement). */}
      <div className="bg-secondary">
        <div className={`${CONTAINER} py-[clamp(3rem,7vw,6rem)]`}>
          <div className="mx-auto flex max-w-[62ch] flex-col gap-14">
            <section className="flex flex-col gap-3">
              <h2 className={HEADING_3}>
                {copy.sourcing.relationships.title}
              </h2>
              <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground text-pretty">
                {copy.sourcing.relationships.body}
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className={HEADING_3}>{copy.sourcing.custody.title}</h2>
              <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground text-pretty">
                {copy.sourcing.custody.body}
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className={HEADING_3}>{copy.sourcing.logistics.title}</h2>
              <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground text-pretty">
                {copy.sourcing.logistics.body}
              </p>
            </section>

            <section className="flex flex-col gap-5">
              <h2 className={HEADING_3}>{copy.sourcing.quality.title}</h2>
              <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground text-pretty">
                {copy.sourcing.quality.body}
              </p>
              <div
                className="overflow-hidden rounded-xl"
                style={{ aspectRatio: "3 / 2" }}
              >
                <Image
                  src="/images/cupping-lab.jpg"
                  alt={copy.sourcing.images.qualityAlt}
                  width={1600}
                  height={893}
                  sizes="(min-width: 768px) 640px, 90vw"
                  className="h-full w-full object-cover"
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Closing commercial CTA — the same pattern established on the homepage and coffee detail. */}
      <div className="bg-sidebar text-sidebar-foreground">
        <div
          className={`${CONTAINER} flex flex-col gap-8 py-[clamp(3rem,6vw,5rem)] lg:flex-row lg:items-center lg:justify-between`}
        >
          <div className="flex max-w-[46rem] flex-col gap-3">
            <h2 className={HEADING_3}>{copy.sourcing.cta.title}</h2>
            <p className={`${LEAD} text-sidebar-foreground/85 text-pretty`}>
              {copy.sourcing.cta.lead}
            </p>
          </div>
          <Link
            href={PUBLIC_ROUTES.contact}
            className={`${CTA_ON_FOREST} shrink-0`}
          >
            {copy.cta.requestAnOffer}
          </Link>
        </div>
      </div>
    </article>
  );
}
