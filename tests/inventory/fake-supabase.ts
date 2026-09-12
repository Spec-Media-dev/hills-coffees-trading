/**
 * Feature 005 T001–T006 tests — a minimal, chain-agnostic fake Supabase query builder.
 *
 * WHY A FAKE HERE, NOT A LIVE FIXTURE SESSION: `inventory_positions`/`storage_allocations`/
 * `inventory_ownership_events`/`inventory_reservation_items`/`inventory_reservations`/`coffee_lots`
 * are ALL genuinely empty in the live database right now (confirmed directly, service-role,
 * unfiltered count = 0 for every one) — there is no approved way to create realistic rows in them
 * yet, because the only functions that ever write them (`checkout_order`, `admin_review_payment`,
 * warehouse-operator writes) belong to Features 007/008/010, none of which exist yet. A live
 * fixture-session test against real RLS can prove "runs without error, returns an honest empty page"
 * (see `tests/inventory/live-empty.test.ts`) but CANNOT prove "a quantity field equals its source row
 * exactly" or "STORED/RELEASED/DELIVERED render their exact domain value", since there is no row to
 * compare against. This fake lets those specific, load-bearing assertions be made precisely, by
 * controlling exactly what a `.select()` chain "returns" per table — it does not simulate RLS
 * filtering itself (that is proven separately, by direct policy inspection and the live-empty test).
 *
 * Every chain method returns the SAME object, which is also a thenable resolving to
 * `{ data: rows, error: null }` — this matches how this codebase's read-layer functions are already
 * written (destructuring `{ data }`, never awaiting a distinct "terminal" method), and does not care
 * which exact methods were chained before the await, since real bounded reads are already proven at
 * the RLS/policy level, not re-proven here.
 */
export function createFakeSupabaseClient(tableRows: Record<string, readonly unknown[]>) {
  return {
    from(table: string) {
      const rows = tableRows[table] ?? [];
      // RUN B (T015) addition: `{ count: "exact", head: true }` count-only reads
      // (`getInventoryPositionsCount`/`getStoredAllocationsCount`) — tracked per-builder so `then`
      // can resolve the shape real supabase-js returns for a `head: true` read (`data: null`, real
      // `count`), without changing the default row-returning behavior every other RUN A/B test relies
      // on.
      let headCount = false;
      const builder: Record<string, unknown> = {
        select: (_columns?: string, options?: { count?: "exact"; head?: boolean }) => {
          if (options?.head) headCount = true;
          return builder;
        },
        eq: () => builder,
        or: () => builder,
        in: () => builder,
        order: () => builder,
        range: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: readonly unknown[] | null; count?: number; error: null }) => void) =>
          Promise.resolve(headCount ? { data: null, count: rows.length, error: null } : { data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  };
}
