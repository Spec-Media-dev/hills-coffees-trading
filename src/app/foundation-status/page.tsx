import type { Metadata } from "next";

import { getFoundationStatus } from "@/lib/foundation/status";

import { RecomputeButton } from "./recompute-button";

/**
 * Foundation-only cache/revalidation reference proof (FR-014, FR-015; research.md §5).
 *
 * Deliberately unlinked from any product navigation (`grep -rn "foundation-status" src components
 * --include=*.tsx` must match only this route's own files) and deliberately NOT an
 * underscore-prefixed private folder, which Next.js would exclude from routing entirely — this
 * page must stay reachable at `/foundation-status` for the proof to be checkable.
 *
 * Renders no private data and requires no authentication — it reads only the computed,
 * non-business value from `lib/foundation/status.ts`.
 */
export const metadata: Metadata = {
  title: "Foundation status",
  // T028 (Feature 002 Phase 8) — defence in depth alongside robots.ts's Disallow. Metadata-only:
  // no guard predicate or cache/revalidation behaviour on this route changes.
  robots: { index: false, follow: false },
};

export default async function FoundationStatusPage() {
  const status = await getFoundationStatus();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Foundation status
      </h1>
      <p className="text-sm text-muted-foreground">
        Foundation-only reference infrastructure proving the Next.js-native cache/revalidation
        contract (FR-014, FR-015). Not a product page — reads no business or private data.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Computed at</dt>
        <dd className="font-mono text-foreground">{status.computedAt}</dd>
        <dt className="text-muted-foreground">Revision</dt>
        <dd className="font-mono text-foreground">{status.revision}</dd>
      </dl>
      <RecomputeButton />
    </main>
  );
}
