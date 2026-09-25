import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T027 (MP-2) — static and security tests for M2a
 * `supabase/migrations/20260925103000_feature_013_delivery_destinations.sql`, its rollback and its postflight.
 * No database access. The live proof is T031 (`tests/commerce/rls-destinations.live.test.ts`, after the OPERATOR apply).
 *
 * Accept (tasks.md T026): data-model §2.3 + orders.delivery_destination_id/destination_snapshot; delivery_method CHECK
 * equals the T006-recorded value set; default-per-org partial unique; RLS (owning org members ∨ PA read; no client
 * writes). Expected values are read from data-model.md, PREFLIGHT-REPORT.md and the M1 file, never from memory.
 */

const FILE = "20260925103000_feature_013_delivery_destinations.sql";
const M1_FILE = "supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_delivery_destinations_postflight.sql", "utf8");
const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollback = normalize(stripComments(rollbackRaw));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));

// ── expectations from the approved artifacts ─────────────────────────────────────────────────────────────────────
const dataModel = readFileSync("specs/013-bank-transfer-commerce-core/data-model.md", "utf8");
const section23 = dataModel.slice(dataModel.indexOf("### 2.3 `delivery_destinations`"), dataModel.indexOf("### 2.4"));
const DATA_MODEL_COLUMNS = section23
  .split(/\r?\n/)
  .filter((line) => line.startsWith("| `"))
  .flatMap((line) => line.split("|")[1]!.split("/").map((cell) => cell.trim().replace(/`/g, "")))
  .sort();
const preflight = readFileSync("specs/013-bank-transfer-commerce-core/PREFLIGHT-REPORT.md", "utf8");
const T006_METHODS_LINE = preflight.split(/\r?\n/).find((line) => line.startsWith("- Known delivery methods (shipping rules ∪ shipments):"))!;
const T006_METHODS = [...T006_METHODS_LINE.matchAll(/`([^`]+)`/g)].map((m) => m[1]!).sort();
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const m1Body = /create or replace function public\.validate_order_transition\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(readFileSync(M1_FILE, "utf8").replace(/\r/g, ""))![1]!;

const createdColumns = () => {
  const body = /create table public\.delivery_destinations \(([\s\S]*?)\n\);/.exec(migrationRaw.replace(/\r/g, ""))![1]!;
  return body.split("\n").map((line) => /^\s{2}([a-z_0-9]+) /.exec(line)?.[1]).filter((name): name is string => !!name && name !== "constraint").sort();
};

describe("T027 — M2a satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, RLS forced, no anon grant, no authenticated write grant, no config-table change, no DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
    expect(migrationTop).not.toMatch(/\b(insert into|update|delete from) public\./);
  });

  it("the postflight is a single read-only query that ends in an ALL CHECKS PASSED summary", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
  });
});

