import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { assertF018ReadOnlyCaptureSql, execute } from "../../scripts/pg-simple-exec.mjs";
import {
  F018_APPROVAL_ENV, F018_CAPTURE_GROUPS, F018_FORBIDDEN_REFS, F018_RETIRED_FUNCTIONS, F018_SECTIONS, F018_TARGET_REF,
  F018CaptureError, analyzeCapture, assertF018Target, buildF018RemoteChildEnv, captureSchema, computeFunctionClosure,
  diffCaptures, manifestFunctionNames, manifestRelationNames, parseRunnerRows, renderEvidenceMarkdown, sanitizeValue,
  sectionDigest, wrapReadOnly, type F018Capture, type F018Section, type SectionRunner,
} from "../../scripts/f018-capture-schema";

const linked = JSON.stringify({ ref: F018_TARGET_REF, name: "hillscoffees-trading" });
const goodFiles = {
  projectRef: F018_TARGET_REF,
  linkedProject: linked,
  poolerUrl: `postgresql://postgres.${F018_TARGET_REF}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
};
const goodEnv = {
  [F018_APPROVAL_ENV]: "1",
  SUPABASE_DB_PASSWORD: "fake-password",
  NEXT_PUBLIC_SUPABASE_URL: `https://${F018_TARGET_REF}.supabase.co`,
};

describe("Feature 018 T001 manifest", () => {
  it("names every required capture group with unique tasks T003-T008", () => {
    const tasks = F018_CAPTURE_GROUPS.map((group) => group.task);
    for (const task of ["T003", "T004", "T005", "T006", "T007", "T008"]) expect(tasks).toContain(task);
    expect(new Set(F018_CAPTURE_GROUPS.map((group) => group.id)).size).toBe(F018_CAPTURE_GROUPS.length);
  });

  it("inventories the contract-required functions, relations, triggers and policies", () => {
    const functions = manifestFunctionNames();
    for (const name of ["checkout_bank_transfer_v1", "compute_order_quote", "commerce_request_begin", "commerce_resolve_cart", "add_cart_line",
      "validate_order_item_offer", "commerce_release_reservation", "set_default_payment_account", "admin_review_payment", "record_stripe_payment_intent",
      "next_support_ticket_code", "attach_coffee_media", "finance_terminal_review_integrity"]) expect(functions).toContain(name);
    const relations = manifestRelationNames();
    for (const name of ["orders", "order_items", "inventory_positions", "coffee_offers", "proforma_invoice_items", "payment_accounts", "support_tickets", "commerce_request_log"]) {
      expect(relations).toContain(name);
    }
    const triggers = F018_CAPTURE_GROUPS.flatMap((group) => group.triggers);
    expect(triggers).toEqual(expect.arrayContaining(["trg_orders_enforce_new_order_flow", "trg_proforma_invoice_items_immutable", "trg_support_ticket_validate"]));
    const policies = F018_CAPTURE_GROUPS.flatMap((group) => group.policies);
    expect(policies).toEqual(expect.arrayContaining(["payment_proof_storage_insert", "tickets_insert_own", "messages_insert_access"]));
  });

  it("declares exactly the retired provider functions and forbids the other project", () => {
    expect(F018_RETIRED_FUNCTIONS).toEqual(["record_stripe_payment_intent", "record_payment_transfer", "ingest_stripe_event"]);
    expect(F018_FORBIDDEN_REFS).toContain("qfzvehrzwaheppuxqkjo");
    expect(F018_TARGET_REF).toBe("mxejnutukgxyccnohglo");
  });
});

