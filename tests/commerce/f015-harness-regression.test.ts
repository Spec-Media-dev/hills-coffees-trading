import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execution = vi.hoisted(() => ({ sql: "", output: "NOTICE: STATE: INCONSISTENT\n", calls: 0 }));
vi.mock("node:child_process", () => {
  const childProcess = {
    spawn: vi.fn(() => { throw new Error("Live sessions forbidden in unit tests"); }),
    spawnSync: vi.fn(() => {
      execution.calls++;
      return { status: 0, stdout: execution.output, stderr: "" };
    }),
  };
  return { ...childProcess, default: childProcess };
});
vi.mock("@/scripts/f013-local-target", () => ({
  F013_PRODUCTION_REF: "not-used",
  resolveF013Mode: () => ({ kind: "local" }),
  requireF013LocalTarget: () => ({ kind: "local" }),
  supabaseCli: (_target: unknown, args: string[]) => {
    execution.sql = readFileSync(args[3]!, "utf8");
    return { command: "never-executed", args: [], cwd: process.cwd(), env: {} };
  },
}));

import { ensureFeature015Applied, inspectFeature015State } from "./f013-proof-cli";

beforeEach(() => {
  execution.output = "NOTICE: STATE: INCONSISTENT\n";
  execution.calls = 0;
});

describe("Feature 015 tri-state harness regression (no database)", () => {
  it("refuses forward application over an inconsistent probe", () => {
    expect(() => ensureFeature015Applied("SHOULD NEVER EXECUTE")).toThrow(/INCONSISTENT/);
    expect(execution.calls).toBe(1);
  });

  it("uses only raw existence plus coherent baseline for ABSENT", () => {
    inspectFeature015State();
    const absent = execution.sql.slice(execution.sql.indexOf("elsif v_raw_rpcs_cnt"), execution.sql.indexOf("raise notice 'STATE: ABSENT'"));
    for (const predicate of ["v_raw_rpcs_cnt = 0", "not v_raw_table", "not v_raw_bucket", "v_raw_storage_policies = 0", "not v_raw_file_policy", "v_raw_indexes = 0", "v_catalog_baseline", "v_proofs_read_baseline", "v_legacy_grants_ok", "v_transition_baseline"]) {
      expect(absent).toContain(predicate);
    }
    expect(absent).not.toMatch(/not v_f015_|v_f015_storage_pol_cnt/);
  });

  it("counts malformed signatures and named relations independently of validity", () => {
    inspectFeature015State();
    const raw = execution.sql.slice(execution.sql.indexOf("-- RAW EXISTENCE"), execution.sql.indexOf("-- DEFINITION VALIDITY"));
    expect(raw).toContain("proname in");
    expect(raw).not.toContain("pronargs");
    expect(raw).toContain("to_regclass('public.payment_proof_upload_intents') is not null");
    expect(raw).toContain("id = 'payment-proofs' or name = 'payment-proofs'");
    expect(raw).not.toContain("relrowsecurity");
    expect(raw).not.toContain("file_size_limit");
  });

  it("requires exact index predicates, source pins, policy definitions, and privileges for APPLIED", () => {
    inspectFeature015State();
    expect(execution.sql).toContain("pg_get_expr(i.indpred, i.indrelid) = '(status = ''PREPARED''::text)'");
    expect(execution.sql).toContain("i.indisvalid and i.indisready");
    expect(execution.sql).toContain("md5(replace(p.prosrc, chr(13), '')) = expected.source_md5");
    expect(execution.sql).toContain("v_definitions_ok and v_policy_definitions_ok and v_legacy_grants_ok");
    expect(execution.sql).toContain("acl.grantee = 0");
    expect(execution.sql).not.toContain("has_function_privilege('public'");
    expect(execution.sql).not.toContain("idx_payment_proof_upload_intents_");
  });

  it("uses relation OIDs for table grants so an absent table is safe to inspect", () => {
    inspectFeature015State();
    expect(execution.sql).toContain("has_table_privilege('service_role', c.oid, 'SELECT')");
    expect(execution.sql).not.toContain("has_table_privilege('service_role', 'public.payment_proof_upload_intents'");
  });

  it("accepts only one emitted state record, not echoed SQL or conflicting records", () => {
    execution.output = "raise notice 'STATE: APPLIED';";
    expect(() => inspectFeature015State()).toThrow(/could not parse/);
    execution.output = "NOTICE: STATE: APPLIED\nNOTICE: STATE: INCONSISTENT\n";
    expect(() => inspectFeature015State()).toThrow(/could not parse/);
    execution.output = "│ STATE: APPLIED │\n";
    expect(inspectFeature015State()).toBe("APPLIED");
  });
});

describe("Test 18 synchronization static contracts", () => {
  const source = readFileSync("tests/commerce/f015-local-live-db.test.ts", "utf8");
  const race = source.slice(source.indexOf('it("18.'), source.indexOf("// 19."));

  it("clears statistics before both in-transaction backend polling queries", () => {
    expect(race).toMatch(/loop\s+perform pg_stat_clear_snapshot\(\);\s+select l.pid/);
    expect(race).toMatch(/loop\s+perform pg_stat_clear_snapshot\(\);\s+select pid into v_finalize_pid/);
    expect(race).toContain("select pg_stat_clear_snapshot();");
  });

  it("controller verifies both named backend PIDs before sending ACK in each case", () => {
    expect(race).toMatch(/await waitForExpectedBlocker\(expiryPidA, finalizePidA,[\s\S]*?acknowledge\("A"\)/);
    expect(race).toMatch(/await waitForExpectedBlocker\(finalizePidB, expiryPidB,[\s\S]*?acknowledge\("B"\)/);
    expect(race).toContain("pg_blocking_pids(${waitingPid})");
    expect(race).toContain("application_name = '${waitingName}'");
    expect(race).toContain("application_name = '${holderName}'");
  });

  it("holders retain readiness and row locks until a persistent controller ACK", () => {
    expect(race).toContain("acknowledged from ${barrierSchema}.signals where race = 'A'");
    expect(race).toContain("acknowledged from ${barrierSchema}.signals where race = 'B'");
    expect(race).not.toContain("pg_advisory_unlock(");
    expect(race).toContain("execute 'reset role'");
    expect(race).toContain("revoke all on schema ${barrierSchema}");
    expect(race).toContain("drop schema ${barrierSchema} cascade");
  });

  it("bounds SQL locks, polling, process lifetimes and test cleanup", () => {
    expect(race).toContain("statement_timeout = '45s'");
    expect(race).toContain("lock_timeout = '35s'");
    expect(race).toContain("case_a_controller_ack_timeout");
    expect(race).toContain("case_b_controller_ack_timeout");
    expect(race).toContain("runSqlSessionAsync(sql, prefix, 60_000)");
    expect(race).toContain("await Promise.allSettled(sessions)");
    expect(race).toContain("180_000");
  });
});