describe("T027 — delivery_destinations equals data-model §2.3", () => {
  it("has exactly the §2.3 columns (16)", () => {
    expect(DATA_MODEL_COLUMNS).toHaveLength(16);
    expect(createdColumns()).toEqual(DATA_MODEL_COLUMNS);
  });

  it("NOT NULL / ISO-2 country / E.164 phone / field lengths follow §2.3 and §9", () => {
    for (const fragment of [
      "organization_id uuid not null references public.organizations(id)",
      "country_code char(2) not null constraint delivery_destinations_country_code_check check (country_code ~ '^[a-z]{2}$')",
      "city text not null constraint delivery_destinations_city_check check (char_length(btrim(city)) between 1 and 120)",
      "address_line_1 text not null constraint delivery_destinations_address_line_1_check check (char_length(btrim(address_line_1)) between 1 and 200)",
      "address_line_2 text constraint delivery_destinations_address_line_2_check check (char_length(btrim(address_line_2)) between 1 and 200)",
      "label text not null constraint delivery_destinations_label_check check (char_length(btrim(label)) between 1 and 80)",
      "contact_name text not null",
      "contact_phone text not null constraint delivery_destinations_contact_phone_check check (contact_phone ~ '^\\+[1-9][0-9]{6,14}$')",
      "is_default boolean not null default false",
      "created_by uuid not null references public.profiles(id)",
    ]) {
      expect(migration, fragment).toContain(fragment);
    }
  });

  it("delivery_method CHECK equals the T006 value set, and the guard refuses any other method in use", () => {
    expect(T006_METHODS).toEqual(["Courier"]);
    const check = /delivery_method text not null constraint delivery_destinations_delivery_method_check check \(delivery_method in \(([^)]*)\)\)/.exec(migration);
    expect(check).not.toBeNull();
    expect([...check![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(T006_METHODS.map((m) => m.toLowerCase()));
    expect(migrationRaw).toContain("delivery_method in ('Courier')");
    expect(migrationRaw).toMatch(/select delivery_method as m from public\.shipping_rules\s+union select delivery_method from public\.order_shipments\) s\s+where m is distinct from 'Courier'/);
  });

  it("one non-retired default per organization (partial unique), retired rows never default, retire fields paired", () => {
    expect(migration).toContain("create unique index uq_delivery_destination_default_per_org on public.delivery_destinations (organization_id) where is_default and retired_at is null;");
    expect(migration).toContain("constraint delivery_destinations_retired_not_default_check check (retired_at is null or not is_default)");
    expect(migration).toContain("constraint delivery_destinations_retired_pair_check check ((retired_at is null) = (retired_by is null))");
    expect(migration).toContain("create index idx_delivery_destinations_active_org on public.delivery_destinations (organization_id) where retired_at is null;");
  });

  it("soft retire only: no delete path, updated_at maintained", () => {
    expect(migration).toContain("create trigger trg_delivery_destinations_updated_at before update on public.delivery_destinations for each row execute function public.set_updated_at();");
    expect(migrationTop).not.toMatch(/on delete cascade/);
  });
});

describe("T027 — RLS: owning organization members or platform admin read; no client writes", () => {
  it("RLS enabled + forced; revoked from public, anon and authenticated; authenticated gets SELECT only", () => {
    expect(migration).toContain("alter table public.delivery_destinations enable row level security;");
    expect(migration).toContain("alter table public.delivery_destinations force row level security;");
    expect(migration).toContain("revoke all on table public.delivery_destinations from public, anon, authenticated;");
    const grants = [...migrationTop.matchAll(/grant ([^;]*?) on (?:table )?public\.delivery_destinations to ([^;]*?);/g)].map((m) => `${m[1]} -> ${m[2]}`);
    expect(grants).toEqual(["select -> authenticated"]);
  });

  it("exactly one policy: SELECT to authenticated using is_org_member(organization_id) or is_platform_admin()", () => {
    const policies = [...migrationTop.matchAll(/create policy (\w+) on public\.(\w+)/g)].map((m) => `${m[2]}.${m[1]}`);
    expect(policies).toEqual(["delivery_destinations.delivery_destinations_member_read"]);
    expect(migration).toContain("create policy delivery_destinations_member_read on public.delivery_destinations for select to authenticated using (public.is_org_member(organization_id) or public.is_platform_admin());");
    expect(migrationTop).not.toMatch(/\b(alter|drop) policy\b/);
  });
});

describe("T027 — orders destination fields (no client write, LEGACY unchanged)", () => {
  it("adds exactly delivery_destination_id (FK) and destination_snapshot (jsonb) with pair and shape checks", () => {
    const added = [...migration.matchAll(/alter table public\.orders\b([^;]*);/g)].flatMap((m) => [...m[1]!.matchAll(/add column (\w+)/g)].map((c) => c[1]));
    expect(added).toEqual(["delivery_destination_id", "destination_snapshot"]);
    expect(migration).toContain("add column delivery_destination_id uuid references public.delivery_destinations(id)");
    expect(migration).toContain("add column destination_snapshot jsonb");
    expect(migration).toContain("add constraint orders_destination_pair_check check ((delivery_destination_id is null) = (destination_snapshot is null))");
    for (const key of ["label", "country_code", "city", "address_lines", "contact_name", "contact_phone", "delivery_method"]) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).not.toContain("current_proforma_id");
  });

  it("the guard trigger lets only internal transitions set or change the two fields, on INSERT and UPDATE", () => {
    expect(migration).toContain("create trigger trg_orders_destination_fields_guard before insert or update of delivery_destination_id, destination_snapshot on public.orders for each row execute function public.guard_order_destination_fields();");
    const body = normalize(/as \$function\$([\s\S]*?)\$function\$;/.exec(migrationRaw)![1]!);
    expect(body).toContain("if public.is_internal_transition() then return new; end if;");
    expect(body).toContain("if tg_op = 'insert' then if new.delivery_destination_id is not null or new.destination_snapshot is not null then raise exception 'order_field_not_client_writable'");
    expect(body).toContain("elsif (new.delivery_destination_id, new.destination_snapshot) is distinct from (old.delivery_destination_id, old.destination_snapshot) then raise exception 'order_field_not_client_writable'");
    expect(migration).toContain("revoke all on function public.guard_order_destination_fields() from public, anon;");
  });

  it("LEGACY behaviour unchanged: validate_order_transition and every existing orders policy/trigger untouched; M1 pinned by its v2 fingerprint", () => {
    expect(migrationTop).not.toMatch(/function public\.validate_order_transition/);
    expect(migrationTop).not.toMatch(/(drop|alter) trigger/);
    expect(migrationTop).not.toMatch(/\bcommerce_settings\b/);
    expect(migration).toContain(`'${md5(m1Body)}'`);
    expect(md5(m1Body)).toBe("603d04c58bbcf987c38e2aa6f7d73d9b");
  });

  it("the guard refuses unless M1 is applied, the kill switch is still off and no M2a object exists", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    for (const probe of ["to_regclass('public.commerce_settings') is null", "bank_transfer_checkout_enabled", "to_regclass('public.delivery_destinations') is not null", "rolbypassrls"]) {
      expect(guard, probe).toContain(probe);
    }
  });
});