describe("Feature 018 T002 target identity pinning", () => {
  it("accepts only the approved project when HTTP, linked metadata and pooler agree", () => {
    const target = assertF018Target(goodEnv, goodFiles);
    expect(target).toMatchObject({ ref: F018_TARGET_REF, poolerUser: `postgres.${F018_TARGET_REF}`, poolerPort: "5432" });
    expect(JSON.stringify(target)).not.toContain("fake-password");
  });

  it("requires the explicit read-only capture approval and a credential", () => {
    expect(() => assertF018Target({ ...goodEnv, [F018_APPROVAL_ENV]: undefined }, goodFiles)).toThrow(/F018_REMOTE_READONLY_CAPTURE_APPROVED=1/);
    expect(() => assertF018Target({ ...goodEnv, [F018_APPROVAL_ENV]: "true" }, goodFiles)).toThrow(F018CaptureError);
    expect(() => assertF018Target({ ...goodEnv, SUPABASE_DB_PASSWORD: "" }, goodFiles)).toThrow(/SUPABASE_DB_PASSWORD/);
  });

  it.each(["F013_TARGET", "F013_LOCAL_APPROVED", "F013_LIVE", "F015_REMOTE_LIVE_DB_APPROVED", "F016_REMOTE_LIVE_DB_APPROVED"])("refuses mixed approval/local override %s", (name) => {
    expect(() => assertF018Target({ ...goodEnv, [name]: "1" }, goodFiles)).toThrow(/mixed_mode/);
  });

  it("refuses the other project in every identity input", () => {
    const other = F018_FORBIDDEN_REFS[0]!;
    expect(() => assertF018Target({ ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: `https://${other}.supabase.co` }, goodFiles)).toThrow(/http_target_mismatch/);
    expect(() => assertF018Target(goodEnv, { ...goodFiles, projectRef: other })).toThrow(F018CaptureError);
    expect(() => assertF018Target(goodEnv, { ...goodFiles, linkedProject: JSON.stringify({ ref: other, name: "hillscoffees-trading" }) })).toThrow(F018CaptureError);
    expect(() => assertF018Target(goodEnv, { ...goodFiles, poolerUrl: `postgresql://postgres.${other}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres` })).toThrow(/pooler_identity_mismatch/);
    expect(() => assertF018Target({ ...goodEnv, F013_PROD_DB_URL: `postgresql://postgres.${other}:x@aws-0-eu-west-2.pooler.supabase.com:5432/postgres` }, goodFiles)).toThrow(/forbidden_project_in_env/);
  });

  it("fails closed when any identity input disagrees", () => {
    expect(() => assertF018Target(goodEnv, { ...goodFiles, projectRef: "abcdefghijklmnopqrst" })).toThrow(/ref_disagreement/);
    expect(() => assertF018Target({ ...goodEnv, SOME_DB_URL: "postgresql://postgres.abcdefghijklmnopqrst:x@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" }, goodFiles)).toThrow(/target_disagreement_in_env/);
    expect(() => assertF018Target(goodEnv, { ...goodFiles, linkedProject: JSON.stringify({ ref: F018_TARGET_REF, name: "other-project" }) })).toThrow(/linked_project_identity_mismatch/);
  });

  it("refuses non-pinned HTTP origins and non-pooler/local database hosts", () => {
    for (const value of ["http://" + F018_TARGET_REF + ".supabase.co", `https://${F018_TARGET_REF}.supabase.co.evil.test`, `https://${F018_TARGET_REF}.supabase.co/rest/v1`, "", "not a url"]) {
      expect(() => assertF018Target({ ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: value }, goodFiles)).toThrow(F018CaptureError);
    }
    for (const host of ["127.0.0.1", "localhost", "db.example.com"]) {
      expect(() => assertF018Target(goodEnv, { ...goodFiles, poolerUrl: `postgresql://postgres.${F018_TARGET_REF}@${host}:5432/postgres` })).toThrow(/pooler_identity_mismatch/);
    }
  });

  it("builds a runner environment that carries no ambient database variable", () => {
    const target = assertF018Target(goodEnv, goodFiles);
    const child = buildF018RemoteChildEnv(target, { ...goodEnv, PATH: "p", F013_PROD_DB_URL: "postgresql://secret", DATABASE_URL: "x", PGPASSWORD: "y" });
    expect(child.PGUSER).toBe(`postgres.${F018_TARGET_REF}`);
    expect(child.PGHOST).toMatch(/pooler\.supabase\.com$/);
    expect(child[F018_APPROVAL_ENV]).toBe("1");
    for (const name of ["F013_PROD_DB_URL", "DATABASE_URL", "PGPASSWORD", "NEXT_PUBLIC_SUPABASE_URL"]) expect(child[name]).toBeUndefined();
  });
});

