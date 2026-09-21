import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Feature 005 T014 / DB-OPEN-19 — DRY-RUN + behaviour proof of `20260921120000_feature_005_db_open_19_inventory_variance_hold.sql`
 * on a THROWAWAY Postgres 15 container (never the live database). GATED: `F005_SCRATCH_DB=1` (needs a running Docker daemon
 * and the `postgres:15` image). It loads `tests/database/f005-scratch/bootstrap.sql` (a faithful stand-in for exactly the
 * objects the migration touches), applies the migration file BYTE-FOR-BYTE, runs the read-only postflight (every row must be
 * ok), then proves the behaviour the live database will have — including REAL concurrency, with separate psql sessions.
 *
 * What it proves: the SQL applies; the model (append-only, one resolution per case, generated variance, derived "open");
 * who may record / resolve (warehouse operators only — members, auditors, anon, service_role's raw INSERT all refused); the
 * PRE-MIGRATION HARDENING decisions (H1 no raw position writes by any product session, while SECURITY DEFINER writers keep
 * working; H2 history can never be erased — ON DELETE RESTRICT, no cascade, no truncate; H3 members never read the operator's
 * reason; H4 an incoming settlement into a held position is refused whole and succeeds after resolution); that an
 * open case freezes reserving / consuming / re-quantifying a position while still allowing RELEASES; the listing and
 * shipment guards; adjustment arithmetic (never below reserved, ledger ADJUSTMENT event, exactly once); stale/duplicate/retry
 * refusals; concurrent resolvers and record-vs-reserve races; cascade cleanup. What it cannot prove: the REAL `checkout_order`,
 * `apply_delivery_reservation`, `admin_review_payment` (their exact UPDATE statements are issued verbatim instead) — the
 * post-approval live proof `F005_LIVE_PROOF=1 npx vitest run tests/inventory` does that against real sessions.
 */
const ENABLED = process.env.F005_SCRATCH_DB === "1";
const CONTAINER = `hills-f005-scratch-${process.pid}`;
// Supabase-hosted projects run Postgres 15-17; the proof is run on both ends (F005_PG_IMAGE=postgres:17 for the newer one).
const IMAGE = process.env.F005_PG_IMAGE ?? "postgres:15";
const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const U = {
  warehouse: "a0000000-0000-4000-8000-000000000001",
  admin: "a0000000-0000-4000-8000-000000000002",
  auditor: "a0000000-0000-4000-8000-000000000003",
  memberA: "a0000000-0000-4000-8000-000000000004",
  memberB: "a0000000-0000-4000-8000-000000000005",
  finance: "a0000000-0000-4000-8000-000000000006",
};
const ORG_A = "b0000000-0000-4000-8000-00000000000a";
const ORG_B = "b0000000-0000-4000-8000-00000000000b";
const WH = "c0000000-0000-4000-8000-000000000001";
const lot = (n: number) => `d0000000-0000-4000-8000-00000000000${n}`;
const pos = (n: number) => `e0000000-0000-4000-8000-00000000000${n}`;

type Result = { out: string; err: string; code: number };

function docker(args: string[], input?: string): Result {
  try {
    const out = execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
    return { out, err: "", code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { out: String(e.stdout ?? ""), err: String(e.stderr ?? ""), code: e.status ?? 1 };
  }
}
const psqlArgs = ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "scratch", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];

/** Runs SQL as the postgres superuser (setup / inspection only). */
function admin(sql: string): Result {
  return docker(psqlArgs, sql);
}
/** Runs SQL as a Supabase-style session: `set role <role>` + the JWT subject `auth.uid()` reads. */
function as(user: string | null, role: "authenticated" | "anon" | "service_role", sql: string): Result {
  const subject = user ? `select set_config('request.jwt.claim.sub', '${user}', false);` : "";
  return docker(psqlArgs, `set role ${role}; ${subject}\n${sql}`);
}
const failed = (r: Result) => r.code !== 0;
const errorOf = (r: Result) => (/ERROR:\s+(.+)/.exec(r.err)?.[1] ?? "").trim();
const value = (r: Result) => r.out.trim();
const json = (r: Result) => JSON.parse(value(r).split("\n").pop() ?? "null");
const num = (sql: string) => Number(value(admin(sql)));

function spawnSession(script: string): Promise<Result> {
  return new Promise((resolvePromise) => {
    const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("close", (code) => resolvePromise({ out, err, code: code ?? 1 }));
    child.stdin.end(script);
  });
}

const record = (user: string, position: string, kind: string, expected: number, counted: number | null, reason = "cycle count") =>
  as(user, "authenticated", `select public.record_inventory_variance('${position}', '${kind}', ${expected}, ${counted === null ? "null" : counted}, '${reason}');`);
const resolveCase = (user: string, variance: string, outcome: string, reason = "recount confirmed") =>
  as(user, "authenticated", `select public.resolve_inventory_variance('${variance}', '${outcome}', '${reason}');`);
const positionRow = (id: string) => admin(`select available_quantity_kg || '/' || reserved_quantity_kg from public.inventory_positions where id = '${id}';`).out.trim();

describe.skipIf(!ENABLED)("DB-OPEN-19 migration — SCRATCH database dry-run and behaviour proof", () => {
  let migration = "";

  beforeAll(() => {
    migration = read("supabase/migrations/20260921120000_feature_005_db_open_19_inventory_variance_hold.sql");
    const started = docker(["run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=scratch", "-e", "POSTGRES_DB=scratch", IMAGE]);
    if (failed(started)) throw new Error(`could not start the scratch Postgres container: ${started.err}`);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = docker(["exec", CONTAINER, "pg_isready", "-U", "postgres", "-d", "scratch"]);
      if (!failed(ready) && admin("select 1;").code === 0) break;
      execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 1000)"]);
    }
    const boot = admin(read("tests/database/f005-scratch/bootstrap.sql"));
    if (failed(boot)) throw new Error(`bootstrap failed: ${boot.err}`);
  }, 240_000);

  afterAll(() => {
    docker(["rm", "-f", CONTAINER]);
  }, 60_000);

  it("0. the migration applies BYTE-FOR-BYTE (its own preflight guard passes) and is refused if applied twice", () => {
    // H1's preflight: refuses to revoke the raw grants while ANY invoker-rights function writes inventory_positions (it would break)
    admin("create function public.t_invoker_writer() returns void language sql as $f$ update public.inventory_positions set updated_at = now() $f$;");
    const blocked = admin(migration);
    expect(failed(blocked)).toBe(true);
    expect(blocked.err).toMatch(/1 SECURITY INVOKER function\(s\) write inventory_positions/);
    admin("drop function public.t_invoker_writer();");
    const applied = admin(migration);
    expect(failed(applied), applied.err).toBe(false);
    const again = admin(migration);
    expect(failed(again)).toBe(true);
    expect(again.err).toMatch(/preflight failed — nothing applied/);
  }, 120_000);

  it("0b. the read-only POSTFLIGHT reports every row ok", () => {
    const result = docker([...psqlArgs.slice(0, -2), "-F", "|", "-v", "ON_ERROR_STOP=1"], read("supabase/maintenance/20260921_feature_005_db_open_19_postflight.sql"));
    expect(failed(result), result.err).toBe(false);
    const rows = value(result).split("\n").map((line) => line.split("|"));
    expect(rows.length).toBeGreaterThanOrEqual(30);
    for (const [name, ok] of rows) expect(ok, name).toBe("t");
  }, 60_000);

  it("0c. seed a small, realistic custody world (setup only)", () => {
    const seed = admin(`
      insert into auth.users (id) values ('${U.warehouse}'), ('${U.admin}'), ('${U.auditor}'), ('${U.memberA}'), ('${U.memberB}'), ('${U.finance}');
      insert into public.profiles (id) values ('${U.warehouse}'), ('${U.admin}'), ('${U.auditor}'), ('${U.memberA}'), ('${U.memberB}'), ('${U.finance}');
      insert into public.organizations (id, display_name) values ('${ORG_A}', 'Org A'), ('${ORG_B}', 'Org B');
      insert into public.organization_members (organization_id, user_id) values ('${ORG_A}', '${U.memberA}'), ('${ORG_B}', '${U.memberB}');
      insert into public.platform_admins (user_id, role) values ('${U.warehouse}', 'WAREHOUSE'), ('${U.admin}', 'ADMIN'), ('${U.auditor}', 'AUDITOR'), ('${U.finance}', 'FINANCE');
      insert into public.warehouses (id, code) values ('${WH}', 'W1');
      insert into public.coffee_lots (id, lot_code) select ('d0000000-0000-4000-8000-00000000000' || n)::uuid, 'LOT' || n from generate_series(1, 9) n;
      insert into public.inventory_positions (id, lot_id, owner_organization_id, warehouse_id, available_quantity_kg, reserved_quantity_kg) values
        ('${pos(1)}', '${lot(1)}', '${ORG_A}', '${WH}', 100, 10),
        ('${pos(2)}', '${lot(2)}', '${ORG_A}', '${WH}', 50, 0),
        ('${pos(3)}', '${lot(3)}', '${ORG_B}', '${WH}', 40, 0),
        ('${pos(4)}', '${lot(4)}', '${ORG_A}', '${WH}', 60, 30),
        ('${pos(5)}', '${lot(5)}', '${ORG_A}', '${WH}', 80, 0),
        ('${pos(6)}', '${lot(6)}', '${ORG_A}', '${WH}', 70, 0),
        ('${pos(7)}', '${lot(7)}', '${ORG_A}', '${WH}', 25, 0);
      -- a listing drafted on pos 1 BEFORE it is held, and one on pos 2 that stays healthy
      insert into public.coffee_offers (id, lot_id, seller_organization_id, warehouse_id, title, status) values
        ('f0000000-0000-4000-8000-000000000001', '${lot(1)}', '${ORG_A}', '${WH}', 'draft on pos1', 'DRAFT'),
        ('f0000000-0000-4000-8000-000000000002', '${lot(1)}', '${ORG_A}', '${WH}', 'approved on pos1', 'APPROVED'),
        ('f0000000-0000-4000-8000-000000000003', '${lot(1)}', '${ORG_A}', '${WH}', 'published on pos1', 'PUBLISHED');
      -- a settled purchase of lot 1 held by ORG_A with a shipment plan
      insert into public.orders (id, buyer_organization_id) values ('11000000-0000-4000-8000-000000000001', '${ORG_A}'), ('11000000-0000-4000-8000-000000000002', '${ORG_B}');
      insert into public.order_items (id, order_id, lot_id) values ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '${lot(1)}'), ('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', '${lot(3)}');
      insert into public.storage_allocations (order_item_id, owner_organization_id, lot_id, warehouse_id, quantity_kg) values ('12000000-0000-4000-8000-000000000001', '${ORG_A}', '${lot(1)}', '${WH}', 10), ('12000000-0000-4000-8000-000000000002', '${ORG_B}', '${lot(3)}', '${WH}', 5);
      insert into public.order_shipments (id, order_id, status) values ('13000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'DRAFT'), ('13000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'DRAFT'), ('13000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002', 'DRAFT');
      insert into public.shipment_items (shipment_id, order_item_id) values ('13000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001'), ('13000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001'), ('13000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000002');
    `);
    expect(failed(seed), seed.err).toBe(false);
  }, 60_000);

  let case1 = "";

  it("1. AUTHORIZATION — only a warehouse operator may record; a member, an auditor, a finance operator and anon are refused; raw writes are impossible for everyone", () => {
    for (const user of [U.memberA, U.auditor, U.finance]) {
      const attempt = record(user, pos(1), "VARIANCE", 100, 92);
      expect(errorOf(attempt), user).toBe("forbidden");
    }
    const anon = as(null, "anon", `select public.record_inventory_variance('${pos(1)}', 'VARIANCE', 100, 92, 'x');`);
    expect(errorOf(anon)).toMatch(/permission denied/);
    // No INSERT/UPDATE/DELETE privilege at all for authenticated (including the warehouse operator), nothing for anon
    for (const user of [U.warehouse, U.admin]) {
      const insert = as(user, "authenticated", `insert into public.inventory_variance_events (id, event_type, variance_id, inventory_position_id, warehouse_id, kind, recorded_quantity_kg, counted_quantity_kg, reason, actor_user_id, correlation_id) values (gen_random_uuid(), 'RECORDED', gen_random_uuid(), '${pos(1)}', '${WH}', 'HOLD', 1, 1, 'x', '${user}', gen_random_uuid());`);
      expect(errorOf(insert), user).toMatch(/permission denied/);
    }
    // The owner (postgres) hits the append-only trigger; service_role (which bypasses RLS) no longer holds ANY write privilege (H2)
    const rawInsert = `insert into public.inventory_variance_events (id, event_type, variance_id, inventory_position_id, warehouse_id, kind, recorded_quantity_kg, counted_quantity_kg, reason, actor_user_id, correlation_id) values ('90000000-0000-4000-8000-000000000001', 'RECORDED', '90000000-0000-4000-8000-000000000001', '${pos(1)}', '${WH}', 'HOLD', 100, 100, 'x', '${U.warehouse}', gen_random_uuid());`;
    expect(errorOf(admin(rawInsert)), "postgres").toBe("inventory_variance_events_is_append_only");
    expect(errorOf(as(null, "service_role", rawInsert)), "service_role").toMatch(/permission denied/);
    expect(num("select count(*) from public.inventory_variance_events;")).toBe(0);
  }, 120_000);

  it("2. RECORD a variance — the position keeps its quantities, the case is derived open, the difference is computed by the database, and bad input is refused", () => {
    for (const [expected, counted, reason, code] of [
      [99, 92, "x", "variance_stale_position"],
      [100, 100, "x", "variance_quantity_zero"],
      [100, -1, "x", "variance_quantity_invalid"],
      [100, 92, "   ", "variance_reason_required"],
    ] as const) {
      expect(errorOf(record(U.warehouse, pos(1), "VARIANCE", expected, counted, reason)), code).toBe(code);
    }
    expect(errorOf(record(U.warehouse, pos(1), "HOLD", 100, 90))).toBe("variance_quantity_not_applicable");
    expect(errorOf(record(U.warehouse, pos(1), "NOPE", 100, null))).toBe("variance_kind_invalid");
    expect(errorOf(record(U.warehouse, "e0000000-0000-4000-8000-0000000000ff", "HOLD", 1, null))).toBe("variance_position_not_found");

    const before = positionRow(pos(1));
    const recorded = record(U.warehouse, pos(1), "VARIANCE", 100, 92, "cycle count: 8 kg short");
    expect(failed(recorded), recorded.err).toBe(false);
    const result = json(recorded);
    case1 = result.variance_id;
    expect(result).toMatchObject({ kind: "VARIANCE", recorded_quantity_kg: 100, counted_quantity_kg: 92, inventory_position_id: pos(1) });
    expect(positionRow(pos(1))).toBe(before); // recording freezes; it never changes a quantity
    expect(admin(`select variance_quantity_kg from public.inventory_variance_events where id = '${case1}';`).out.trim()).toBe("-8");
    expect(num(`select count(*) from public.inventory_open_cases where inventory_position_id = '${pos(1)}';`)).toBe(1);
    // the audit trail carries the case's correlation id
    expect(num(`select count(*) from public.audit_logs where entity_type = 'inventory_variance_events' and correlation_id = '${result.correlation_id}';`)).toBe(1);
    // a second OPEN case on the same position is refused
    expect(errorOf(record(U.admin, pos(1), "HOLD", 100, null))).toBe("variance_already_open");
  }, 240_000);

  it("3. READ boundaries (H3) — operators and auditors read the full history incl. the reason; the owning member reads ONLY the reason-free notice; another organization and anon see nothing", () => {
    const count = (user: string | null, role: "authenticated" | "anon", table: string) => value(as(user, role, `select count(*) from public.${table};`)).split("\n").pop();
    for (const table of ["inventory_position_holds", "inventory_variance_events"]) {
      expect(count(U.warehouse, "authenticated", table), `warehouse ${table}`).toBe("1");
      expect(count(U.auditor, "authenticated", table), `auditor ${table}`).toBe("1");
      // a member has no path to the operator's history — the base table and the full view both return nothing
      expect(count(U.memberA, "authenticated", table), `memberA ${table}`).toBe("0");
      expect(count(U.memberB, "authenticated", table), `memberB ${table}`).toBe("0");
      expect(errorOf(as(null, "anon", `select count(*) from public.${table};`)), `anon ${table}`).toMatch(/permission denied/);
    }
    // the INTERNAL one-definition view has no client grant at all
    expect(errorOf(as(U.warehouse, "authenticated", "select count(*) from public.inventory_open_cases;"))).toMatch(/permission denied/);
    expect(errorOf(as(U.memberA, "authenticated", "select count(*) from public.inventory_open_cases;"))).toMatch(/permission denied/);
    // the member-facing notice: the owner sees exactly its own case, another organization none, anon is refused
    expect(count(U.memberA, "authenticated", "inventory_position_hold_notices")).toBe("1");
    expect(count(U.memberB, "authenticated", "inventory_position_hold_notices")).toBe("0");
    expect(errorOf(as(null, "anon", "select count(*) from public.inventory_position_hold_notices;"))).toMatch(/permission denied/);
    // ...and it has no reason / actor / correlation column to read, in any way it can be asked for
    for (const column of ["reason", "actor_user_id", "correlation_id"]) {
      expect(errorOf(as(U.memberA, "authenticated", `select ${column} from public.inventory_position_hold_notices;`)), column).toMatch(/does not exist/);
    }
    expect(errorOf(as(U.memberA, "authenticated", "select * from public.inventory_position_hold_notices where reason is not null;"))).toMatch(/does not exist/);
    const noticeColumns = value(as(U.memberA, "authenticated", "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'inventory_position_hold_notices';")).split("\n").pop();
    expect(noticeColumns).toBe("variance_id,inventory_position_id,kind,recorded_quantity_kg,counted_quantity_kg,variance_quantity_kg,recorded_at");
    // the operator's reason is genuinely stored, and readable by an operator and an auditor only
    expect(value(as(U.warehouse, "authenticated", `select reason from public.inventory_variance_events where id = '${case1}';`)).split("\n").pop()).toBe("cycle count: 8 kg short");
    expect(value(as(U.auditor, "authenticated", `select reason from public.inventory_variance_events where id = '${case1}';`)).split("\n").pop()).toBe("cycle count: 8 kg short");
    expect(value(as(U.memberA, "authenticated", `select count(*) from public.inventory_variance_events where reason ilike '%cycle%';`)).split("\n").pop()).toBe("0"); // no probing by predicate either
  }, 120_000);

  it("4. NON-ACTIONABLE — while the case is open nothing may reserve from, consume, or re-quantify the position (checkout, delivery reservation, settlement, delivery, title-in, raw warehouse UPDATE)", () => {
    const attempts: Array<[string, string]> = [
      ["new checkout / delivery reservation (reserved +5)", `update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + 5, updated_at = now() where id = '${pos(1)}';`],
      ["settlement / delivery consumption (available -5, reserved -5)", `update public.inventory_positions set available_quantity_kg = available_quantity_kg - 5, reserved_quantity_kg = reserved_quantity_kg - 5, updated_at = now() where id = '${pos(1)}';`],
      ["title transfer in (available +5)", `update public.inventory_positions set available_quantity_kg = available_quantity_kg + 5, updated_at = now() where id = '${pos(1)}';`],
      ["identity change (owner)", `update public.inventory_positions set owner_organization_id = '${ORG_B}' where id = '${pos(1)}';`],
    ];
    for (const [label, sql] of attempts) {
      expect(errorOf(admin(sql)), label).toBe("inventory_position_held");
    }
    // A raw UPDATE by a warehouse-operator SESSION (the pre-existing `inventory_warehouse_write` path) no longer even reaches the guard (H1)
    expect(errorOf(as(U.warehouse, "authenticated", `update public.inventory_positions set available_quantity_kg = 92 where id = '${pos(1)}';`))).toMatch(/permission denied for table inventory_positions/);
    // ...while service_role (fixture / maintenance tooling) is still frozen by the open-case guard
    expect(errorOf(as(null, "service_role", `update public.inventory_positions set available_quantity_kg = 92 where id = '${pos(1)}';`))).toBe("inventory_position_held");
    expect(positionRow(pos(1))).toBe("100/10");

    // Still allowed: releasing a reservation (expiry / cancellation) and pure bookkeeping — held stock never traps a reservation
    expect(failed(admin(`update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg - 3, updated_at = now() where id = '${pos(1)}';`))).toBe(false);
    expect(positionRow(pos(1))).toBe("100/7");
    expect(failed(admin(`update public.inventory_positions set updated_at = now() where id = '${pos(1)}';`))).toBe(false);
    // Unaffected positions keep working exactly as before
    expect(failed(admin(`update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + 5 where id = '${pos(2)}';`))).toBe(false);
    expect(failed(admin(`update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg - 5 where id = '${pos(2)}';`))).toBe(false);
  }, 240_000);

  it("5. LISTINGS — a listing cannot be created, submitted, approved or published on the affected position; withdrawals stay allowed; other positions are unaffected", () => {
    const insertOffer = (lotN: number, status = "DRAFT") => admin(`insert into public.coffee_offers (lot_id, seller_organization_id, warehouse_id, title, status) values ('${lot(lotN)}', '${ORG_A}', '${WH}', 'new', '${status}');`);
    expect(errorOf(insertOffer(1))).toBe("inventory_position_held");
    expect(errorOf(insertOffer(1, "PUBLISHED"))).toBe("inventory_position_held");
    expect(failed(insertOffer(2))).toBe(false); // pos 2 is healthy
    const move = (offer: string, to: string) => admin(`update public.coffee_offers set status = '${to}' where id = 'f0000000-0000-4000-8000-00000000000${offer}';`);
    expect(errorOf(move("1", "PENDING_REVIEW"))).toBe("inventory_position_held"); // submit
    expect(errorOf(move("2", "PUBLISHED"))).toBe("inventory_position_held"); // publish
    expect(errorOf(move("2", "APPROVED"))).toBe(""); // no change of status → not a transition (already APPROVED)
    // reducing exposure is allowed
    expect(failed(move("3", "SUSPENDED"))).toBe(false);
    expect(failed(move("2", "ARCHIVED"))).toBe(false);
    expect(failed(move("1", "ARCHIVED"))).toBe(false);
  }, 120_000);

  it("6. DELIVERY — a delivery cannot be requested or progressed against the affected position; cancelling stays allowed; another owner's shipment is unaffected", () => {
    const ship = (id: string, to: string) => admin(`update public.order_shipments set status = '${to}' where id = '13000000-0000-4000-8000-00000000000${id}';`);
    expect(errorOf(ship("1", "REQUESTED"))).toBe("inventory_position_held");
    expect(errorOf(ship("1", "RESERVED"))).toBe("inventory_position_held");
    expect(errorOf(ship("1", "DISPATCHED"))).toBe("inventory_position_held");
    expect(failed(ship("1", "CANCELLED"))).toBe(false);
    expect(failed(ship("3", "REQUESTED"))).toBe(false); // lot 3 / ORG_B is healthy
  }, 120_000);

  it("7. RESOLVE — authorization: only a warehouse operator; members, auditors, finance and anon are refused; nothing changes", () => {
    for (const user of [U.memberA, U.auditor, U.finance]) {
      expect(errorOf(resolveCase(user, case1, "RELEASED")), user).toBe("forbidden");
    }
    expect(errorOf(as(null, "anon", `select public.resolve_inventory_variance('${case1}', 'RELEASED', 'x');`))).toMatch(/permission denied/);
    expect(errorOf(resolveCase(U.warehouse, "90000000-0000-4000-8000-0000000000ff", "RELEASED"))).toBe("variance_not_found");
    expect(errorOf(resolveCase(U.warehouse, case1, "MAYBE"))).toBe("variance_outcome_invalid");
    expect(errorOf(resolveCase(U.warehouse, case1, "RELEASED", " "))).toBe("variance_reason_required");
    expect(num(`select count(*) from public.inventory_open_cases where variance_id = '${case1}';`)).toBe(1);
    expect(positionRow(pos(1))).toBe("100/7");
  }, 120_000);

  it("8. ADJUST — the position takes exactly the counted quantity, ONE ledger ADJUSTMENT event and ONE RESOLVED row are appended, the original observation is untouched, and the position is actionable again", () => {
    const original = admin(`select id, event_type, recorded_quantity_kg, counted_quantity_kg, reason, actor_user_id, created_at from public.inventory_variance_events where id = '${case1}';`).out;
    const eventsBefore = num("select count(*) from public.inventory_ownership_events;");
    const resolved = resolveCase(U.admin, case1, "ADJUSTED", "shortage confirmed by recount");
    expect(failed(resolved), resolved.err).toBe(false);
    expect(json(resolved)).toMatchObject({ outcome: "ADJUSTED", recorded_quantity_kg: 100, resolved_quantity_kg: 92 });

    expect(positionRow(pos(1))).toBe("92/7");
    expect(num("select count(*) from public.inventory_ownership_events;") - eventsBefore).toBe(1);
    const ledger = admin(`select event_type || '|' || quantity_kg || '|' || coalesce(from_organization_id::text, 'null') || '|' || to_organization_id || '|' || created_by from public.inventory_ownership_events where lot_id = '${lot(1)}' order by created_at desc limit 1;`).out.trim();
    expect(ledger).toBe(`ADJUSTMENT|8|${ORG_A}|${ORG_A}|${U.admin}`); // shortage: leaves the owner
    // H3: the member-visible ledger carries a fixed, member-safe reason — never the operator's free text (that stays in the history)
    const ledgerReason = admin(`select reason from public.inventory_ownership_events where lot_id = '${lot(1)}' and event_type = 'ADJUSTMENT' order by created_at desc limit 1;`).out.trim();
    expect(ledgerReason).toBe("Warehouse stock count adjustment (shortage, recorded 100 kg, counted 92 kg)");
    expect(ledgerReason).not.toContain("shortage confirmed by recount");
    expect(admin(`select reason from public.inventory_variance_events where variance_id = '${case1}' and event_type = 'RESOLVED';`).out.trim()).toBe("shortage confirmed by recount");
    // the ledger row and the case history share one correlation id, so the full reason is traceable by an operator / auditor
    expect(num(`select count(distinct correlation_id) from (select correlation_id from public.inventory_ownership_events where lot_id = '${lot(1)}' and event_type = 'ADJUSTMENT' union all select correlation_id from public.inventory_variance_events where variance_id = '${case1}') t;`)).toBe(1);
    expect(num(`select count(*) from public.inventory_variance_events where variance_id = '${case1}';`)).toBe(2);
    expect(admin(`select id, event_type, recorded_quantity_kg, counted_quantity_kg, reason, actor_user_id, created_at from public.inventory_variance_events where id = '${case1}';`).out).toBe(original);
    expect(num(`select count(*) from public.inventory_open_cases where inventory_position_id = '${pos(1)}';`)).toBe(0);
    // actionable again: the previously refused writes now work
    expect(failed(admin(`update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + 5 where id = '${pos(1)}';`))).toBe(false);
    expect(positionRow(pos(1))).toBe("92/12");
  }, 240_000);

  it("9. EXACTLY ONCE — a retry / duplicate resolution changes nothing: quantity, ledger and history are identical afterwards", () => {
    const snapshot = () => [positionRow(pos(1)), num("select count(*) from public.inventory_ownership_events;"), num(`select count(*) from public.inventory_variance_events where variance_id = '${case1}';`)];
    const before = snapshot();
    for (const outcome of ["ADJUSTED", "RELEASED", "ADJUSTED"]) {
      expect(errorOf(resolveCase(U.warehouse, case1, outcome)), outcome).toBe("variance_already_resolved");
    }
    expect(snapshot()).toEqual(before);
    // the database itself also refuses a second RESOLVED row, whatever the callers do
    const direct = admin(`select set_config('app.inventory_variance_write', 'true', false); insert into public.inventory_variance_events (id, event_type, variance_id, inventory_position_id, warehouse_id, kind, recorded_quantity_kg, counted_quantity_kg, outcome, resolved_quantity_kg, reason, actor_user_id, correlation_id) values (gen_random_uuid(), 'RESOLVED', '${case1}', '${pos(1)}', '${WH}', 'VARIANCE', 100, 92, 'RELEASED', 92, 'dup', '${U.warehouse}', gen_random_uuid());`);
    expect(direct.err).toMatch(/inventory_variance_events_single_resolution_idx/);
  }, 120_000);

  it("10. HOLD / QUARANTINE — a hold carries no count difference, can only be RELEASED (never adjusted), and a released position is actionable with quantities untouched", () => {
    const held = json(record(U.warehouse, pos(2), "QUARANTINE", 50, null, "suspected moisture damage — quarantined"));
    expect(held).toMatchObject({ kind: "QUARANTINE", recorded_quantity_kg: 50, counted_quantity_kg: 50 });
    expect(errorOf(admin(`update public.inventory_positions set reserved_quantity_kg = 5 where id = '${pos(2)}';`))).toBe("inventory_position_held");
    expect(errorOf(resolveCase(U.warehouse, held.variance_id, "ADJUSTED"))).toBe("variance_adjustment_not_applicable");
    expect(positionRow(pos(2))).toBe("50/0");
    const events = num("select count(*) from public.inventory_ownership_events;");
    const released = resolveCase(U.warehouse, held.variance_id, "RELEASED", "QC passed");
    expect(json(released)).toMatchObject({ outcome: "RELEASED", resolved_quantity_kg: 50 });
    expect(positionRow(pos(2))).toBe("50/0");
    expect(num("select count(*) from public.inventory_ownership_events;")).toBe(events); // a release moves no stock, writes no ledger event
    expect(failed(admin(`update public.inventory_positions set reserved_quantity_kg = 5 where id = '${pos(2)}';`))).toBe(false);
    const plainHold = json(record(U.warehouse, pos(2), "HOLD", 50, null, "documents pending"));
    expect(plainHold.kind).toBe("HOLD");
    expect(json(resolveCase(U.warehouse, plainHold.variance_id, "RELEASED", "documents received")).outcome).toBe("RELEASED");
  }, 240_000);

  it("10b. H1 — no product session can write a custody position directly, but every legitimate SECURITY DEFINER writer shape keeps working; service_role tooling is unchanged", () => {
    // raw INSERT / UPDATE / DELETE by a warehouse operator, an admin, a member and anon — none reaches the table
    for (const user of [U.warehouse, U.admin, U.memberA]) {
      expect(errorOf(as(user, "authenticated", `update public.inventory_positions set available_quantity_kg = 1 where id = '${pos(5)}';`)), `update ${user}`).toMatch(/permission denied for table inventory_positions/);
      expect(errorOf(as(user, "authenticated", `update public.inventory_positions set reserved_quantity_kg = 0 where id = '${pos(5)}';`)), `reserve ${user}`).toMatch(/permission denied for table inventory_positions/);
      expect(errorOf(as(user, "authenticated", `insert into public.inventory_positions (lot_id, owner_organization_id, warehouse_id, available_quantity_kg) values ('${lot(8)}', '${ORG_A}', '${WH}', 999);`)), `insert ${user}`).toMatch(/permission denied for table inventory_positions/);
      expect(errorOf(as(user, "authenticated", `delete from public.inventory_positions where id = '${pos(5)}';`)), `delete ${user}`).toMatch(/permission denied for table inventory_positions/);
    }
    expect(errorOf(as(null, "anon", `update public.inventory_positions set available_quantity_kg = 1 where id = '${pos(5)}';`))).toMatch(/permission denied/);
    expect(positionRow(pos(5))).toBe("80/0");
    // members and operators still READ positions exactly as before (the policies are untouched)
    expect(value(as(U.memberA, "authenticated", "select count(*) from public.inventory_positions;")).split("\n").pop()).not.toBe("0");
    expect(value(as(U.warehouse, "authenticated", "select count(*) from public.inventory_positions;")).split("\n").pop()).not.toBe("0");

    // The legitimate writers (checkout_order, expire_order_hold, admin_review_payment, apply_delivery_reservation, the shipment triggers) are
    // SECURITY DEFINER functions owned by the migration role. Model one with the same shape: called by a plain member session, it must still
    // reserve and release — H1 must not break them.
    const created = admin(`create function public.t_definer_reserve(p uuid, q numeric) returns void language plpgsql security definer set search_path = pg_catalog, public as $f$ begin update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + q, updated_at = now() where id = p; end $f$; grant execute on function public.t_definer_reserve(uuid, numeric) to authenticated;`);
    expect(failed(created), created.err).toBe(false);
    expect(failed(as(U.memberB, "authenticated", `select public.t_definer_reserve('${pos(5)}', 2);`))).toBe(false);
    expect(positionRow(pos(5))).toBe("80/2");
    expect(failed(as(U.memberB, "authenticated", `select public.t_definer_reserve('${pos(5)}', -2);`))).toBe(false);
    expect(positionRow(pos(5))).toBe("80/0");
    // ...and a definer writer is still stopped by the open-case freeze (a held position, via the guard trigger)
    const held = json(record(U.warehouse, pos(5), "HOLD", 80, null, "documents pending"));
    expect(errorOf(as(U.memberB, "authenticated", `select public.t_definer_reserve('${pos(5)}', 1);`))).toBe("inventory_position_held");
    expect(json(resolveCase(U.warehouse, held.variance_id, "RELEASED", "documents received")).outcome).toBe("RELEASED");
    admin("drop function public.t_definer_reserve(uuid, numeric);");

    // service_role (fixtures / maintenance) keeps its grants on positions — only the frozen-position rule applies to it
    expect(failed(as(null, "service_role", `update public.inventory_positions set updated_at = now() where id = '${pos(5)}';`))).toBe(false);
  }, 240_000);

  it("10c. H4 — an INCOMING title transfer into a held position is refused whole (the seller's side rolls back with it) and succeeds once the case is resolved", () => {
    const held = json(record(U.warehouse, pos(2), "HOLD", 50, null, "buyer-side mismatch under review"));
    // one transaction, exactly the shape of settlement: the seller's position gives, the buyer's held position receives
    const settle = () => admin(`begin; update public.inventory_positions set available_quantity_kg = available_quantity_kg - 5, updated_at = now() where id = '${pos(5)}'; update public.inventory_positions set available_quantity_kg = available_quantity_kg + 5, updated_at = now() where id = '${pos(2)}'; commit;`);
    expect(errorOf(settle())).toBe("inventory_position_held");
    expect(positionRow(pos(5))).toBe("80/0"); // the seller's decrement rolled back with the refused increment
    expect(positionRow(pos(2))).toBe("50/5"); // (test 10 left 5 kg reserved on pos 2)
    // the case can still be resolved against exactly what it recorded (the pin is what makes that safe), then the same settlement goes through
    expect(json(resolveCase(U.warehouse, held.variance_id, "RELEASED", "mismatch explained")).outcome).toBe("RELEASED");
    expect(failed(settle())).toBe(false);
    expect(positionRow(pos(5))).toBe("75/0");
    expect(positionRow(pos(2))).toBe("55/5");
  }, 240_000);

  it("11. NEVER NEGATIVE / NEVER STRANDED — an adjustment below the reserved quantity is refused; a surplus enters the ledger from no organization; the database's own checks reject impossible rows", () => {
    // pos 4: available 60, reserved 30 — counting 20 would strand 10 kg of active reservation
    const short = json(record(U.warehouse, pos(4), "VARIANCE", 60, 20, "big shortage"));
    expect(errorOf(resolveCase(U.warehouse, short.variance_id, "ADJUSTED"))).toBe("variance_adjustment_below_reserved");
    expect(positionRow(pos(4))).toBe("60/30");
    // ...but the operator can RELEASE the hold without changing stock (recount rejected), or wait for the reservation to release
    expect(failed(admin(`update public.inventory_positions set reserved_quantity_kg = 15 where id = '${pos(4)}';`))).toBe(false); // release allowed while held
    expect(json(resolveCase(U.warehouse, short.variance_id, "ADJUSTED", "reservations released first")).resolved_quantity_kg).toBe(20);
    expect(positionRow(pos(4))).toBe("20/15");
    // pos 5: a surplus (80 → 95): from NULL to the owner
    // (pos 5 held 80 kg originally; the H4 settlement above moved 5 kg out of it, so its current quantity is 75 kg)
    const surplus = json(record(U.warehouse, pos(5), "VARIANCE", 75, 90, "found 15 kg extra"));
    resolveCase(U.warehouse, surplus.variance_id, "ADJUSTED", "surplus confirmed");
    expect(positionRow(pos(5))).toBe("90/0");
    expect(admin(`select event_type || '|' || quantity_kg || '|' || coalesce(from_organization_id::text, 'null') from public.inventory_ownership_events where lot_id = '${lot(5)}' order by created_at desc limit 1;`).out.trim()).toBe("ADJUSTMENT|15|null");
    // The table's own CHECKs reject impossible rows even for a superuser who sets the write flag
    const impossible = (columns: string) => admin(`select set_config('app.inventory_variance_write', 'true', false); ${columns}`);
    const base = (id: string, extra: string) => `insert into public.inventory_variance_events (id, event_type, variance_id, inventory_position_id, warehouse_id, kind, recorded_quantity_kg, counted_quantity_kg, reason, actor_user_id, correlation_id${extra.split("|")[0]}) values ('${id}', 'RECORDED', '${id}', '${pos(7)}', '${WH}', ${extra.split("|")[1]});`;
    expect(impossible(base("91000000-0000-4000-8000-000000000001", "|'VARIANCE', 25, -1, 'x', '" + U.warehouse + "', gen_random_uuid()")).err).toMatch(/counted_quantity_check/);
    expect(impossible(base("91000000-0000-4000-8000-000000000002", "|'VARIANCE', -5, 3, 'x', '" + U.warehouse + "', gen_random_uuid()")).err).toMatch(/recorded_quantity_check/);
    expect(impossible(base("91000000-0000-4000-8000-000000000003", "|'VARIANCE', 25, 25, 'x', '" + U.warehouse + "', gen_random_uuid()")).err).toMatch(/kind_quantities_check/);
    expect(impossible(base("91000000-0000-4000-8000-000000000004", "|'HOLD', 25, 20, 'x', '" + U.warehouse + "', gen_random_uuid()")).err).toMatch(/kind_quantities_check/);
    expect(impossible(base("91000000-0000-4000-8000-000000000005", "|'HOLD', 25, 25, '', '" + U.warehouse + "', gen_random_uuid()")).err).toMatch(/reason_check/);
    expect(num("select count(*) from public.inventory_open_cases;")).toBe(0);
  }, 300_000);

  it("12. STALE — resolving against a position whose quantity moved since the case was recorded is refused (forced here by disabling the freeze trigger as a superuser)", () => {
    const stale = json(record(U.warehouse, pos(6), "VARIANCE", 70, 65, "count"));
    admin("alter table public.inventory_positions disable trigger trg_inventory_positions_hold_guard;");
    admin(`update public.inventory_positions set available_quantity_kg = 71 where id = '${pos(6)}';`);
    admin("alter table public.inventory_positions enable trigger trg_inventory_positions_hold_guard;");
    expect(errorOf(resolveCase(U.warehouse, stale.variance_id, "ADJUSTED"))).toBe("variance_stale_position");
    expect(positionRow(pos(6))).toBe("71/0");
    // the operator's stale RECORD is refused the same way
    expect(errorOf(record(U.warehouse, pos(3), "HOLD", 39, null))).toBe("variance_stale_position");
    // put the case back into a resolvable state for the concurrency test
    admin("alter table public.inventory_positions disable trigger trg_inventory_positions_hold_guard;");
    admin(`update public.inventory_positions set available_quantity_kg = 70 where id = '${pos(6)}';`);
    admin("alter table public.inventory_positions enable trigger trg_inventory_positions_hold_guard;");
    expect(json(resolveCase(U.warehouse, stale.variance_id, "RELEASED", "stale case released after re-check")).outcome).toBe("RELEASED");
  }, 240_000);

  it("13. CONCURRENCY — two resolvers racing on one case: exactly one succeeds, the quantity changes once, one ledger event, one RESOLVED row", async () => {
    const raced = json(record(U.warehouse, pos(7), "VARIANCE", 25, 21, "count"));
    const resolveScript = (user: string) => `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false); select public.resolve_inventory_variance('${raced.variance_id}', 'ADJUSTED', 'race');`;
    const events = num("select count(*) from public.inventory_ownership_events;");
    const results = await Promise.all([spawnSession(resolveScript(U.warehouse)), spawnSession(resolveScript(U.admin)), spawnSession(resolveScript(U.warehouse))]);
    const wins = results.filter((r) => r.code === 0);
    const losses = results.filter((r) => r.code !== 0);
    expect(wins).toHaveLength(1);
    expect(losses.every((r) => /variance_already_resolved/.test(r.err))).toBe(true);
    expect(positionRow(pos(7))).toBe("21/0");
    expect(num("select count(*) from public.inventory_ownership_events;") - events).toBe(1);
    expect(num(`select count(*) from public.inventory_variance_events where variance_id = '${raced.variance_id}' and event_type = 'RESOLVED';`)).toBe(1);
  }, 240_000);

  it("14. CONCURRENCY — a reservation racing the recording of a hold cannot slip through: the reserver waits on the position lock and is refused once the case commits", async () => {
    const recorder = spawnSession(`set role authenticated; select set_config('request.jwt.claim.sub', '${U.warehouse}', false); begin; select public.record_inventory_variance('${pos(3)}', 'HOLD', 40, null, 'race'); select pg_sleep(2.5); commit;`);
    await new Promise((r) => setTimeout(r, 1200));
    // the writers reserve with `select ... for update` then UPDATE (checkout_order / apply_delivery_reservation)
    const reserver = await spawnSession(`begin; select id from public.inventory_positions where id = '${pos(3)}' for update; update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + 1, updated_at = now() where id = '${pos(3)}'; commit;`);
    const recorded = await recorder;
    expect(recorded.code, recorded.err).toBe(0);
    expect(reserver.code).not.toBe(0);
    expect(reserver.err).toMatch(/inventory_position_held/);
    expect(positionRow(pos(3))).toBe("40/0");
    expect(num(`select count(*) from public.inventory_open_cases where inventory_position_id = '${pos(3)}';`)).toBe(1);
  }, 240_000);

  it("15. APPEND-ONLY / NEVER ERASED (H2) — no update, delete or truncate of any history row by any role; a position with case history cannot be deleted (no cascade); a position without history still can by maintenance tooling", () => {
    for (const sql of [
      `update public.inventory_variance_events set reason = 'edited' where id = '${case1}';`,
      `update public.inventory_variance_events set counted_quantity_kg = 1 where id = '${case1}';`,
      `delete from public.inventory_variance_events where id = '${case1}';`,
      "delete from public.inventory_variance_events;",
      "truncate public.inventory_variance_events;",
    ]) {
      // the owner reaches the append-only trigger (row or statement level)...
      expect(errorOf(admin(sql)), sql).toMatch(/inventory_variance_events_is_append_only/);
      // ...service_role, which bypasses RLS, holds no write privilege at all
      expect(errorOf(as(null, "service_role", sql)), `service_role ${sql}`).toMatch(/permission denied/);
      // ...and neither does any authenticated session, operators included
      for (const user of [U.warehouse, U.admin]) expect(errorOf(as(user, "authenticated", sql)), `${user} ${sql}`).toMatch(/permission denied/);
    }
    expect(errorOf(admin(`delete from public.inventory_ownership_events where lot_id = '${lot(1)}';`))).toBe("inventory_ownership_events_is_append_only");
    const total = num("select count(*) from public.inventory_variance_events;");
    expect(total).toBeGreaterThanOrEqual(10);

    // NO CASCADE: deleting a position that has case history fails at the foreign key — for the owner and for service_role alike
    const forPosition = num(`select count(*) from public.inventory_variance_events where inventory_position_id = '${pos(2)}';`);
    expect(forPosition).toBeGreaterThan(0);
    const fkViolation = /violates foreign key constraint "inventory_variance_events_inventory_position_id_fkey"/;
    expect(admin(`delete from public.inventory_positions where id = '${pos(2)}';`).err).toMatch(fkViolation);
    expect(as(null, "service_role", `delete from public.inventory_positions where id = '${pos(2)}';`).err).toMatch(fkViolation);
    expect(num("select count(*) from public.inventory_variance_events;")).toBe(total);
    expect(num(`select count(*) from public.inventory_positions where id = '${pos(2)}';`)).toBe(1);
    // a case row cannot be removed by deleting its own RECORDED parent either (self-FK is RESTRICT too)
    const fkTypes = admin("select string_agg(confdeltype::text, ',') from pg_constraint where conrelid = 'public.inventory_variance_events'::regclass and contype = 'f' and confrelid in ('public.inventory_variance_events'::regclass, 'public.inventory_positions'::regclass);").out.trim();
    expect(fkTypes).toBe("r,r");
    // a disposable position that NEVER had a case is still removable by maintenance tooling (service_role has DELETE on positions)
    admin(`insert into public.inventory_positions (id, lot_id, owner_organization_id, warehouse_id, available_quantity_kg) values ('${pos(8)}', '${lot(8)}', '${ORG_A}', '${WH}', 1);`);
    expect(failed(as(null, "service_role", `delete from public.inventory_positions where id = '${pos(8)}';`))).toBe(false);
  }, 240_000);

  it("16. the migration touches nothing it should not: every pre-existing object still has exactly its original policies, triggers and grants", () => {
    const policies = admin("select string_agg(tablename || '.' || policyname || ':' || cmd, ',' order by tablename, policyname) from pg_policies where schemaname = 'public' and tablename <> 'inventory_variance_events';").out.trim();
    expect(policies).toBe("inventory_ownership_events.ownership_admin:SELECT,inventory_positions.inventory_owner_read:SELECT,inventory_positions.inventory_warehouse_write:ALL");
    const triggers = admin("select string_agg(c.relname || '.' || t.tgname, ',' order by c.relname, t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgname not like 'RI_%';").out.trim();
    expect(triggers).toBe(
      [
        "coffee_offers.trg_coffee_offers_inventory_hold_guard",
        "inventory_ownership_events.trg_audit_ownership_events",
        "inventory_ownership_events.trg_ownership_events_append_only",
        "inventory_positions.trg_audit_inventory_positions",
        "inventory_positions.trg_inventory_location",
        "inventory_positions.trg_inventory_positions_hold_guard",
        "inventory_positions.trg_positions_updated_at",
        "inventory_variance_events.trg_audit_inventory_variance_events",
        "inventory_variance_events.trg_inventory_variance_events_append_only",
        "inventory_variance_events.trg_inventory_variance_events_no_truncate",
        "order_shipments.trg_order_shipments_inventory_hold_guard",
      ].join(",")
    );
    // the only pre-existing grant that changed: authenticated's INSERT/UPDATE on inventory_positions (H1); SELECT and everything else is intact
    const grants = admin("select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_positions' and grantee = 'authenticated';").out.trim();
    expect(grants).toBe("REFERENCES,SELECT,TRIGGER");
  }, 60_000);

  it("17. ROLLBACK — the paired rollback is refused while any case exists (it would destroy the accountability record), and cleanly removes the capability when the table is empty", () => {
    const refused = admin(read("supabase/rollback/20260921120000_feature_005_db_open_19_inventory_variance_hold.rollback.sql"));
    expect(refused.err).toMatch(/rollback refused: \d+ recorded variance event\(s\) would be destroyed/);
    expect(num("select count(*) from pg_class where relname = 'inventory_variance_events';")).toBe(1);
    // The history can be removed by nobody, so empty the disposable SCRATCH table the only way that exists — a superuser session with
    // triggers (append-only AND foreign-key checks) disabled — purely to exercise the rollback's success path.
    expect(failed(admin("set session_replication_role = replica; delete from public.inventory_variance_events;"))).toBe(false);
    expect(num("select count(*) from public.inventory_variance_events;")).toBe(0);
    const rolledBack = admin(read("supabase/rollback/20260921120000_feature_005_db_open_19_inventory_variance_hold.rollback.sql"));
    expect(failed(rolledBack), rolledBack.err).toBe(false);
    for (const object of ["inventory_variance_events", "inventory_position_holds", "inventory_position_hold_notices", "inventory_open_cases"]) expect(num(`select count(*) from pg_class where relname = '${object}';`)).toBe(0);
    // the rollback returns the two grants the migration revoked (H1) — and only those
    expect(admin("select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_positions' and grantee = 'authenticated';").out.trim()).toBe("INSERT,REFERENCES,SELECT,TRIGGER,UPDATE");
    expect(num("select count(*) from pg_proc where proname in ('record_inventory_variance', 'resolve_inventory_variance', 'guard_inventory_position_hold', 'guard_offer_inventory_hold', 'guard_shipment_inventory_hold', 'prevent_inventory_variance_mutation');")).toBe(0);
    expect(num("select count(*) from pg_trigger where tgname like '%inventory_hold_guard' or tgname = 'trg_inventory_positions_hold_guard';")).toBe(0);
    // and the migration can be re-applied on the rolled-back schema (idempotent lifecycle)
    const reapplied = admin(migration);
    expect(failed(reapplied), reapplied.err).toBe(false);
  }, 240_000);
});
