import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ListingCard } from "@/components/listings/listing-card";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { appCopy } from "@/lib/app/copy";
import { projectFillState } from "@/lib/listings/fills";
import { getBrowseListings } from "@/lib/listings/browse";

export const metadata: Metadata = {
  title: "Marketplace",
  // Feature 004 T008 precedent: noindex is declared once at `dashboard/layout.tsx`; SEC-004/FR-014
  // still hold for this route (private marketplace listings), inherited automatically — no duplicate
  // `robots` entry needed here.
};

const PAGE_SIZE = 24;
/** Matches `ListingCreateInput`'s own title bound (`lib/listings/validation.ts`) — a search term
 * longer than a title could ever legitimately be is simply truncated, never rejected with an error. */
const MAX_SEARCH_LENGTH = 200;

/**
 * Feature 006 RUN B (T009) — the private marketplace browse page.
 *
 * AUTHORIZATION is NOT re-checked here: T007's reconciliation moved the guard to
 * `src/app/dashboard/coffee/layout.tsx`, which every route under `/dashboard/coffee/*` inherits
 * structurally — this page is reachable ONLY once that layout's identity → membership check has
 * already passed, so it performs no identity check of its own (no duplicated guard logic).
 *
 * Reads exclusively through `lib/listings/browse.ts` (T002) — RLS is the only visibility boundary;
 * this page applies no additional status/visibility filter of its own. The search box passes a
 * bounded, trimmed string straight to `getBrowseListings`'s own parameterized `.ilike()` — never a
 * raw/concatenated query. No shared cache, no service role.
 */
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const titleSearch = (qParam ?? "").trim().slice(0, MAX_SEARCH_LENGTH);

  const { rows, hasMore } = await getBrowseListings({
    page,
    pageSize: PAGE_SIZE,
    titleSearch: titleSearch || undefined,
  });

  const query = (params: Record<string, string>) => {
    const merged = new URLSearchParams({ ...(titleSearch ? { q: titleSearch } : {}), ...params });
    const qs = merged.toString();
    return qs ? `/dashboard/coffee?${qs}` : "/dashboard/coffee";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.marketplace.title} />}
        description={<AppBilingual pick={(c) => c.marketplace.browse.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.marketplace.breadcrumb} /> }]}
      />

      <form method="get" role="search" aria-label={appCopy.marketplace.browse.searchLabel} className="flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={titleSearch}
            placeholder={appCopy.marketplace.browse.searchPlaceholder}
            aria-label={appCopy.marketplace.browse.searchLabel}
            className="ps-10"
            maxLength={MAX_SEARCH_LENGTH}
          />
        </div>
        <Button type="submit" variant="outline">
          <AppBilingual pick={(c) => c.marketplace.browse.searchLabel} />
        </Button>
      </form>

      {rows.length === 0 && page === 0 ? (
        <EmptyState
          title={titleSearch ? appCopy.marketplace.browse.empty.title : appCopy.marketplace.browse.emptyNoSearch.title}
          description={titleSearch ? appCopy.marketplace.browse.empty.description : appCopy.marketplace.browse.emptyNoSearch.description}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={appCopy.marketplace.browse.caption}>
            {rows.map((listing) => (
              <li key={listing.id}>
                <ListingCard
                  listing={listing}
                  projection={projectFillState({
                    quantityKg: listing.quantityKg,
                    reservedQuantityKg: listing.reservedQuantityKg,
                    filledQuantityKg: listing.filledQuantityKg,
                  })}
                />
              </li>
            ))}
          </ul>

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={query({ page: String(page - 1) })} />}>
                  <AppBilingual pick={(c) => c.marketplace.browse.pagination.previous} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.marketplace.browse.pagination.previous} />
                </Button>
              )}
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.marketplace.browse.pagination.pageLabel.replace("{page}", String(page + 1))} />
              </span>
              {hasMore ? (
                <Button variant="outline" render={<Link href={query({ page: String(page + 1) })} />}>
                  <AppBilingual pick={(c) => c.marketplace.browse.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.marketplace.browse.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