describe("Feature 018 read-only runner contract", () => {
  it("wraps every section in the one accepted shape", () => {
    for (const section of F018_SECTIONS) {
      const sql = wrapReadOnly(section);
      expect(sql).toMatch(/^begin transaction read only;/);
      expect(sql.trim()).toMatch(/rollback;$/);
      expect(() => assertF018ReadOnlyCaptureSql(sql)).not.toThrow();
    }
  });

  it.each([
    "select 1",
    "begin transaction read only; select 1; commit;",
    "begin transaction read only; select 1; insert into t values (1); rollback;",
    "begin transaction read only; delete from t; rollback;",
    "begin transaction read only; select set_config('transaction_read_only','off',true); rollback;",
    "begin transaction read only; select pg_terminate_backend(1); rollback;",
    "begin transaction read only; select decrypted_secret from vault.decrypted_secrets; rollback;",
    "begin transaction read only; select nextval('s'); rollback;",
    "begin transaction read only; with x as (update t set a=1 returning 1) select * from x; rollback;",
    "begin transaction read only; select 1; select 2; rollback;",
    "begin transaction read only; create table t(a int); rollback;",
  ])("rejects non-read-only SQL: %s", (sql) => {
    expect(() => assertF018ReadOnlyCaptureSql(sql)).toThrow();
  });

  it("refuses unsafe input and mixed approvals before any network activity", async () => {
    const base = { NODE_ENV: "test" as const, PGHOST: "aws-0-eu-west-2.pooler.supabase.com", PGUSER: `postgres.${F018_TARGET_REF}`, PGPORT: "5432", SUPABASE_DB_PASSWORD: "fake-password", [F018_APPROVAL_ENV]: "1" };
    await expect(execute("select 1", base)).rejects.toThrow(/BEGIN TRANSACTION READ ONLY/);
    await expect(execute("begin transaction read only; select 1; rollback;", { ...base, F016_REMOTE_LIVE_DB_APPROVED: "1" })).rejects.toThrow(/refuses to combine/);
    await expect(execute("begin transaction read only; select 1; rollback;", { ...base, PGUSER: "postgres.qfzvehrzwaheppuxqkjo" })).rejects.toThrow(/approved session-pooler/);
  });
});