describe("T027 — the rollback removes exactly M2a", () => {
  it("drops the trigger, function, orders columns/constraints/index and the table — nothing else", () => {
    const drops = [...rollbackTop.matchAll(/drop (trigger|function|index|constraint|column|table) ([\w.()]+)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(drops).toEqual([
      "trigger trg_orders_destination_fields_guard",
      "function public.guard_order_destination_fields()",
      "index public.idx_orders_delivery_destination",
      "constraint orders_destination_snapshot_shape_check",
      "constraint orders_destination_pair_check",
      "column destination_snapshot",
      "column delivery_destination_id",
      "table public.delivery_destinations",
    ]);
    for (const untouched of ["commerce_flow", "validate_order_transition", "commerce_settings", "offer_code", "create "]) {
      expect(rollbackTop, untouched).not.toContain(untouched);
    }
  });

  it("refuses (changing nothing) once a destination exists, an order carries one, or M2b+ is applied", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    expect(rollback.startsWith("begin; do $guard$")).toBe(true);
    for (const probe of ["exists (select 1 from public.delivery_destinations)", "delivery_destination_id is not null or destination_snapshot is not null", "to_regclass('public.proforma_line_economics')"]) {
      expect(guard, probe).toContain(probe);
    }
    expect(guard).toContain("raise exception 'feature_013_delivery_destinations rollback refused");
  });

  it("the M1 rollback already refuses while M2a is applied (rollbacks run newest first)", () => {
    expect(normalize(readFileSync("supabase/rollback/20260925100000_feature_013_commerce_state_vocabulary.rollback.sql", "utf8"))).toContain("to_regclass('public.delivery_destinations') is not null");
  });
});
