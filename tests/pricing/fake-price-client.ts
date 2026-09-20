import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Feature 011 test double — an in-memory PostgREST-shaped client that APPLIES the filters the code under test puts
 * on the query (`eq`, `in`, `is`, `lte`, `gt`, `or`) and records every call.
 *
 * WHY IT APPLIES FILTERS (unlike `tests/inventory/fake-supabase.ts`): the licence gate is a data-layer property. A
 * fake that ignores `.eq("licence_status", "APPROVED")` could not tell a layer that gates from one that forgot to. By
 * default the fake exposes EVERY row (as a privileged / administrator session would see them — the case where RLS does
 * not protect), so a leak can only be prevented by the layer's own query and mapper. `rls` lets a test additionally
 * model the anonymous policies (`price_sources_public_read` etc.).
 *
 * It does not model column projection: rows are returned whole (including columns the layer must not publish, such as
 * `metadata`), so a mapper that spread a raw row would visibly leak — and `calls[].columns` records the exact select
 * string so allowlist tests can assert on it.
 */

export type FakeRow = Record<string, unknown>;

export type FakeCall = { table: string; columns: string | null; filters: string[]; order: string[]; limit: number | null };

type Rls = Partial<Record<string, (row: FakeRow, all: Record<string, readonly FakeRow[]>) => boolean>>;

function orMatches(expression: string, row: FakeRow): boolean {
  // Supports the exact forms this feature emits: "col.is.null,col.gt.<iso>".
  return expression.split(",").some((clause) => {
    const [column, op, ...rest] = clause.split(".");
    const value = rest.join(".");
    const cell = row[column];
    if (op === "is" && value === "null") return cell === null || cell === undefined;
    if (op === "gt") return cell !== null && cell !== undefined && Date.parse(String(cell)) > Date.parse(value);
    return false;
  });
}

function read(row: FakeRow, column: string): unknown {
  if (!column.includes(".")) return row[column];
  const [head, tail] = column.split(".");
  const nested = row[head] as FakeRow | undefined;
  return nested ? nested[tail] : undefined;
}

export function createFakePriceClient(tables: Record<string, readonly FakeRow[]>, options: { rls?: Rls; failTable?: string } = {}) {
  const calls: FakeCall[] = [];

  const client = {
    from(table: string) {
      const call: FakeCall = { table, columns: null, filters: [], order: [], limit: null };
      calls.push(call);
      const predicates: Array<(row: FakeRow) => boolean> = [];
      let single = false;

      const builder: Record<string, unknown> = {
        select: (columns?: string) => {
          call.columns = columns ?? null;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push(`eq:${column}=${String(value)}`);
          predicates.push((row) => read(row, column) === value);
          return builder;
        },
        in: (column: string, values: readonly unknown[]) => {
          call.filters.push(`in:${column}=[${values.map(String).join(",")}]`);
          predicates.push((row) => values.includes(read(row, column)));
          return builder;
        },
        is: (column: string, value: null) => {
          call.filters.push(`is:${column}=${String(value)}`);
          predicates.push((row) => (value === null ? read(row, column) === null || read(row, column) === undefined : read(row, column) === value));
          return builder;
        },
        lte: (column: string, value: string) => {
          call.filters.push(`lte:${column}=${value}`);
          predicates.push((row) => Date.parse(String(read(row, column))) <= Date.parse(value));
          return builder;
        },
        or: (expression: string) => {
          call.filters.push(`or:${expression}`);
          predicates.push((row) => orMatches(expression, row));
          return builder;
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          call.order.push(`${column}:${opts?.ascending === false ? "desc" : "asc"}`);
          return builder;
        },
        limit: (n: number) => {
          call.limit = n;
          return builder;
        },
        maybeSingle: () => {
          single = true;
          return builder;
        },
        then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) => {
          if (options.failTable === table) return Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } }).then(resolve, reject);
          const all = tables;
          const visible = (tables[table] ?? []).filter((row) => (options.rls?.[table] ? options.rls[table]!(row, all) : true));
          const rows = visible.filter((row) => predicates.every((p) => p(row)));
          return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

/** The anonymous policies, modelled: `price_sources_public_read`, `price_observations_public_read`, `price_differentials_public_read`. */
export const ANON_RLS: Rls = {
  price_sources: (row) => row.is_active === true && row.licence_status === "APPROVED",
  price_observations: (row, all) => (all.price_sources ?? []).some((s) => s.id === row.price_source_id && s.is_active === true && s.licence_status === "APPROVED"),
  price_differentials: (row) => row.is_active === true,
};

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────

export const SOURCE_IDS = {
  approved: "11111111-0000-4000-8000-000000000001",
  pending: "11111111-0000-4000-8000-000000000002",
  restricted: "11111111-0000-4000-8000-000000000003",
  disabled: "11111111-0000-4000-8000-000000000004",
  inactive: "11111111-0000-4000-8000-000000000005",
} as const;

export function source(id: string, over: FakeRow = {}): FakeRow {
  return { id, name: `Source ${id.slice(-1)}`, code: `SRC${id.slice(-1)}`, source_type: "ICE_ARABICA", source_url: null, licence_status: "APPROVED", delay_type: "DELAYED", delay_minutes: null, is_active: true, created_by: "should-never-leak", ...over };
}

export function observation(sourceId: string, over: FakeRow = {}): FakeRow {
  return { id: `obs-${sourceId.slice(-1)}-${String(over.symbol ?? "KC")}-${String(over.observed_at ?? "t")}`, price_source_id: sourceId, symbol: "KC", commodity_type: "ARABICA", raw_value: "250.125", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-01T12:00:00+00:00", received_at: "2026-09-01T12:05:00+00:00", is_stale: false, metadata: { internal: "should-never-leak" }, ...over };
}

export const ALL_LICENCE_SOURCES: FakeRow[] = [
  source(SOURCE_IDS.approved),
  source(SOURCE_IDS.pending, { licence_status: "PENDING" }),
  source(SOURCE_IDS.restricted, { licence_status: "RESTRICTED" }),
  source(SOURCE_IDS.disabled, { licence_status: "DISABLED" }),
  source(SOURCE_IDS.inactive, { is_active: false }),
];