describe("Feature 018 T003-T008 capture sections execute against real PostgreSQL catalogs", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage; create schema vault; create schema supabase_migrations;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid, bucket_id text, name text);
      create table vault.secrets (id uuid, name text, secret text);
      create table supabase_migrations.schema_migrations (version text primary key, name text);
      insert into storage.buckets values ('payment-proofs','payment-proofs',false,null,null);
      insert into vault.secrets values (gen_random_uuid(),'example_name','not-captured');
      insert into supabase_migrations.schema_migrations values ('20260930100000','feature_015');
      create type public.order_status as enum ('DRAFT','HOLD');
      create table public.orders (id uuid primary key, status public.order_status not null default 'DRAFT', buyer_organization_id uuid);
      create table public.order_items (id uuid primary key, order_id uuid references public.orders(id), offer_id uuid, unique (order_id, offer_id));
      create unique index orders_one_draft on public.orders (buyer_organization_id) where status = 'DRAFT';
      alter table public.orders enable row level security;
      create policy orders_read on public.orders for select to authenticated using (buyer_organization_id is not null) ;
      create view public.v_orders as select id from public.orders;
      create function public.checkout_bank_transfer_v1(a uuid) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$ begin return public.helper_fn(a); end $$;
      create function public.helper_fn(a uuid) returns uuid language sql as 'select a';
      create function public.record_stripe_payment_intent(a uuid) returns uuid language sql as 'select a';
      revoke all on function public.record_stripe_payment_intent(uuid) from public, anon, authenticated, service_role;
      create function public.orders_guard() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger trg_orders_guard before insert on public.orders for each row execute function public.orders_guard();
      alter default privileges in schema public grant select on tables to anon;
    `);
  });
  afterAll(async () => { await db.close(); });

  async function rowsFor(section: F018Section): Promise<Record<string, unknown>[]> {
    const results = await db.exec(wrapReadOnly(section));
    return results[1]!.rows.map((row) => Object.values(row as Record<string, unknown>)[0] as Record<string, unknown>);
  }

  it.each(F018_SECTIONS.map((section) => [section.id, section] as const))("section %s is valid PostgreSQL and read-only", async (_id, section) => {
    const rows = await rowsFor(section);
    expect(Array.isArray(rows)).toBe(true);
    const readOnly = await db.exec("show transaction_read_only");
    expect(readOnly[0]!.rows[0]).toEqual({ transaction_read_only: "off" });
  });

  it("captures the expected catalog facts using pg_proc/pg_trigger/pg_policy/pg_constraint/pg_index expressions", async () => {
    const byId = Object.fromEntries(F018_SECTIONS.map((section) => [section.id, section]));
    const fn = (await rowsFor(byId.functions!)).find((row) => row.name === "checkout_bank_transfer_v1")!;
    expect(fn).toMatchObject({ security_definer: true, language: "plpgsql", kind: "f" });
    expect(String(fn.definition)).toContain("helper_fn");
    expect(fn.config).toEqual(["search_path=pg_catalog, public"]);
    const retired = (await rowsFor(byId.functions!)).find((row) => row.name === "record_stripe_payment_intent")!;
    expect(retired.effective_execute).toEqual({ PUBLIC: false, anon: false, authenticated: false, service_role: false });
    expect((await rowsFor(byId.triggers!)).map((row) => row.name)).toContain("trg_orders_guard");
    expect((await rowsFor(byId.policies!)).find((row) => row.name === "orders_read")).toMatchObject({ command: "r", permissive: true, roles: ["authenticated"] });
    expect((await rowsFor(byId.constraints!)).some((row) => row.type === "u" && /order_id, offer_id/.test(String(row.definition)))).toBe(true);
    const draft = (await rowsFor(byId.indexes!)).find((row) => row.name === "orders_one_draft")!;
    expect(draft).toMatchObject({ unique: true });
    expect(String(draft.predicate)).toMatch(/DRAFT/);
    expect((await rowsFor(byId.enums!))[0]).toMatchObject({ type: "order_status", labels: ["DRAFT", "HOLD"] });
    expect((await rowsFor(byId.relations!)).find((row) => row.relation === "orders")).toMatchObject({ rls_enabled: true });
    expect((await rowsFor(byId.migration_history!))[0]).toEqual({ version: "20260930100000", name: "feature_015" });
    expect((await rowsFor(byId.vault_secret_names!))[0]).toEqual({ name: "example_name" });
    expect(JSON.stringify(await rowsFor(byId.vault_secret_names!))).not.toContain("not-captured");
  });

  it("captures through a runner end to end and unavailable optional sections do not abort", async () => {
    const outputs = new Map<string, Record<string, unknown>[]>();
    for (const section of F018_SECTIONS) outputs.set(section.id, await rowsFor(section));
    const runner: SectionRunner = {
      description: "pglite",
      run: (section) => section.id === "vault_secret_names" ? { ok: false, code: "SQL_ERROR", message: "permission denied" } : { ok: true, rows: outputs.get(section.id)! },
    };
    const capture = captureSchema(runner);
    expect(capture.sections.vault_secret_names).toMatchObject({ status: "unavailable", error: { code: "SQL_ERROR" } });
    expect(capture.sections.functions!.status).toBe("captured");
    expect(sectionDigest(capture.sections.functions!)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when a required section is unavailable", () => {
    const runner: SectionRunner = { description: "x", run: (section) => section.id === "functions" ? { ok: false, code: "TRANSPORT", message: "timeout" } : { ok: true, rows: [] } };
    expect(() => captureSchema(runner)).toThrow(/required_section_unavailable:functions/);
  });
});

function fixtureCapture(options: { omitFunction?: string; exposeRetired?: boolean; extraOverload?: boolean; unpinnedSecdef?: boolean } = {}): F018Capture {
  const fnRows = manifestFunctionNames().filter((name) => name !== options.omitFunction).flatMap((name) => {
    const row = {
      schema: "public", name, regprocedure: `public.${name}(uuid)`, identity_args: "uuid", kind: "f", security_definer: true,
      config: options.unpinnedSecdef ? null : ["search_path=pg_catalog, public"], language: "plpgsql",
      effective_execute: { PUBLIC: false, anon: false, authenticated: true, service_role: false },
      definition: `create function public.${name}(uuid) begin ${name === "checkout_bank_transfer_v1" ? "perform compute_order_quote(a);" : ""} end`,
    };
    const rows: Record<string, unknown>[] = [row];
    if (options.extraOverload && name === "add_cart_line") rows.push({ ...row, regprocedure: "public.add_cart_line(uuid, uuid)" });
    if (F018_RETIRED_FUNCTIONS.includes(name)) rows[0] = { ...row, effective_execute: { PUBLIC: false, anon: false, authenticated: !!options.exposeRetired, service_role: false } };
    return rows;
  });
  const relationRows = manifestRelationNames().map((relation) => ({ relation: `public.${relation}`, kind: "r", columns: [] }));
  const triggerRows = F018_CAPTURE_GROUPS.flatMap((group) => group.triggers).map((name) => ({ relation: "public.orders", name, function: "public.validate_order_transition()" }));
  const policyRows = F018_CAPTURE_GROUPS.flatMap((group) => group.policies).map((name) => ({ relation: "public.support_tickets", name }));
  const section = (id: string, rows: Record<string, unknown>[]) => [id, { id, task: "T", optional: false, status: "captured" as const, rows }] as const;
  return { version: 1, source: "fixture", redactions: 0, sections: Object.fromEntries([section("meta", [{ server_version: "17" }]), section("functions", fnRows), section("relations", relationRows), section("triggers", triggerRows), section("policies", policyRows), section("indexes", []), section("constraints", [])]) };
}

describe("Feature 018 T009 fail-closed drift report", () => {
  it("passes a complete capture and reports facts and the function closure", () => {
    const report = analyzeCapture(fixtureCapture());
    expect(report.ok).toBe(true);
    expect(report.facts.manifest_functions_present).toBe(report.facts.manifest_functions_total);
    expect(report.closure).toContain("compute_order_quote");
  });

  it("fails closed on a missing expected function, relation, trigger or policy", () => {
    const missingFunction = analyzeCapture(fixtureCapture({ omitFunction: "commerce_resolve_cart" }));
    expect(missingFunction.ok).toBe(false);
    expect(missingFunction.findings).toContainEqual(expect.objectContaining({ kind: "MISSING_FUNCTION", subject: "commerce_resolve_cart", material: true }));
    const capture = fixtureCapture();
    capture.sections.relations!.rows = capture.sections.relations!.rows.filter((row) => row.relation !== "public.commerce_request_log");
    capture.sections.triggers!.rows.pop();
    capture.sections.policies!.rows.pop();
    const kinds = analyzeCapture(capture).findings.map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["MISSING_RELATION", "MISSING_TRIGGER", "MISSING_POLICY"]));
  });

  it("treats an executable retired provider function as material and an extra overload as a review finding", () => {
    const retired = analyzeCapture(fixtureCapture({ exposeRetired: true }));
    expect(retired.ok).toBe(false);
    expect(retired.findings.some((item) => item.kind === "RETIRED_FUNCTION_EXECUTABLE" && item.material)).toBe(true);
    const overload = analyzeCapture(fixtureCapture({ extraOverload: true }));
    expect(overload.findings).toContainEqual(expect.objectContaining({ kind: "UNEXPECTED_OVERLOAD", subject: "add_cart_line", material: false }));
    expect(analyzeCapture(fixtureCapture({ unpinnedSecdef: true })).findings.some((item) => item.kind === "SECDEF_UNPINNED_SEARCH_PATH")).toBe(true);
  });

  it("flags a required section that could not be captured", () => {
    const capture = fixtureCapture();
    capture.sections.policies = { id: "policies", task: "T", optional: false, status: "unavailable", rows: [], error: { code: "SQL_ERROR", message: "denied" } };
    expect(analyzeCapture(capture).ok).toBe(false);
  });

  it("reconciles live definitions against a repository-derived baseline by exact signature", () => {
    const live = fixtureCapture();
    const baseline = fixtureCapture();
    expect(diffCaptures(live, baseline)).toEqual([]);
    const changed = fixtureCapture();
    changed.sections.functions!.rows[0] = { ...changed.sections.functions!.rows[0]!, definition: "different" };
    expect(diffCaptures(changed, baseline)).toContainEqual(expect.objectContaining({ kind: "DEFINITION_MISMATCH", material: true }));
    const without = fixtureCapture({ omitFunction: "add_cart_line" });
    expect(diffCaptures(live, without).map((item) => item.kind)).toContain("SIGNATURE_ONLY_IN_LIVE");
    expect(diffCaptures(without, live).map((item) => item.kind)).toContain("SIGNATURE_ONLY_IN_BASELINE");
  });

  it("follows bare and qualified calls in captured bodies for the binding/call closure", () => {
    const capture = fixtureCapture();
    capture.sections.functions!.rows.push({ name: "helper_a", regprocedure: "public.helper_a()", definition: "select public.helper_b(1)", effective_execute: {} },
      { name: "helper_b", regprocedure: "public.helper_b(integer)", definition: "select 1", effective_execute: {} });
    capture.sections.functions!.rows.find((row) => row.name === "checkout_bank_transfer_v1")!.definition += " perform helper_a();";
    const closure = computeFunctionClosure(capture, ["checkout_bank_transfer_v1"]);
    expect(closure).toEqual(expect.arrayContaining(["checkout_bank_transfer_v1", "compute_order_quote", "helper_a", "helper_b"]));
  });
});

describe("Feature 018 evidence hygiene", () => {
  it("redacts secret-shaped content and never emits row payloads or credentials", () => {
    const counter = { count: 0 };
    const value = sanitizeValue({ definition: "x postgresql://u:pw@h/db eyJabcdefgh.ijklmnopq.rstuvwxyz sk_live_ABC123 password = 'hunter22'" }, counter) as { definition: string };
    expect(value.definition).not.toMatch(/postgresql:\/\/|eyJ|sk_live|hunter22/);
    expect(counter.count).toBeGreaterThanOrEqual(4);
  });

  it("parses runner output in both supported transports and ignores command tags", () => {
    expect(parseRunnerRows('BEGIN\n["{\\"a\\":1}"]\n["{\\"a\\":2}"]\nSELECT 2\nROLLBACK\n', "pg-simple-exec")).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseRunnerRows('{"a":1}\n\n{"a":2}\n', "psql")).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("renders sanitized markdown that states no mutation and lists material findings", () => {
    const capture = fixtureCapture({ omitFunction: "estimate_cart" });
    const report = analyzeCapture(capture);
    const markdown = renderEvidenceMarkdown(capture, report, { when: "2026-10-04T00:00:00Z", command: "cmd" });
    expect(markdown).toContain("Mutation performed: none");
    expect(markdown).toContain("MATERIAL DRIFT PRESENT");
    expect(markdown).toContain("estimate_cart");
    expect(markdown).not.toMatch(/fake-password|postgresql:\/\//);
  });
});
