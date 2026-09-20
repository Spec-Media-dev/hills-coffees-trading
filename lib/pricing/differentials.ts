import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { newCacheStamp, type Stamped } from "@/lib/public/cache";
import { createPublicReadClient } from "@/lib/public/supabase";

import { REFERENCE_PRICES_REVALIDATE_SECONDS, TAG_REFERENCE_PRICES } from "./cache";
import { DIFFERENTIAL_TYPES, type DifferentialType } from "./types";

/**
 * Feature 011 specialty price-basis reads (T005 — FR-010, PS5).
 *
 * A DIFFERENTIAL IS A COMPONENT OF A BASIS EXPLANATION, NOT A PRICE. Each item carries type, amount, currency, unit
 * and effective period (FR-010) — exactly those, exactly as stored:
 *
 *   - `amount` is read as text (`amount::text`) so the stored decimal is shown digit-for-digit;
 *   - currency and unit are carried verbatim — a differential in USD/KG next to a benchmark in cents/lb is shown as
 *     two separate recorded facts and is NEVER summed, netted or compared as equivalent (DB-OPEN-08: no approved
 *     exchange-rate storage, so no auditable arithmetic between them exists).
 *
 * WHAT REACHES A PUBLIC SURFACE. RLS lets an anonymous caller read every `is_active` differential; this layer
 * narrows further, and on purpose:
 *
 *   - `is_active = true` and inside its effective period (`effective_from <= now`, `effective_until` null or in the
 *     future). Expired or not-yet-effective differentials are excluded (spec edge case).
 *   - `lot_id IS NULL` — a lot-scoped differential concerns a private lot identity that must never be published
 *     through a public read path (Constitution VII). Recorded assumption.
 *   - Scope is explicit: `general` (no coffee, origin or lot), or one PUBLISHED `coffee` / ACTIVE `origin` by slug.
 *     A differential recorded for one coffee is never shown as if it applied to the platform in general.
 *   - `notes` (free text) and every internal id/audit column are never selected.
 *
 * The period is checked twice — in the query and again on the rows — and the presentation contract re-checks it at
 * render time, because a cached entry can outlive a differential's `effective_until` (FR-008: the cache stores
 * facts, the verdict is re-derived).
 */

export type DifferentialScope = { readonly kind: "general" } | { readonly kind: "coffee"; readonly slug: string } | { readonly kind: "origin"; readonly slug: string };

export type DifferentialRecord = {
  readonly type: DifferentialType;
  /** Exact decimal text of `amount`. */
  readonly amount: string;
  readonly currency: string;
  readonly unit: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
};

type DifferentialRow = {
  differential_type: string;
  amount: string | number;
  currency: string;
  unit: string;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  lot_id: string | null;
};

const BASE_COLUMNS = "differential_type, amount::text, currency, unit, effective_from, effective_until, is_active, lot_id";
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const DIFFERENTIAL_FETCH_LIMIT = 200;

const timeOf = (iso: string | null): number => (iso === null ? Number.NaN : Date.parse(iso));

/** True when `now` falls inside the differential's effective period. */
export function isInEffectivePeriod(record: { effectiveFrom: string; effectiveUntil: string | null }, now: Date): boolean {
  const from = timeOf(record.effectiveFrom);
  if (Number.isNaN(from) || from > now.getTime()) return false;
  if (record.effectiveUntil === null) return true;
  const until = timeOf(record.effectiveUntil);
  return !Number.isNaN(until) && until > now.getTime();
}

function toRecord(row: DifferentialRow): DifferentialRecord {
  return {
    type: row.differential_type as DifferentialType,
    amount: typeof row.amount === "number" ? String(row.amount) : row.amount,
    currency: row.currency.trim(),
    unit: row.unit.trim(),
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
  };
}

const isKnownType = (value: string): boolean => (DIFFERENTIAL_TYPES as readonly string[]).includes(value);

/** Active, in-period, non-lot-scoped differentials for the given scope. Throws on a database error. */
export async function fetchActiveDifferentials(client: SupabaseClient, scope: DifferentialScope, now: Date): Promise<DifferentialRecord[]> {
  if (scope.kind !== "general" && !SLUG.test(scope.slug)) return [];
  const nowIso = now.toISOString();

  let query =
    scope.kind === "coffee"
      ? client.from("price_differentials").select(`${BASE_COLUMNS}, coffees!inner ( slug )`).eq("coffees.slug", scope.slug)
      : scope.kind === "origin"
        ? client.from("price_differentials").select(`${BASE_COLUMNS}, origins!inner ( slug )`).eq("origins.slug", scope.slug)
        : client.from("price_differentials").select(BASE_COLUMNS).is("coffee_id", null).is("origin_id", null);

  query = query
    .eq("is_active", true)
    .is("lot_id", null)
    .lte("effective_from", nowIso)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order("differential_type", { ascending: true })
    .order("effective_from", { ascending: false })
    .limit(DIFFERENTIAL_FETCH_LIMIT);

  const { data, error } = await query;
  if (error) throw new Error("Reference price differential read failed.");

  return ((data ?? []) as unknown as DifferentialRow[])
    .filter((row) => row.is_active === true && row.lot_id === null && isKnownType(row.differential_type))
    .map(toRecord)
    .filter((record) => isInEffectivePeriod(record, now));
}

function cachedDifferentials(scope: DifferentialScope) {
  const scopeKey = scope.kind === "general" ? "general" : `${scope.kind}:${scope.slug}`;
  return unstable_cache(
    async (): Promise<Stamped<DifferentialRecord[]>> => ({ stamp: newCacheStamp(), value: await fetchActiveDifferentials(createPublicReadClient(), scope, new Date()) }),
    ["reference-price-differentials", scopeKey],
    { tags: [TAG_REFERENCE_PRICES], revalidate: REFERENCE_PRICES_REVALIDATE_SECONDS }
  );
}

/** Active differentials for a scope, or `null` when the read failed (the basis is then omitted — never guessed). */
export async function getActiveDifferentials(scope: DifferentialScope = { kind: "general" }): Promise<DifferentialRecord[] | null> {
  try {
    return (await cachedDifferentials(scope)()).value;
  } catch {
    return null;
  }
}
