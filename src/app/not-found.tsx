import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { PublicShell } from "@/components/public/public-shell";
import { EYEBROW, HEADING_2, LEAD } from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";

/**
 * The global App Router not-found boundary is intentionally presentational only (Phase 5.5,
 * UIF-034). It does not change how route code decides to call `notFound()`, status semantics, or
 * the indistinguishable treatment of unknown and unpublished catalogue records. Public chrome is
 * composed explicitly because a root `not-found.tsx` does not inherit the `(public)` route group.
 */
export default function NotFound() {
  return (
    <PublicShell>
      <section className="bg-secondary py-[clamp(4rem,10vw,9rem)]">
        <div className="hc-container">
          <div className="mx-auto flex max-w-[47.5rem] flex-col items-start gap-6 text-start">
            <span className={`${EYEBROW} text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]`}>
              <Bilingual pick={(c) => c.notFound.eyebrow} />
            </span>
            <h1 className={HEADING_2}>
              <Bilingual pick={(c) => c.notFound.title} />
            </h1>
            <span aria-hidden="true" className="h-px w-16 bg-accent" />
            <p className={`${LEAD} text-muted-foreground text-pretty`}>
              <Bilingual pick={(c) => c.notFound.body} />
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button nativeButton={false} render={<Link href={PUBLIC_ROUTES.home} />}>
                <Bilingual pick={(c) => c.notFound.homeAction} />
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={PUBLIC_ROUTES.coffee} />}>
                <Bilingual pick={(c) => c.notFound.coffeeAction} />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
