import {
  PriceDifferentialCreateInput,
  PriceDifferentialUpdateInput,
  PriceObservationInput,
  PriceSourceCreateInput,
  PriceSourceUpdateInput,
} from "@/lib/admin/price-validation";
import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { revalidateReferencePrices } from "@/lib/pricing/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackCode, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 T049 — reference-price administration: the ONE console layer that reads and writes
 * `price_sources`, `price_observations` and `price_differentials`, and the ONE caller of Feature 011's
 * `revalidateReferencePrices()` (Feature 011 FR-011 / SC-006 / T013).
 *
 * ── AUTHORITY ────────────────────────────────────────────────────────────────────────────────────
 * Every write re-verifies `is_platform_admin()` live (`checkRoleFunctionAccess`) BEFORE touching the database, then
 * runs under the operator's OWN session, where RLS (`price_sources_admin`, `price_observations_admin`,
 * `price_differentials_admin` — all `is_platform_admin()` USING + WITH CHECK, scoped `TO authenticated`) is the
 * backstop. No service role, no RPC, no policy or grant change. `authenticated` holds no DELETE on these tables, and
 * this module issues none.
 *
 * ── WHAT CAN CHANGE ──────────────────────────────────────────────────────────────────────────────
 *   sources        create; edit name / URL / licence status / delay / activity (code and type are fixed)
 *   observations   append only — a new observation supersedes older ones (latest per source + symbol);
 *                  no stored observation is ever edited or deleted
 *   differentials  create (general / one coffee / one origin); lifecycle only afterwards (active flag,
 *                  effective-until, notes) — amount, currency, unit, type and scope are fixed
 *
 * ── EXACT VALUES ─────────────────────────────────────────────────────────────────────────────────
 * Values travel as the entered decimal TEXT and are read back as `numeric::text`. There is no arithmetic, rounding,
 * unit or currency transformation anywhere here (DB-OPEN-08 — no approved exchange-rate storage).
 *
 * ── CACHE ────────────────────────────────────────────────────────────────────────────────────────
 * `revalidateReferencePrices()` runs exactly once after each SUCCESSFUL write and never after a refused, invalid or
 * failed one. Admin reads here are fresh session-scoped queries — nothing private is cached.
 */

async function requirePriceAdmin(): Promise<{ ok: true; userId: string } | { ok: false; code: ActionFeedbackCode }> {
  const access = await checkRoleFunctionAccess("is_platform_admin");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED : ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE };
  return { ok: true, userId: access.identity.userId };
}

function validationFailure<T>(error: { issues: { path: PropertyKey[]; message: string }[] }): ActionFeedbackResult<T> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: out };
}

type DatabaseError = { code?: unknown } | null | undefined;

/** SQLSTATE-only mapping — never the message. A uniqueness clash is reported on the field that caused it. */
function writeFailure<T>(error: DatabaseError, uniqueField?: { field: string; key: string }): ActionFeedbackResult<T> {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  if (code === "23505" && uniqueField) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { [uniqueField.field]: [uniqueField.key] } };
  if (code === "23503") return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_REFERENCE_INVALID };
  if (code === "23514") return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_STATUS_INVALID };
  return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_SAVE_FAILED };
}

export type PriceWriteOutcome = { id: string; revalidatedTags: readonly string[] };

function saved(id: string): ActionFeedbackResult<PriceWriteOutcome> {
  return { ok: true, data: { id, revalidatedTags: revalidateReferencePrices() }, code: ACTION_FEEDBACK.CATALOGUE_SAVED };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_FAILED = "price_admin_read_failed";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* ═══════════════════════════════════════ reads ═══════════════════════════════════════ */

export type PriceSourceRow = {
  id: string;
  name: string;
  code: string;
  sourceType: string;
  sourceUrl: string | null;
  licenceStatus: string;
  delayType: string;
  delayMinutes: number | null;
  isActive: boolean;
  updatedAt: string;
};

const SOURCE_COLUMNS = "id, name, code, source_type, source_url, licence_status, delay_type, delay_minutes, is_active, updated_at";
type SourceDbRow = { id: string; name: string; code: string; source_type: string; source_url: string | null; licence_status: string; delay_type: string; delay_minutes: number | null; is_active: boolean; updated_at: string };

function toSource(row: SourceDbRow): PriceSourceRow {
  return { id: row.id, name: row.name, code: row.code, sourceType: row.source_type, sourceUrl: row.source_url, licenceStatus: row.licence_status, delayType: row.delay_type, delayMinutes: row.delay_minutes, isActive: row.is_active, updatedAt: row.updated_at };
}

export async function listPriceSources(): Promise<readonly PriceSourceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_sources").select(SOURCE_COLUMNS).order("name").limit(500);
  if (error) throw new Error(READ_FAILED);
  return ((data ?? []) as SourceDbRow[]).map(toSource);
}

