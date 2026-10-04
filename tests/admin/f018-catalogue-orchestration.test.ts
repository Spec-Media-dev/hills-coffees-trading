/* eslint-disable @typescript-eslint/no-explicit-any -- test-only: rows returned by psql are dynamic JSON that these suites assert on structurally */
/**
 * Feature 018 T040 - Admin catalogue orchestration against REAL PostgreSQL: stable creation intent, resumable steps,
 * revision CAS, explicit real-inventory offers, Featured, readiness, catalogue-only and coordinated publication,
 * atomic Compliance decisions, role/MFA denials. Opt in with F018_LOCAL_PG=1. LOCAL ONLY (no fixture session, no remote).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { W, buildWorldTemplate } from "../commerce/f018-fixtures";
import { F018_LOCAL_PG_ENABLED, jsonLine, resetFromWorldTemplate, waitForLockWait, work, workScalar } from "../commerce/f018-local-pg";
import { Operator, coffeeRow, countOf, putPublicObject, req } from "./f018-admin-helpers";

const U = W.users;

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 Admin catalogue orchestration (real PostgreSQL)", { timeout: 240_000 }, () => {
  const open: Operator[] = [];
  const as = async (name: string, userId: string, aal: "aal1" | "aal2" = "aal1") => { const operator = await Operator.open(name, userId, aal); open.push(operator); return operator; };
  let slugCounter = 0;
  const identity = (overrides: Record<string, unknown> = {}) => ({ name: "Test Roast", slug: `f018-test-${++slugCounter}`, description: "English description", ...overrides });

  beforeAll(() => { buildWorldTemplate(); }, 240_000);
  beforeEach(() => { resetFromWorldTemplate(); slugCounter = 0; });
  afterEach(async () => { await Promise.all(open.splice(0).map((operator) => operator.close())); });

  /** Gives a new Coffee everything publication needs and returns its latest revision. */
  async function makeReady(admin: Operator, coffeeId: string, revision: number): Promise<number> {
    const arabic = await admin.saveStep(coffeeId, "arabic", revision, { name: "قهوة اختبار", description: "وصف عربي" });
    expect(arabic.ok).toBe(true);
    const taxonomy = await admin.saveStep(coffeeId, "taxonomy", (arabic as any).value.revision, { origin_id: W.origin });
    expect(taxonomy.ok).toBe(true);
    const path = `catalogue/${coffeeId}/main.png`;
    putPublicObject(path);
    const media = await admin.rpc("attach_catalogue_media", req(), coffeeId, (taxonomy as any).value.revision, path, "main.png", "image/png", 1000);
    expect(media.ok, JSON.stringify(media)).toBe(true);
    return (media as any).value.revision;
  }

  /** Simulates the Warehouse role having booked real stock for this Coffee (the workflow itself can never do this). */
  function bookStock(coffeeId: string, lotCode: string, quantity: number, locationId: string | null = null): { lotId: string; positionId: string } {
    const lotId = workScalar(`insert into public.coffee_lots (coffee_id, lot_code, total_quantity_kg, status, source_organization_id, created_by) values ('${coffeeId}', '${lotCode}', ${quantity}, 'AVAILABLE', '${W.orgs.hills}', '${U.admin}') returning id`);
    const positionId = workScalar(`insert into public.inventory_positions (lot_id, owner_organization_id, warehouse_id, warehouse_location_id, available_quantity_kg, reserved_quantity_kg) values ('${lotId}', '${W.orgs.hills}', '${W.warehouse}', ${locationId ? `'${locationId}'` : "null"}, ${quantity}, 0) returning id`);
    return { lotId, positionId };
  }

  describe("creation intent and role boundaries", () => {
    it("the first confirmed save creates exactly one DRAFT; repeating the same intent returns it; a changed intent conflicts", async () => {
      const admin = await as("admin", U.admin);
      const requestId = req();
      const first = await admin.createCoffee(identity({ slug: "alpha-roast" }), requestId);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value).toMatchObject({ status: "DRAFT", slug: "alpha-roast", revision: 1 });
      const again = await admin.createCoffee(identity({ slug: "alpha-roast" }), requestId);
      expect(again).toEqual(first);
      const changed = await admin.createCoffee(identity({ slug: "alpha-roast", name: "Different" }), requestId);
      expect(changed).toMatchObject({ ok: false, error: "request_payload_conflict" });
      expect(countOf("coffees", "slug = 'alpha-roast'")).toBe(1);
      // A different intent with the same slug is a normal conflict, not a second Coffee.
      expect(await admin.createCoffee(identity({ slug: "alpha-roast" }))).toMatchObject({ ok: false, error: "slug_taken" });
      expect(countOf("coffees", "slug = 'alpha-roast'")).toBe(1);
    });

    it("validates identity fields at the database boundary", async () => {
      const admin = await as("admin", U.admin);
      for (const bad of [{ name: "" }, { name: "x".repeat(201) }, { slug: "Bad Slug" }, { slug: "-lead" }, { slug: "" }, { description: "d".repeat(4001) }]) {
        const outcome = await admin.createCoffee(identity(bad));
        expect(outcome.ok, JSON.stringify(bad)).toBe(false);
        if (!outcome.ok) expect(outcome.error).toBe("catalogue_field_invalid");
      }
      expect(countOf("coffees", "slug like 'f018-test-%'")).toBe(0);
    });

    it.each([["buyer", U.buyerA1], ["seller", U.sellerS1], ["compliance", U.compliance], ["warehouse", U.warehouse], ["finance", U.finance], ["auditor", U.auditor]])(
      "a %s operator cannot create or edit through the controlled routines (no universal catalogue authority)", async (_label, userId) => {
        const admin = await as("admin", U.admin);
        const created = await admin.createCoffee(identity());
        const coffeeId = (created as any).value.coffee_id as string;
        const other = await as("other", userId);
        expect(await other.createCoffee(identity())).toMatchObject({ ok: false, error: "forbidden" });
        expect(await other.saveStep(coffeeId, "identity", 1, identity())).toMatchObject({ ok: false, error: "forbidden" });
        expect(await other.rpc("set_coffee_featured", coffeeId, true, 1, req())).toMatchObject({ ok: false, error: "forbidden" });
        expect(await other.rpc("publish_coffee_catalogue_only", coffeeId, 1, req())).toMatchObject({ ok: false, error: "forbidden" });
        expect(await other.rpc("list_catalogue_backing_positions", coffeeId)).toMatchObject({ ok: false, error: "forbidden" });
        expect(countOf("coffees", "slug like 'f018-test-%'")).toBe(1);
      });

    it("blocked admins and sessions without MFA step-up are refused before any write; aal2 passes", async () => {
      work(`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), '${U.admin}', 'f018', 'totp', 'verified', now(), now())`);
      const aal1 = await as("aal1", U.admin, "aal1");
      expect(await aal1.createCoffee(identity())).toMatchObject({ ok: false, error: "mfa_step_up_required" });
      const aal2 = await as("aal2", U.admin, "aal2");
      expect((await aal2.createCoffee(identity())).ok).toBe(true);
      work(`update public.profiles set is_blocked = true where id = '${U.admin}'`);
      expect(await aal2.createCoffee(identity())).toMatchObject({ ok: false, error: "forbidden" });
      expect(countOf("coffees", "slug like 'f018-test-%'")).toBe(1);
    });
  });

  describe("resumable steps and edit conflicts", () => {
    it("every step persists independently and a reload resumes the same Coffee from normalized state", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity({ slug: "resume-me" }))) as any;
      const coffeeId = created.value.coffee_id as string;
      expect(countOf("coffees", "slug = 'resume-me'")).toBe(1);

      // "Interrupt" after identity: a brand-new session (a reload) sees the saved DRAFT and continues.
      const reload = await as("reload", U.admin);
      expect(coffeeRow(coffeeId)).toMatchObject({ status: "DRAFT", name: "Test Roast", origin_id: null });
      const arabic = await reload.saveStep(coffeeId, "arabic", created.value.revision, { name: "مثال", description: "وصف" });
      expect(arabic.ok).toBe(true);
      const reload2 = await as("reload2", U.admin);
      const taxonomy = await reload2.saveStep(coffeeId, "taxonomy", (arabic as any).value.revision, { origin_id: W.origin });
      expect(taxonomy.ok).toBe(true);
      expect(workScalar(`select name from public.coffee_translations where coffee_id = '${coffeeId}' and locale = 'ar'`)).toBe("مثال");
      expect(coffeeRow(coffeeId)!.origin_id).toBe(W.origin);
      expect(countOf("coffees", "slug = 'resume-me'")).toBe(1);
    });

    it("a stale revision returns the current revision and changes nothing; the retry with the fresh revision succeeds", async () => {
      const a = await as("a", U.admin);
      const b = await as("b", U.admin2);
      const created = (await a.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const revision = created.value.revision as number;

      const first = (await a.saveStep(coffeeId, "identity", revision, identity({ name: "Operator A edit", slug: "a-edit" }))) as any;
      expect(first.ok).toBe(true);
      const stale = await b.saveStep(coffeeId, "arabic", revision, { name: "ب", description: "ب" });
      expect(stale).toMatchObject({ ok: false, error: "revision_conflict" });
      if (!stale.ok) expect(JSON.parse(stale.detail!)).toEqual({ current_revision: first.value.revision });
      expect(countOf("coffee_translations", `coffee_id = '${coffeeId}'`)).toBe(0);
      expect(coffeeRow(coffeeId)!.name).toBe("Operator A edit");

      const retry = await b.saveStep(coffeeId, "arabic", first.value.revision, { name: "ب", description: "ب" });
      expect(retry.ok).toBe(true);
      expect(coffeeRow(coffeeId)).toMatchObject({ name: "Operator A edit" });
      expect(workScalar(`select name from public.coffee_translations where coffee_id = '${coffeeId}' and locale = 'ar'`)).toBe("ب");
    });

    it("two operators saving with the same expected revision at the same time: one commits, the other conflicts, no work is lost", async () => {
      const a = await as("a", U.admin);
      const b = await as("b", U.admin2);
      const created = (await a.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;

      await a.raw("begin;");
      expect((await a.rpc("save_catalogue_step", req(), coffeeId, "identity", created.value.revision, identity({ name: "From A", slug: "from-a" }))).ok).toBe(true);
      const racing = b.session.run(`select public.save_catalogue_step('${req()}', '${coffeeId}', 'identity', ${created.value.revision}, '{"name":"From B","slug":"from-b","description":"b"}'::jsonb);`);
      expect(await waitForLockWait("b")).toBe(true);
      await a.raw("commit;");
      const outcome = await racing;
      expect(outcome).toMatch(/revision_conflict/);
      expect(coffeeRow(coffeeId)).toMatchObject({ name: "From A", slug: "from-a" });
    });

    it("a replayed step returns the original result even after the revision moved; a changed payload conflicts", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const requestId = req();
      const first = (await admin.saveStep(coffeeId, "arabic", created.value.revision, { name: "أ", description: "أ" }, requestId)) as any;
      expect((await admin.saveStep(coffeeId, "identity", first.value.revision, identity({ name: "moved on", slug: "moved-on" }))).ok).toBe(true);
      expect(await admin.saveStep(coffeeId, "arabic", created.value.revision, { name: "أ", description: "أ" }, requestId)).toEqual(first);
      expect(await admin.saveStep(coffeeId, "arabic", created.value.revision, { name: "ج", description: "ج" }, requestId)).toMatchObject({ ok: false, error: "request_payload_conflict" });
      expect(workScalar(`select name from public.coffee_translations where coffee_id = '${coffeeId}' and locale = 'ar'`)).toBe("أ");
    });

    it("rejects invalid steps and inactive or unknown taxonomy references", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      expect(await admin.saveStep(coffeeId, "publish", created.value.revision, {})).toMatchObject({ ok: false, error: "catalogue_step_invalid" });
      expect(await admin.saveStep(coffeeId, "taxonomy", created.value.revision, { origin_id: "not-a-uuid" })).toMatchObject({ ok: false, error: "catalogue_field_invalid" });
      expect(await admin.saveStep(coffeeId, "taxonomy", created.value.revision, { origin_id: "99999999-9999-4999-8999-999999999999" })).toMatchObject({ ok: false, error: "origin_inactive" });
      const inactive = workScalar("insert into public.origins (name, slug, status) values ('Retired', 'f018-retired', 'INACTIVE') returning id");
      expect(await admin.saveStep(coffeeId, "taxonomy", created.value.revision, { origin_id: inactive })).toMatchObject({ ok: false, error: "origin_inactive" });
      expect(await admin.saveStep(coffeeId, "taxonomy", created.value.revision, { coffee_type_id: "99999999-9999-4999-8999-999999999999" })).toMatchObject({ ok: false, error: "reference_invalid" });
      expect(coffeeRow(coffeeId)!.revision).toBe(created.value.revision);
    });

    it("revision tokens are collision-safe: direct edits, translations and media bump the Coffee; reservation counters never bump an offer", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      let revision = coffeeRow(coffeeId)!.revision;
      work(`update public.coffees set name = 'Direct edit' where id = '${coffeeId}'`);
      expect(coffeeRow(coffeeId)!.revision).toBe(++revision);
      work(`update public.coffees set name = 'Direct edit' where id = '${coffeeId}'`);
      expect(coffeeRow(coffeeId)!.revision).toBe(revision);
      work(`insert into public.coffee_translations (coffee_id, locale, name) values ('${coffeeId}', 'ar', 'م')`);
      expect(coffeeRow(coffeeId)!.revision).toBeGreaterThan(revision);
      const before = Number(workScalar(`select revision from public.coffee_offers where id = '${W.offers.A}'`));
      work(`update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg + 1 where id = '${W.offers.A}'`);
      expect(Number(workScalar(`select revision from public.coffee_offers where id = '${W.offers.A}'`))).toBe(before);
      work(`update public.coffee_offers set price_per_kg = price_per_kg + 1 where id = '${W.offers.A}'`);
      expect(Number(workScalar(`select revision from public.coffee_offers where id = '${W.offers.A}'`))).toBe(before + 1);
    });
  });

  describe("media intent and recovery", () => {
    it("attach is idempotent, recoverable after a lost response, protected by CAS and path-bound; remove returns only the owned object path", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const path = `catalogue/${coffeeId}/one.png`;
      const requestId = req();
      const attached = (await admin.rpc("attach_catalogue_media", requestId, coffeeId, created.value.revision, path, "one.png", "image/png", 1000)) as any;
      expect(attached.ok).toBe(true);
      expect(attached.value).toMatchObject({ coffee_id: coffeeId, object_path: path, is_primary: true });

      // The browser never saw that response: recover by the original request key, then replay it.
      const recovered = await admin.rpc("recover_catalogue_operation", requestId);
      expect(recovered).toMatchObject({ ok: true, value: { status: "COMMITTED", operation: "catalogue_attach_media", response: { media_id: attached.value.media_id } } });
      expect(await admin.rpc("attach_catalogue_media", requestId, coffeeId, created.value.revision, path, "one.png", "image/png", 1000)).toEqual(attached);
      expect(countOf("coffee_media", `coffee_id = '${coffeeId}'`)).toBe(1);
      expect(await admin.rpc("recover_catalogue_operation", req())).toMatchObject({ ok: true, value: { status: "NOT_COMMITTED" } });
      const other = await as("other", U.admin2);
      expect(await other.rpc("recover_catalogue_operation", requestId)).toMatchObject({ ok: true, value: { status: "NOT_COMMITTED" } });

      // Path, type, size and CAS are enforced in the database.
      expect(await admin.rpc("attach_catalogue_media", req(), coffeeId, created.value.revision, path, "x.png", "image/png", 1000)).toMatchObject({ ok: false, error: "revision_conflict" });
      const revision = coffeeRow(coffeeId)!.revision;
      expect(await admin.rpc("attach_catalogue_media", req(), coffeeId, revision, "catalogue/other/x.png", "x.png", "image/png", 1000)).toMatchObject({ ok: false, error: "coffee_media_object_path_invalid" });
      expect(await admin.rpc("attach_catalogue_media", req(), coffeeId, revision, `catalogue/${coffeeId}/x.gif`, "x.gif", "image/gif", 1000)).toMatchObject({ ok: false, error: "coffee_media_type_invalid" });
      expect(await admin.rpc("attach_catalogue_media", req(), coffeeId, revision, `catalogue/${coffeeId}/x.png`, "x.png", "image/png", 6_000_000)).toMatchObject({ ok: false, error: "coffee_media_size_invalid" });

      // A second image, then promotion of the second to primary atomically.
      const second = (await admin.rpc("attach_catalogue_media", req(), coffeeId, revision, `catalogue/${coffeeId}/two.png`, "two.png", "image/png", 1000)) as any;
      expect(second.value.is_primary).toBe(false);
      const promoted = await admin.rpc("set_catalogue_media_primary", req(), coffeeId, second.value.revision, second.value.media_id);
      expect(promoted.ok).toBe(true);
      expect(workScalar(`select count(*) from public.coffee_media where coffee_id = '${coffeeId}' and is_primary`)).toBe("1");
      expect(workScalar(`select id from public.coffee_media where coffee_id = '${coffeeId}' and is_primary`)).toBe(second.value.media_id);

      // Removal returns the owned object path; another Coffee's media cannot be removed through this Coffee.
      const foreign = workScalar(`select id from public.coffee_media limit 1 offset 5`) || "99999999-9999-4999-8999-999999999999";
      const current = coffeeRow(coffeeId)!.revision;
      expect(await admin.rpc("remove_catalogue_media", req(), coffeeId, current, foreign)).toMatchObject({ ok: false, error: "coffee_media_not_found" });
      const removed = (await admin.rpc("remove_catalogue_media", req(), coffeeId, current, attached.value.media_id)) as any;
      expect(removed.value).toMatchObject({ removed_media_id: attached.value.media_id, object_path: path });
    });

    it("an injected media failure rolls back the whole attach (no asset row, no request claim) and the same request retries", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const requestId = req();
      const path = `catalogue/${coffeeId}/fail.png`;
      await admin.raw("set f018.fail_at = 'media';");
      const failed = await admin.rpc("attach_catalogue_media", requestId, coffeeId, created.value.revision, path, "fail.png", "image/png", 1000);
      await admin.raw("set f018.fail_at = '';");
      expect(failed).toMatchObject({ ok: false });
      expect(countOf("file_assets", `object_path = '${path}'`)).toBe(0);
      expect(countOf("commerce_request_log", `request_id = '${requestId}'`)).toBe(0);
      expect((await admin.rpc("attach_catalogue_media", requestId, coffeeId, created.value.revision, path, "fail.png", "image/png", 1000)).ok).toBe(true);
    });
  });

  describe("real backing inventory and explicit offers", () => {
    it("lists only real Hills stock for the Coffee; no stock is a Warehouse handoff and the workflow never creates stock", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const positionsBefore = workScalar("select count(*) || ':' || coalesce(sum(available_quantity_kg), 0) from public.inventory_positions");
      expect(await admin.rpc("list_catalogue_backing_positions", coffeeId)).toMatchObject({ ok: true, value: [] });
      const noStock = await admin.rpc("create_backed_offer_intent", req(), coffeeId, created.value.revision, "99999999-9999-4999-8999-999999999999", 10, 100, "t");
      expect(noStock).toMatchObject({ ok: false, error: "backing_position_not_eligible" });

      const stock = bookStock(coffeeId, "F018-NEW-1", 600);
      const listed = (await admin.rpc("list_catalogue_backing_positions", coffeeId)) as any;
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]).toMatchObject({ position_id: stock.positionId, lot_code: "F018-NEW-1", tradable_kg: 600, held: false, eligible: true, existing_offer_id: null });
      expect(workScalar("select count(*) || ':' || coalesce(sum(available_quantity_kg), 0) from public.inventory_positions")).not.toBe(positionsBefore);

      const before = workScalar("select count(*) || ':' || coalesce(sum(available_quantity_kg + reserved_quantity_kg), 0) from public.inventory_positions");
      const offer = (await admin.rpc("create_backed_offer_intent", req(), coffeeId, created.value.revision, stock.positionId, 12.5, 500, "Launch lot")) as any;
      expect(offer.ok, JSON.stringify(offer)).toBe(true);
      expect(offer.value).toMatchObject({ status: "DRAFT", coffee_id: coffeeId });
      expect(offer.value.offer_code).toMatch(/^LST-[0-9]{7,}$/);
      expect(workScalar("select count(*) || ':' || coalesce(sum(available_quantity_kg + reserved_quantity_kg), 0) from public.inventory_positions")).toBe(before);
      expect(workScalar(`select seller_type || '|' || currency || '|' || price_per_kg::text || '|' || quantity_kg::text from public.coffee_offers where id = '${offer.value.offer_id}'`)).toBe("HILLS|USD|12.5000|500.000");
    });

    it("refuses forged or ineligible backing, oversized quantity, bad prices and a second active offer on the same stock", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const stock = bookStock(coffeeId, "F018-NEW-2", 300);
      const positionOf = (lot: string) => workScalar(`select id from public.inventory_positions where lot_id = '${lot}'`);
      const revision = created.value.revision as number;

      // Another Coffee's Hills stock, and a member seller's stock, are not eligible backing for this Coffee.
      expect(await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, positionOf(W.lots.l1), 10, 10, null)).toMatchObject({ ok: false, error: "backing_position_not_eligible" });
      expect(await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, positionOf(W.lots.l4), 10, 10, null)).toMatchObject({ ok: false, error: "backing_position_not_eligible" });
      expect(await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, stock.positionId, 10, 301, null)).toMatchObject({ ok: false, error: "offer_quantity_exceeds_inventory" });
      expect(await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, stock.positionId, 0, 10, null)).toMatchObject({ ok: false, error: "offer_price_invalid" });
      expect(await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, stock.positionId, 10, -1, null)).toMatchObject({ ok: false, error: "offer_quantity_invalid" });
      expect(await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision + 5, stock.positionId, 10, 10, null)).toMatchObject({ ok: false, error: "revision_conflict" });
      expect(countOf("coffee_offers", `coffee_id = '${coffeeId}'`)).toBe(0);

      const first = await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, stock.positionId, 10, 100, null);
      expect(first.ok).toBe(true);
      const second = await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, stock.positionId, 11, 50, null);
      expect(second).toMatchObject({ ok: false, error: "active_offer_exists" });
      expect(countOf("coffee_offers", `coffee_id = '${coffeeId}'`)).toBe(1);
      const listed = (await admin.rpc("list_catalogue_backing_positions", coffeeId)) as any;
      expect(listed.value[0]).toMatchObject({ eligible: false, existing_offer_status: "DRAFT" });
    });

    it("the same intent never creates a duplicate offer and offer edits are CAS-protected and status-gated", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const stock = bookStock(coffeeId, "F018-NEW-3", 300);
      const requestId = req();
      const offer = (await admin.rpc("create_backed_offer_intent", requestId, coffeeId, created.value.revision, stock.positionId, 9, 100, "t")) as any;
      expect(await admin.rpc("create_backed_offer_intent", requestId, coffeeId, created.value.revision, stock.positionId, 9, 100, "t")).toEqual(offer);
      expect(countOf("coffee_offers", `coffee_id = '${coffeeId}'`)).toBe(1);

      const saved = (await admin.rpc("save_offer_commercials", req(), offer.value.offer_id, offer.value.revision, 9.75, 120, "Edited")) as any;
      expect(saved.ok).toBe(true);
      expect(await admin.rpc("save_offer_commercials", req(), offer.value.offer_id, offer.value.revision, 9.8, 120, "Stale")).toMatchObject({ ok: false, error: "revision_conflict" });
      expect(await admin.rpc("save_offer_commercials", req(), offer.value.offer_id, saved.value.revision, 9.8, 301, "Too many")).toMatchObject({ ok: false });
      work(`update public.coffee_offers set status = 'PENDING_REVIEW' where id = '${offer.value.offer_id}'`);
      const refreshed = Number(workScalar(`select revision from public.coffee_offers where id = '${offer.value.offer_id}'`));
      expect(await admin.rpc("save_offer_commercials", req(), offer.value.offer_id, refreshed, 9.9, 120, "Locked")).toMatchObject({ ok: false, error: "offer_not_editable" });
    });
  });

  describe("Featured, readiness and publication", () => {
    it("Featured keeps its first moment on re-enable, clears on Unfeature, and never implies publication", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const on = (await admin.rpc("set_coffee_featured", coffeeId, true, created.value.revision, req())) as any;
      expect(on.value).toMatchObject({ featured: true });
      const moment = on.value.featured_at as string;
      expect(coffeeRow(coffeeId)!.status).toBe("DRAFT");
      const again = (await admin.rpc("set_coffee_featured", coffeeId, true, on.value.revision, req())) as any;
      expect(again.value).toMatchObject({ featured: true, featured_at: moment, revision: on.value.revision });
      const off = (await admin.rpc("set_coffee_featured", coffeeId, false, again.value.revision, req())) as any;
      expect(off.value).toMatchObject({ featured: false, featured_at: null });
      expect(await admin.rpc("set_coffee_featured", coffeeId, true, off.value.revision - 1, req())).toMatchObject({ ok: false, error: "revision_conflict" });
      expect(await admin.rpc("set_coffee_featured", coffeeId, null, off.value.revision, req())).toMatchObject({ ok: false, error: "catalogue_field_invalid" });
    });

    it("readiness explains each missing requirement separately and a broken primary image blocks publication", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity({ description: "" }))) as any;
      const coffeeId = created.value.coffee_id as string;
      const empty = (await admin.rpc("get_catalogue_readiness", coffeeId)) as any;
      expect(empty.value).toMatchObject({ ready: false, missing: ["english_description", "arabic_name", "arabic_description", "origin_missing", "primary_image"] });
      expect(empty.value.checks).toMatchObject({ english: { ok: false }, arabic: { ok: false }, origin: { ok: false }, primary_image: { ok: false } });
      const blocked = await admin.rpc("publish_coffee_catalogue_only", coffeeId, created.value.revision, req());
      expect(blocked).toMatchObject({ ok: false, error: "coffee_not_publish_ready" });
      if (!blocked.ok) expect(JSON.parse(blocked.detail!)).toContain("arabic_name");

      // A recorded primary image whose object is missing from Storage is NOT ready.
      let revision = (await admin.saveStep(coffeeId, "identity", created.value.revision, identity({ slug: "ready-me" })) as any).value.revision as number;
      revision = ((await admin.saveStep(coffeeId, "arabic", revision, { name: "ا", description: "ا" })) as any).value.revision;
      revision = ((await admin.saveStep(coffeeId, "taxonomy", revision, { origin_id: W.origin })) as any).value.revision;
      const attached = (await admin.rpc("attach_catalogue_media", req(), coffeeId, revision, `catalogue/${coffeeId}/ghost.png`, "ghost.png", "image/png", 1000)) as any;
      const broken = (await admin.rpc("get_catalogue_readiness", coffeeId)) as any;
      expect(broken.value.missing).toEqual(["primary_image"]);
      expect(await admin.rpc("publish_coffee_catalogue_only", coffeeId, attached.value.revision, req())).toMatchObject({ ok: false, error: "coffee_not_publish_ready" });
      putPublicObject(`catalogue/${coffeeId}/ghost.png`);
      expect(((await admin.rpc("get_catalogue_readiness", coffeeId)) as any).value).toMatchObject({ ready: true, missing: [] });
    });

    it("catalogue-only publication needs no executable offer, is exactly-once, and an already published Coffee is not re-published", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const revision = await makeReady(admin, coffeeId, created.value.revision);
      const requestId = req();
      const published = (await admin.rpc("publish_coffee_catalogue_only", coffeeId, revision, requestId)) as any;
      expect(published.value).toMatchObject({ status: "PUBLISHED", mode: "CATALOGUE_ONLY" });
      expect(countOf("coffee_offers", `coffee_id = '${coffeeId}'`)).toBe(0);
      expect(await admin.rpc("publish_coffee_catalogue_only", coffeeId, revision, requestId)).toEqual(published);
      expect(await admin.rpc("publish_coffee_catalogue_only", coffeeId, published.value.revision, req())).toMatchObject({ ok: false, error: "coffee_not_publishable_from_status" });
    });

    it("the old raw DRAFT -> PUBLISHED update is gated by the same readiness; trusted maintenance and historical published Coffees are not", async () => {
      const admin = await as("admin", U.admin);
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const raw = await admin.raw(`update public.coffees set status = 'PUBLISHED' where id = '${coffeeId}';`);
      expect(raw).toMatch(/coffee_not_publish_ready/);
      expect(coffeeRow(coffeeId)!.status).toBe("DRAFT");
      // Existing PUBLISHED Coffees (English-only, no Arabic, no origin) keep working and are never withdrawn or rewritten.
      expect(coffeeRow(W.coffees.c3)!.status).toBe("PUBLISHED");
      expect(await admin.raw(`update public.coffees set description = 'edited' where id = '${W.coffees.c3}';`)).not.toMatch(/ERROR/);
      expect(coffeeRow(W.coffees.c3)!.status).toBe("PUBLISHED");
      // Trusted maintenance (no JWT) is not gated.
      work(`update public.coffees set status = 'PUBLISHED' where id = '${coffeeId}'`);
      expect(coffeeRow(coffeeId)!.status).toBe("PUBLISHED");
    });
  });

  describe("Compliance review and coordinated publication", () => {
    /** A ready Coffee with an offer waiting for Compliance, plus helpers to approve it. */
    async function pendingOffer(admin: Operator) {
      const created = (await admin.createCoffee(identity())) as any;
      const coffeeId = created.value.coffee_id as string;
      const stock = bookStock(coffeeId, "F018-PUB-1", 400);
      const revision = await makeReady(admin, coffeeId, created.value.revision);
      const offer = (await admin.rpc("create_backed_offer_intent", req(), coffeeId, revision, stock.positionId, 11, 200, "Pub")) as any;
      expect(offer.ok, JSON.stringify(offer)).toBe(true);
      work(`update public.coffee_offers set status = 'PENDING_REVIEW' where id = '${offer.value.offer_id}'`);
      return { coffeeId, offerId: offer.value.offer_id as string };
    }
    const offerRevision = (offerId: string) => Number(workScalar(`select revision from public.coffee_offers where id = '${offerId}'`));

    it("a Compliance decision changes status and history atomically, exactly once per request, and fails closed on stale state", async () => {
      const admin = await as("admin", U.admin);
      const { offerId } = await pendingOffer(admin);
      const compliance = await as("compliance", U.compliance);
      const requestId = req();

      await compliance.raw("set f018.fail_at = 'review';");
      const failed = await compliance.rpc("record_listing_review_decision", offerId, "APPROVED", "ok", requestId);
      await compliance.raw("set f018.fail_at = '';");
      expect(failed.ok).toBe(false);
      expect(workScalar(`select status from public.coffee_offers where id = '${offerId}'`)).toBe("PENDING_REVIEW");
      expect(countOf("listing_reviews", `offer_id = '${offerId}'`)).toBe(0);
      expect(countOf("commerce_request_log", `request_id = '${requestId}'`)).toBe(0);

      const decided = (await compliance.rpc("record_listing_review_decision", offerId, "APPROVED", "meets policy", requestId)) as any;
      expect(decided.value).toMatchObject({ decision: "APPROVED", from_status: "PENDING_REVIEW", to_status: "APPROVED" });
      expect(await compliance.rpc("record_listing_review_decision", offerId, "APPROVED", "meets policy", requestId)).toEqual(decided);
      expect(countOf("listing_reviews", `offer_id = '${offerId}'`)).toBe(1);
      expect(countOf("listing_status_history", `offer_id = '${offerId}' and new_status = 'APPROVED'`)).toBe(1);
      expect(await compliance.rpc("record_listing_review_decision", offerId, "APPROVED", "again", req())).toMatchObject({ ok: false, error: "listing_decision_stale" });
      expect(await compliance.rpc("record_listing_review_decision", offerId, "MAYBE", null, req())).toMatchObject({ ok: false, error: "listing_decision_invalid" });
      for (const userId of [U.finance, U.warehouse, U.buyerA1, U.auditor]) {
        const other = await as(`o${userId.slice(-2)}`, userId);
        expect(await other.rpc("record_listing_review_decision", offerId, "REJECTED", null, req())).toMatchObject({ ok: false, error: "forbidden" });
      }
    });

    it("coordinated publication publishes the Coffee and its APPROVED offer together, or neither", async () => {
      const admin = await as("admin", U.admin);
      const { coffeeId, offerId } = await pendingOffer(admin);
      const compliance = await as("compliance", U.compliance);
      const coffeeRevision = () => coffeeRow(coffeeId)!.revision;

      // Not APPROVED yet: refused, nothing changes.
      expect(await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision(), offerRevision(offerId), req())).toMatchObject({ ok: false, error: "offer_not_approved" });
      expect((await compliance.rpc("record_listing_review_decision", offerId, "APPROVED", null, req())).ok).toBe(true);

      // Injected failure while publishing the offer: the Coffee must stay DRAFT too (single transaction).
      const requestId = req();
      await admin.raw("set f018.fail_at = 'offer_publish';");
      const failed = await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision(), offerRevision(offerId), requestId);
      await admin.raw("set f018.fail_at = '';");
      expect(failed.ok).toBe(false);
      expect(coffeeRow(coffeeId)!.status).toBe("DRAFT");
      expect(workScalar(`select status from public.coffee_offers where id = '${offerId}'`)).toBe("APPROVED");
      expect(countOf("commerce_request_log", `request_id = '${requestId}'`)).toBe(0);

      // Stale revisions are refused; the permitted catalogue-only role without offer authority is refused.
      expect(await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision() - 1, offerRevision(offerId), req())).toMatchObject({ ok: false, error: "revision_conflict" });
      expect(await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision(), offerRevision(offerId) - 1, req())).toMatchObject({ ok: false, error: "revision_conflict" });
      expect(await compliance.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision(), offerRevision(offerId), req())).toMatchObject({ ok: false, error: "forbidden" });
      const finance = await as("finance", U.finance);
      expect(await finance.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision(), offerRevision(offerId), req())).toMatchObject({ ok: false, error: "forbidden" });
      expect(await admin.rpc("publish_coffee_with_approved_offer", coffeeId, W.offers.A, coffeeRevision(), offerRevision(W.offers.A), req())).toMatchObject({ ok: false, error: "coffee_offer_mismatch" });

      const done = (await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision(), offerRevision(offerId), requestId)) as any;
      expect(done.value).toMatchObject({ coffee_status: "PUBLISHED", offer_status: "PUBLISHED", mode: "COORDINATED" });
      expect(await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRevision() - 1, 1, requestId)).toMatchObject({ ok: false, error: "request_payload_conflict" });
      expect(workScalar(`select is_visible::text from public.coffee_offers where id = '${offerId}'`)).toBe("true");
      expect(countOf("listing_status_history", `offer_id = '${offerId}' and new_status = 'PUBLISHED'`)).toBe(1);
      void jsonLine;
    });

    it("a publication readiness failure in the coordinated path leaves both records untouched", async () => {
      const admin = await as("admin", U.admin);
      const { coffeeId, offerId } = await pendingOffer(admin);
      const compliance = await as("compliance", U.compliance);
      expect((await compliance.rpc("record_listing_review_decision", offerId, "APPROVED", null, req())).ok).toBe(true);
      work(`delete from public.coffee_translations where coffee_id = '${coffeeId}' and locale = 'ar'`);
      const attempt = await admin.rpc("publish_coffee_with_approved_offer", coffeeId, offerId, coffeeRow(coffeeId)!.revision, offerRevision(offerId), req());
      expect(attempt).toMatchObject({ ok: false, error: "coffee_not_publish_ready" });
      expect(coffeeRow(coffeeId)!.status).toBe("DRAFT");
      expect(workScalar(`select status from public.coffee_offers where id = '${offerId}'`)).toBe("APPROVED");
    });
  });
});
