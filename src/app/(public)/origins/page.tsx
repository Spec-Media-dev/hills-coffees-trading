import type { Metadata } from "next";

import { OriginCard } from "@/components/public/origin-card";
import { Section } from "@/components/public/section";
import { copy } from "@/lib/public/copy";
import { getPublicOriginIndex } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public origin index (Feature 002, T016 — FR-002, FR-005, FR-006, SC-001).
 *
 * Served at `/origins/`. Only `ACTIVE` origins can appear: the status gate lives in the read layer's
 * query and in RLS, so an `INACTIVE` or `ARCHIVED` origin cannot reach this listing from here.
 *
 * Data comes from Block A's cached public read layer — a public-shared cache entry that never varies
 * by user, session or organization, and this page never resolves a request identity.
 *
 * `generateMetadata` lives in this same file so metadata and route cannot drift apart.
 *
 * Server Component; no client JavaScript.
 */

const PATH = "/origins/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);

  return {
    title: copy.origins.index.metaTitle,
    description: copy.origins.index.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.origins.index.metaTitle,
      description: copy.origins.index.metaDescription,
    },
  };
}

export default async function OriginsIndexPage() {
  const origins = await getPublicOriginIndex();

  return (
    <Section
      tone="page"
      titleAs="h1"
      eyebrow={copy.origins.index.eyebrow}
      title={copy.origins.index.title}
      lead={copy.origins.index.lead}
    >
      {origins.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {origins.map((origin) => (
            <OriginCard key={origin.slug} origin={origin} />
          ))}
        </ul>
      ) : (
        <p className="max-w-[52ch] text-[0.9375rem] leading-[1.6] text-muted-foreground">
          {copy.origins.index.empty}
        </p>
      )}
    </Section>
  );
}
