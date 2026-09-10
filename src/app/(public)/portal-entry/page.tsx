import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import {
  EYEBROW,
  HEADING_2,
  LEAD,
} from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Trading Portal entry placeholder (Feature 002, T018 — FR-016; PS4).
 *
 * HONEST BY DESIGN. Feature 003 owns the real membership/sign-in destination, and it does not exist
 * yet. This page states plainly that membership and sign-in are not open here, names Feature 003 as
 * the future owner, and offers the one thing this feature can actually provide today: a working
 * commercial contact route. It contains:
 *
 *   - no form field of any kind — nothing for a visitor to submit;
 *   - no call into the request-identity resolver, no Supabase client, no session read anywhere;
 *   - no redirect to `/` or anywhere else — this route IS the honest destination;
 *   - no member, organization or trading data — none is queried, so none can leak.
 *
 * Both the header's "Trading Portal" entry and the homepage's "Trade with Hills" intent card resolve
 * here. When Feature 003 exists, only those link *targets* change — this page's honesty requirement
 * means it must never pretend that capability exists before it does (PS4 AS2–AS3).
 *
 * `generateMetadata` follows the same FR-006 pattern as every other owned public route.
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

export default function PortalEntryPage() {
  return (
    <article className="bg-background">
      <div
        className={`hc-container grid gap-12 py-[clamp(3.5rem,8vw,7.5rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20`}
      >
        <div className="relative min-h-[25rem] overflow-hidden rounded-b-2xl rounded-t-[8rem] border border-border bg-muted sm:min-h-[34rem]">
          <Image
            src="/images/coffee-lot-1.jpg"
            alt={copy.portalEntry.imageAlt}
            fill
            sizes="(min-width: 1024px) 42vw, 90vw"
            className="object-cover"
          />
        </div>

        <div className="flex max-w-[46rem] flex-col items-start gap-5 text-start">
        <span className={`${EYEBROW} text-accent`}>
          <Bilingual pick={(c) => c.portalEntry.eyebrow} />
        </span>
        <h1 className={HEADING_2}><Bilingual pick={(c) => c.portalEntry.title} /></h1>
        <span aria-hidden="true" className="h-px w-16 bg-accent" />
        <p className={`${LEAD} text-muted-foreground text-pretty`}>
          <Bilingual pick={(c) => c.portalEntry.lead} />
        </p>
        <p className="max-w-[58ch] text-[0.9375rem] leading-[1.6] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.portalEntry.body} />
        </p>
        <Button className="mt-2" nativeButton={false} render={<Link href={PUBLIC_ROUTES.contact} />}>
          <Bilingual pick={(c) => c.portalEntry.action} />
        </Button>
        </div>
      </div>
    </article>
  );
}