export async function getPriceSource(sourceId: string): Promise<PriceSourceRow | null> {
  if (!UUID.test(sourceId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_sources").select(SOURCE_COLUMNS).eq("id", sourceId).maybeSingle();
  if (error) throw new Error(READ_FAILED);
  return data ? toSource(data as SourceDbRow) : null;
}

export type PriceObservationRow = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  sourceCode: string | null;
  symbol: string;
  commodityType: string;
  /** Exact stored decimal text (`raw_value::text`). */
  rawValue: string;
  rawCurrency: string;
  rawUnit: string;
  observedAt: string;
  receivedAt: string;
  isStale: boolean;
};

const OBSERVATION_LIMIT = 100;

/** Newest observations first — across every source, or for one source. `metadata` is never selected. */
export async function listPriceObservations({ sourceId }: { sourceId?: string } = {}): Promise<readonly PriceObservationRow[]> {
  if (sourceId !== undefined && !UUID.test(sourceId)) return [];
  const supabase = await createClient();
  let query = supabase
    .from("price_observations")
    .select("id, price_source_id, symbol, commodity_type, raw_value::text, raw_currency, raw_unit, observed_at, received_at, is_stale, price_sources(name, code)")
    .order("observed_at", { ascending: false })
    .order("received_at", { ascending: false })
    .limit(OBSERVATION_LIMIT);
  if (sourceId) query = query.eq("price_source_id", sourceId);
  const { data, error } = await query;
  if (error) throw new Error(READ_FAILED);
  type Row = { id: string; price_source_id: string; symbol: string; commodity_type: string; raw_value: string | number; raw_currency: string; raw_unit: string; observed_at: string; received_at: string; is_stale: boolean; price_sources: { name: string; code: string } | { name: string; code: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const source = one(row.price_sources);
    return {
      id: row.id,
      sourceId: row.price_source_id,
      sourceName: source?.name ?? null,
      sourceCode: source?.code ?? null,
      symbol: row.symbol,
      commodityType: row.commodity_type,
      rawValue: typeof row.raw_value === "number" ? String(row.raw_value) : row.raw_value,
      rawCurrency: row.raw_currency.trim(),
      rawUnit: row.raw_unit,
      observedAt: row.observed_at,
      receivedAt: row.received_at,
      isStale: row.is_stale === true,
    };
  });
}

export type PriceDifferentialRow = {
  id: string;
  differentialType: string;
  /** Exact stored decimal text (`amount::text`). */
  amount: string;
  currency: string;
  unit: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
  notes: string | null;
  coffeeId: string | null;
  coffeeName: string | null;
  originId: string | null;
  originName: string | null;
  lotId: string | null;
  updatedAt: string;
};

const DIFFERENTIAL_COLUMNS = "id, differential_type, amount::text, currency, unit, effective_from, effective_until, is_active, notes, coffee_id, origin_id, lot_id, updated_at, coffees(name), origins(name)";

function toDifferential(row: Record<string, unknown>): PriceDifferentialRow {
  const coffee = one(row.coffees as { name: string } | { name: string }[] | null);
  const origin = one(row.origins as { name: string } | { name: string }[] | null);
  return {
    id: row.id as string,
    differentialType: row.differential_type as string,
    amount: typeof row.amount === "number" ? String(row.amount) : (row.amount as string),
    currency: (row.currency as string).trim(),
    unit: row.unit as string,
    effectiveFrom: row.effective_from as string,
    effectiveUntil: (row.effective_until as string | null) ?? null,
    isActive: row.is_active === true,
    notes: (row.notes as string | null) ?? null,
    coffeeId: (row.coffee_id as string | null) ?? null,
    coffeeName: coffee?.name ?? null,
    originId: (row.origin_id as string | null) ?? null,
    originName: origin?.name ?? null,
    lotId: (row.lot_id as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

export async function listPriceDifferentials(): Promise<readonly PriceDifferentialRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_differentials").select(DIFFERENTIAL_COLUMNS).order("effective_from", { ascending: false }).limit(500);
  if (error) throw new Error(READ_FAILED);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toDifferential);
}

export async function getPriceDifferential(differentialId: string): Promise<PriceDifferentialRow | null> {
  if (!UUID.test(differentialId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_differentials").select(DIFFERENTIAL_COLUMNS).eq("id", differentialId).maybeSingle();
  if (error) throw new Error(READ_FAILED);
  return data ? toDifferential(data as unknown as Record<string, unknown>) : null;
}

export type PriceScopeOptions = { coffees: readonly { id: string; name: string }[]; origins: readonly { id: string; name: string }[] };

/** Coffees and origins a differential may be scoped to (catalogue tables, platform-admin readable). */
export async function getPriceScopeOptions(): Promise<PriceScopeOptions> {
  const supabase = await createClient();
  const [coffees, origins] = await Promise.all([supabase.from("coffees").select("id, name").order("name").limit(500), supabase.from("origins").select("id, name").order("name").limit(500)]);
  if (coffees.error || origins.error) throw new Error(READ_FAILED);
  return { coffees: coffees.data ?? [], origins: origins.data ?? [] };
}

/* ═══════════════════════════════════════ writes ═══════════════════════════════════════ */

export async function createPriceSource(input: unknown): Promise<ActionFeedbackResult<PriceWriteOutcome>> {
  const parsed = PriceSourceCreateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requirePriceAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("price_sources")
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      source_type: parsed.data.sourceType,
      source_url: parsed.data.sourceUrl,
      licence_status: parsed.data.licenceStatus,
      delay_type: parsed.data.delayType,
      delay_minutes: parsed.data.delayMinutes,
      is_active: parsed.data.isActive,
      created_by: access.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return writeFailure(error, { field: "code", key: "CODE_TAKEN" });
  return saved(data.id);
}

export async function updatePriceSource(input: unknown): Promise<ActionFeedbackResult<PriceWriteOutcome>> {
  const parsed = PriceSourceUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requirePriceAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  // `code`, `source_type`, `created_by`, `created_at`, `updated_at` are deliberately NOT in this update.
  const { data, error } = await supabase
    .from("price_sources")
    .update({
      name: parsed.data.name,
      source_url: parsed.data.sourceUrl,
      licence_status: parsed.data.licenceStatus,
      delay_type: parsed.data.delayType,
      delay_minutes: parsed.data.delayMinutes,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.sourceId)
    .select("id")
    .maybeSingle();
  if (error) return writeFailure(error);
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return saved(data.id);
}

/** Append-only: a new observation row. `received_at` is the database's own `now()`; `metadata` keeps its default. */
export async function recordPriceObservation(input: unknown): Promise<ActionFeedbackResult<PriceWriteOutcome>> {
  const parsed = PriceObservationInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requirePriceAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase.from("price_sources").select("id").eq("id", parsed.data.sourceId).maybeSingle();
  if (sourceError) return writeFailure(sourceError);
  if (!source) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  const { data, error } = await supabase
    .from("price_observations")
    .insert({
      price_source_id: parsed.data.sourceId,
      symbol: parsed.data.symbol,
      commodity_type: parsed.data.commodityType,
      raw_value: parsed.data.rawValue,
      raw_currency: parsed.data.rawCurrency,
      raw_unit: parsed.data.rawUnit,
      observed_at: parsed.data.observedAt,
      is_stale: parsed.data.isStale,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return writeFailure(error, { field: "observedAt", key: "OBSERVATION_DUPLICATE" });
  return saved(data.id);
}

export async function createPriceDifferential(input: unknown): Promise<ActionFeedbackResult<PriceWriteOutcome>> {
  const parsed = PriceDifferentialCreateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requirePriceAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("price_differentials")
    .insert({
      differential_type: parsed.data.differentialType,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      unit: parsed.data.unit,
      effective_from: parsed.data.effectiveFrom,
      effective_until: parsed.data.effectiveUntil,
      coffee_id: parsed.data.coffeeId,
      origin_id: parsed.data.originId,
      notes: parsed.data.notes,
      is_active: parsed.data.isActive,
      created_by: access.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return writeFailure(error);
  return saved(data.id);
}

export async function updatePriceDifferential(input: unknown): Promise<ActionFeedbackResult<PriceWriteOutcome>> {
  const parsed = PriceDifferentialUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const access = await requirePriceAdmin();
  if (!access.ok) return { ok: false, code: access.code };
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase.from("price_differentials").select("id, effective_from").eq("id", parsed.data.differentialId).maybeSingle();
  if (readError) return writeFailure(readError);
  if (!before) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  if (parsed.data.effectiveUntil && Date.parse(parsed.data.effectiveUntil) <= Date.parse(before.effective_from)) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { effectiveUntil: ["EFFECTIVE_UNTIL_BEFORE_FROM"] } };
  }
  // Lifecycle columns only — amount / currency / unit / type / scope / created_by are deliberately NOT in this update.
  const { data, error } = await supabase
    .from("price_differentials")
    .update({ effective_until: parsed.data.effectiveUntil, notes: parsed.data.notes, is_active: parsed.data.isActive })
    .eq("id", parsed.data.differentialId)
    .select("id")
    .maybeSingle();
  if (error) return writeFailure(error);
  if (!data) return { ok: false, code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND };
  return saved(data.id);
}
