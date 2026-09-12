import { createClient } from "@/lib/supabase/server";
import type { OwnershipCounterparty, OwnershipEvent, PaginatedResult } from "@/lib/inventory/types";

/**
 * Feature 005 T004 — SERVER-ONLY, read-only, chronologically-ordered projection of
 * `inventory_ownership_events` for the acting organization, as EITHER `from_organization_id` or
 * `to_organization_id` (RLS `ownership_admin`: `is_platform_admin() OR is_org_member(to_organization_id)
 * OR is_org_member(from_organization_id)` — confirmed against the live schema report). No mutation
 * helper exists anywhere in this file (LOT-03) — the append-only guarantee is the database's own
 * `prevent_ownership_event_mutation` trigger; this module could not offer an edit/delete/reorder
 * affordance even if asked to, because it exports nothing that writes.
 *
 * COUNTERPARTY REDACTION (SEC — see `lib/inventory/types.ts#OwnershipCounterparty`): `organizations`'
 * own RLS (`organizations_member_select`) only ever lets a member read their OWN organization's row.
 * A genuine counterparty's `display_name` is therefore unreadable by direct query — this function
 * attempts it anyway (the same "attempt the read, let RLS filter, degrade honestly" pattern
 * `lib/inventory/positions.ts` uses for DB-OPEN-05) and marks `redacted: true` when the name did not
 * come back. The EVENT is never dropped for this reason — only the counterparty's name is withheld.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function getOwnershipEvents({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResult<OwnershipEvent>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("inventory_ownership_events")
    .select("id, lot_id, from_organization_id, to_organization_id, order_item_id, quantity_kg, event_type, created_by, created_at, correlation_id, reason, source_document_id")
    .or(`from_organization_id.eq.${organizationId},to_organization_id.eq.${organizationId}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const allRows = rows ?? [];
  const hasMore = allRows.length > boundedPageSize;
  const pageRows = hasMore ? allRows.slice(0, boundedPageSize) : allRows;

  if (pageRows.length === 0) {
    return { rows: [], hasMore: false };
  }

  const counterpartyIds = [
    ...new Set(
      pageRows.flatMap((row) => [row.from_organization_id, row.to_organization_id]).filter((id): id is string => id !== null)
    ),
  ];
  const displayNameById = await getReadableOrganizationNames(supabase, counterpartyIds);

  const events: OwnershipEvent[] = pageRows.map((row) => ({
    id: row.id,
    lotId: row.lot_id,
    quantityKg: Number(row.quantity_kg),
    eventType: row.event_type as OwnershipEvent["eventType"],
    role: {
      isSource: row.from_organization_id === organizationId,
      isDestination: row.to_organization_id === organizationId,
    },
    from: toCounterparty(row.from_organization_id, displayNameById),
    to: toCounterparty(row.to_organization_id, displayNameById),
    orderItemId: row.order_item_id,
    correlationId: row.correlation_id,
    reason: row.reason,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));

  return { rows: events, hasMore };
}

function toCounterparty(organizationId: string | null, displayNameById: Map<string, string>): OwnershipCounterparty {
  if (organizationId === null) {
    return { organizationId: null, displayName: null, redacted: false };
  }
  const displayName = displayNameById.get(organizationId) ?? null;
  return { organizationId, displayName, redacted: displayName === null };
}

async function getReadableOrganizationNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationIds: readonly string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (organizationIds.length === 0) return result;

  const { data: rows } = await supabase.from("organizations").select("id, display_name").in("id", organizationIds);
  for (const row of rows ?? []) result.set(row.id, row.display_name);
  return result;
}
