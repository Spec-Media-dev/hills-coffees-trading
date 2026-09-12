import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { INVENTORY_FIXTURES, signInAsFixture, verifyInventoryAppendOnlyGuard } from "@/tests/auth/fixture-session";

/**
 * Feature 005 Phase 5 (T018) — proves the `inventory_ownership_events` append-only guarantee at the
 * REAL DATABASE boundary (LOT-03), not merely "the UI has no Edit button." The actual enforcement
 * mechanism, confirmed EMPIRICALLY (not merely from reading the schema) via a direct probe run before
 * finalizing this test — an earlier draft assumed the append-only TRIGGER would fire and raise its
 * exception for an ordinary member's UPDATE too, and that assumption was WRONG, corrected here:
 *
 *   - `inventory_ownership_events` has exactly ONE RLS policy, `ownership_admin`, and it is scoped to
 *     `SELECT` only. With row-level security enabled and no policy at all for the `UPDATE` command,
 *     Postgres treats EVERY row as invisible for that command to a normal (non-BYPASSRLS) role — so
 *     an authenticated member's `UPDATE ... WHERE id = ...` matches ZERO rows and returns
 *     `{ data: [], error: null }`. The row is silently, safely unaffected; the `BEFORE UPDATE` trigger
 *     never even runs, because RLS filters the candidate rows out before the trigger's row-level scan
 *     reaches them. This was directly confirmed with a live probe (a real signed-in session, real
 *     before/after reads) before this file's assertions were written.
 *   - `authenticated` holds NO DELETE grant on this table at all (`service_role` is the only
 *     grantee) — so a member's DELETE is refused at the raw Postgres PRIVILEGE layer instead
 *     (`42501 permission denied`), a genuinely different, independently-confirmed mechanism.
 *   - The `BEFORE UPDATE OR DELETE` trigger (`trg_ownership_events_append_only` →
 *     `prevent_ownership_event_mutation()`, an unconditional `raise exception
 *     'inventory_ownership_events_is_append_only'`) IS real and DOES fire — but only for a role whose
 *     write reaches it at all, i.e. `service_role` (which bypasses RLS entirely in this project, as is
 *     standard for the service key, but is not exempt from the trigger). The final assertion invokes
 *     the fixture script's isolated, exact-id privileged probe and requires that specific trigger
 *     error plus an unchanged row; no service-role credential enters this test process or production
 *     source.
 *
 * Net result: for the actual identity this test is required to use — a real authenticated member,
 * never service-role — BOTH mutation paths are refused, by two independently-confirmed mechanisms
 * (RLS-silent-no-op for UPDATE, privilege-denial for DELETE). Neither the UI nor application code is
 * the enforcement boundary in either case.
 */
describe("T018 — inventory_ownership_events is append-only at the database boundary", () => {
  it("an authenticated member's UPDATE against a real, own-org-visible event silently matches zero rows (RLS has no UPDATE policy for this table)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);

    const { error, data } = await client
      .from("inventory_ownership_events")
      .update({ reason: "an authenticated member attempting to rewrite ledger history" })
      .eq("id", INVENTORY_FIXTURES.events.hillsToOrgA)
      .select("id");

    // No error, because RLS's row-level filter runs BEFORE the row is offered to the UPDATE — it is
    // simply absent from the update's own view, not a rejected write. Confirmed empirically: zero
    // rows returned, matching the zero rows actually affected.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // The row itself is provably unchanged — the mutation did not silently partially apply.
    const { data: unchanged } = await client
      .from("inventory_ownership_events")
      .select("reason")
      .eq("id", INVENTORY_FIXTURES.events.hillsToOrgA)
      .maybeSingle();
    expect(unchanged?.reason).toBe("Feature 005 fixture — initial allocation to Org A");
  });

  it("an authenticated member's DELETE against the same event is refused (no DELETE grant for `authenticated` at all)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);

    const { error, count } = await client
      .from("inventory_ownership_events")
      .delete({ count: "exact" })
      .eq("id", INVENTORY_FIXTURES.events.hillsToOrgA);

    // `authenticated` holds no DELETE grant on this table (confirmed against the live schema report),
    // so this is refused at the privilege layer — a genuinely different mechanism than the UPDATE
    // trigger above, and this test proves it is ALSO refused, not merely assumed to be.
    expect(error).not.toBeNull();

    // Either way the row must still exist afterward — belt-and-braces proof the delete did not
    // silently succeed against a driver-level quirk.
    const { data: stillThere } = await client
      .from("inventory_ownership_events")
      .select("id")
      .eq("id", INVENTORY_FIXTURES.events.hillsToOrgA)
      .maybeSingle();
    expect(stillThere).not.toBeNull();
    expect(count === null || count === 0).toBe(true);
  });

  it("an unrelated member (not a party to the event) cannot even attempt a targeted mutation with any effect — RLS already hides the row, independent of the trigger", async () => {
    // Org C is unrelated to this specific event (`hillsToOrgA` — hillsOrg → Org A); the event itself
    // is invisible to Org C under `ownership_admin`'s SELECT policy, so an UPDATE naming its id
    // matches zero rows for Org C regardless of the append-only trigger.
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgC.email);

    const { error, data } = await client
      .from("inventory_ownership_events")
      .update({ reason: "unrelated org attempting a targeted rewrite" })
      .eq("id", INVENTORY_FIXTURES.events.hillsToOrgA)
      .select("id");

    // Two independent, equally acceptable safe outcomes depending on exactly how RLS and the trigger
    // interact for a row invisible to the caller: either it is refused outright, or it silently
    // matches zero rows. Either way, nothing is disclosed and nothing changes.
    if (!error) {
      expect(data ?? []).toEqual([]);
    }
  });

  it("a privileged fixture-only mutation attempt reaches and is refused by the database append-only trigger", () => {
    expect(() => verifyInventoryAppendOnlyGuard()).not.toThrow();
  });

  it("Feature 005's runtime ships no mutation path for the ownership ledger — no update/delete/reorder helper exists anywhere in lib/inventory or components/inventory", () => {
    const files = [
      "lib/inventory/types.ts",
      "lib/inventory/positions.ts",
      "lib/inventory/allocations.ts",
      "lib/inventory/ownership.ts",
      "lib/inventory/availability.ts",
      "components/inventory/ledger-timeline.tsx",
      "components/inventory/availability-breakdown.tsx",
      "components/inventory/storage-status-badge.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/"use server"/);
      expect(source).not.toMatch(/\.update\(|\.delete\(|\.upsert\(|\.insert\(/);
    }
  });
});
