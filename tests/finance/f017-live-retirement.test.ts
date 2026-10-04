import { describe, expect, it } from "vitest";
import { assertF016LiveTarget, F016_TARGET_REF } from "../../scripts/f016-live-target";
import { F016_LIVE_SCENARIOS } from "./f016-live-scenarios";
import { openLiveSession, withLiveSession } from "./f016-live-session";
import {
  F016_APPROVED_COMPATIBLE_MANIFEST, F017_RETIRED_FUNCTIONS, F017_RETIRED_SIGNATURES,
  F017SqlRunner, FatalRecoveryError, createFatalRecoveryReport, executeDeniedRpcProof,
  executeF017LifecycleOrchestration, executeF017MandatoryRestoration, executeF017Scenario29,
  getF017CompatibleF016Scenarios, inspectF017State, isF016ScenarioCompatibleWithF017, isSessionFailure,
  validateF016CompatibleManifest
} from "./f017-retirement-core";

export * from "./f017-retirement-core";

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("MEDIUM 3 — Explicit Approved Compatibility Manifest", () => {
  it("selects exactly Scenarios 1–27 matching manifest identity", () => {
    const scenarios = getF017CompatibleF016Scenarios(F016_LIVE_SCENARIOS);
    expect(scenarios.length).toBe(27);
    expect(scenarios.map((s) => s.id)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    for (const s of scenarios) {
      const approved = F016_APPROVED_COMPATIBLE_MANIFEST.find((m) => m.id === s.id);
      expect(approved).toBeDefined();
      expect(s.name).toBe(approved!.name);
    }
  });

  it("fails if an approved scenario is renamed", () => {
    const mutatedRegistry = F016_LIVE_SCENARIOS.map((s) =>
      s.id === 5 ? { ...s, name: "Renamed scenario" } : s
    );
    expect(() => validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, mutatedRegistry)).toThrow(
      "scenario_identity_mismatch"
    );
  });

  it("fails if scenario IDs are swapped", () => {
    const mutatedRegistry = F016_LIVE_SCENARIOS.map((s) => {
      if (s.id === 1) return { ...s, id: 2 };
      if (s.id === 2) return { ...s, id: 1 };
      return s;
    });
    expect(() => validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, mutatedRegistry)).toThrow(
      "scenario_identity_mismatch"
    );
  });

  it("fails if duplicate IDs or names exist in the registry", () => {
    const duplicateId = [...F016_LIVE_SCENARIOS, F016_LIVE_SCENARIOS[0]];
    expect(() => validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, duplicateId)).toThrow("duplicate_registry_id");
    const duplicateName = [...F016_LIVE_SCENARIOS, { ...F016_LIVE_SCENARIOS[0], id: 99 }];
    expect(() => validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, duplicateName)).toThrow("duplicate_registry_name");
  });

  it("fails if an approved scenario is missing from registry", () => {
    const mutatedRegistry = F016_LIVE_SCENARIOS.filter((s) => s.id !== 10);
    expect(() => validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, mutatedRegistry)).toThrow(
      "approved_scenario_missing_from_registry:10"
    );
  });

  it("fails if duplicate scenarios exist in manifest", () => {
    const duplicateManifest = [...F016_APPROVED_COMPATIBLE_MANIFEST, F016_APPROVED_COMPATIBLE_MANIFEST[0]];
    expect(() => validateF016CompatibleManifest(duplicateManifest, F016_LIVE_SCENARIOS)).toThrow(
      "duplicate_manifest_id"
    );
  });

  it("never silently auto-selects additional future scenarios", () => {
    const registryWithFuture = [
      ...F016_LIVE_SCENARIOS,
      { id: 30, name: "Future Scenario", handler: async () => {} },
    ];
    const compatible = validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, registryWithFuture);
    expect(compatible.length).toBe(27);
    expect(compatible.some((s) => s.id === 30)).toBe(false);
  });

  it("explicitly excludes Scenario 28 and Scenario 29", () => {
    expect(isF016ScenarioCompatibleWithF017(28)).toBe(false);
    expect(isF016ScenarioCompatibleWithF017(29)).toBe(false);
    expect(isF016ScenarioCompatibleWithF017(27)).toBe(true);
    expect(isF016ScenarioCompatibleWithF017(1)).toBe(true);
  });
});

describe("HIGH 4 — Conservative Exact-Signature Recovery Inspection", () => {
  it("treats SQL query error as UNKNOWN / INSPECTION_FAILED without assuming safe state", async () => {
    const errorSql: F017SqlRunner = async () => {
      throw new Error("connection_reset_by_peer");
    };

    const result = await inspectF017State(errorSql);
    expect(result.status).toBe("UNKNOWN");
    expect(result.isApplied).toBe(false);
    expect(result.unexpectedGrants).toContain("INSPECTION_FAILED");
    expect(result.inspectionError).toContain("connection_reset_by_peer");

    const reportErr = createFatalRecoveryReport(result, "initial_probe", new Error("original_failure"));
    expect(reportErr.message).toContain("ACL_STATE_UNKNOWN");
    expect(reportErr.message).not.toContain("Application role exposed: false");
    const report = (reportErr as FatalRecoveryError).recoveryReport;
    expect(report?.applicationRoleExposed).toBe("UNKNOWN");
  });

  it("treats malformed query result as UNKNOWN", async () => {
    const malformedSql: F017SqlRunner = async () => "invalid_non_json_string";
    const result = await inspectF017State(malformedSql);
    expect(result.status).toBe("UNKNOWN");
    expect(result.isApplied).toBe(false);
  });

  it("identifies missing function as MISSING rather than retired", async () => {
    const mockSql: F017SqlRunner = async () => {
      return JSON.stringify({
        functions: [
          { name: "admin_review_payment", sig: "public.admin_review_payment(uuid, boolean, text)", oid: null, has_public: null, has_anon: null, has_authenticated: null, has_service_role: null },
          { name: "record_stripe_payment_intent", sig: "public.record_stripe_payment_intent(uuid, text, text)", oid: 1001, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
          { name: "record_payment_transfer", sig: "public.record_payment_transfer(uuid, text, text, text)", oid: 1002, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
          { name: "ingest_stripe_event", sig: "public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)", oid: 1003, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
        ],
      });
    };

    const result = await inspectF017State(mockSql);
    expect(result.status).toBe("UNKNOWN");
    expect(result.unexpectedGrants).toContain("INSPECTION_FAILED");
    expect(result.acls.admin_review_payment.status).toBe("UNKNOWN");
    expect(result.isApplied).toBe(false);
  });

  it.each([
    ["missing OID", (row: Record<string, unknown>) => delete row.oid],
    ["undefined OID", (row: Record<string, unknown>) => { row.oid = undefined; }],
    ["malformed OID", (row: Record<string, unknown>) => { row.oid = "1000"; }],
    ["missing privilege", (row: Record<string, unknown>) => delete row.has_anon],
    ["null privilege", (row: Record<string, unknown>) => { row.has_authenticated = null; }],
    ["string privilege", (row: Record<string, unknown>) => { row.has_service_role = "false"; }],
    ["wrong overload", (row: Record<string, unknown>) => { row.sig = "public.record_payment_transfer(uuid, text, text)"; }],
  ])("fails closed to UNKNOWN for %s", async (_label, mutate) => {
    const functions = F017_RETIRED_FUNCTIONS.map((name, index) => ({
      name, sig: F017_RETIRED_SIGNATURES[index], oid: 1000 + index,
      has_public: false, has_anon: false, has_authenticated: false, has_service_role: false,
    })) as Record<string, unknown>[];
    mutate(functions[0]);
    const result = await inspectF017State(async () => JSON.stringify({ functions }));
    expect(result.status).toBe("UNKNOWN");
    expect(result.isApplied).toBe(false);
    expect(result.unexpectedGrants).toContain("INSPECTION_FAILED");
  });

  it("fails closed for duplicate, missing, unexpected, invalid JSON, and SQL failure payloads", async () => {
    const valid = F017_RETIRED_FUNCTIONS.map((name, index) => ({ name, sig: F017_RETIRED_SIGNATURES[index], oid: 1000 + index, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false }));
    const payloads: unknown[] = [
      { functions: [valid[0], valid[0], valid[2], valid[3]] },
      { functions: valid.slice(0, 3) },
      { functions: [...valid, { ...valid[0], name: "other", sig: "public.other()", oid: 9 }] },
      "not-json",
    ];
    for (const payload of payloads) {
      const result = await inspectF017State(async () => typeof payload === "string" ? payload : JSON.stringify(payload));
      expect(result.status).toBe("UNKNOWN");
    }
    expect((await inspectF017State(async () => { throw new Error("sql_failure"); })).status).toBe("UNKNOWN");
  });

  it("identifies exposed function as PRESENT_EXPOSED", async () => {
    const mockSql: F017SqlRunner = async () => {
      return JSON.stringify({
        functions: [
          { name: "admin_review_payment", sig: "public.admin_review_payment(uuid, boolean, text)", oid: 1000, has_public: false, has_anon: false, has_authenticated: true, has_service_role: true },
          { name: "record_stripe_payment_intent", sig: "public.record_stripe_payment_intent(uuid, text, text)", oid: 1001, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
          { name: "record_payment_transfer", sig: "public.record_payment_transfer(uuid, text, text, text)", oid: 1002, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
          { name: "ingest_stripe_event", sig: "public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)", oid: 1003, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
        ],
      });
    };

    const result = await inspectF017State(mockSql);
    expect(result.status).toBe("EXPOSED");
    expect(result.acls.admin_review_payment.status).toBe("PRESENT_EXPOSED");
    expect(result.unexpectedGrants).toContain("admin_review_payment:authenticated");
    expect(result.unexpectedGrants).toContain("admin_review_payment:service_role");
  });

  it("obtains fresh state evidence after restoration failure", async () => {
    let freshInspected = false;
    const mockSql: F017SqlRunner = async (sql) => {
      if (sql.includes("jsonb_build_array")) {
        freshInspected = true;
        return JSON.stringify({
          functions: [
            { name: "admin_review_payment", sig: "public.admin_review_payment(uuid, boolean, text)", oid: 1000, has_public: false, has_anon: false, has_authenticated: true, has_service_role: false },
            { name: "record_stripe_payment_intent", sig: "public.record_stripe_payment_intent(uuid, text, text)", oid: 1001, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
            { name: "record_payment_transfer", sig: "public.record_payment_transfer(uuid, text, text, text)", oid: 1002, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
            { name: "ingest_stripe_event", sig: "public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)", oid: 1003, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
          ],
        });
      }
      if (sql.includes("MOCK FORWARD MIGRATION")) {
        throw new Error("disk_full_error");
      }
      return 0;
    };

    await expect(
      executeF017MandatoryRestoration(mockSql, {
        migrationSql: "-- MOCK FORWARD MIGRATION --",
        postflightSql: "-- MOCK POSTFLIGHT SQL --",
      })
    ).rejects.toThrow("FATAL_RESTORATION_FAILURE");

    expect(freshInspected).toBe(true);
  });

  it("reports ACL_STATE_UNKNOWN if fresh inspection after restoration failure also fails", async () => {
    let callCount = 0;
    const mockSql: F017SqlRunner = async (sql) => {
      if (sql.includes("jsonb_build_array")) {
        callCount++;
        if (callCount > 1) throw new Error("database_unreachable");
        // Initial state is drifted
        return JSON.stringify({
          functions: [
            { name: "admin_review_payment", sig: "public.admin_review_payment(uuid, boolean, text)", oid: 1000, has_public: false, has_anon: false, has_authenticated: true, has_service_role: false },
            { name: "record_stripe_payment_intent", sig: "public.record_stripe_payment_intent(uuid, text, text)", oid: 1001, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
            { name: "record_payment_transfer", sig: "public.record_payment_transfer(uuid, text, text, text)", oid: 1002, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
            { name: "ingest_stripe_event", sig: "public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)", oid: 1003, has_public: false, has_anon: false, has_authenticated: false, has_service_role: false },
          ],
        });
      }
      if (sql.includes("MOCK FORWARD MIGRATION")) {
        throw new Error("syntax_error");
      }
      return 0;
    };

    let caughtErr: FatalRecoveryError | undefined;
    try {
      await executeF017MandatoryRestoration(mockSql, {
        migrationSql: "-- MOCK FORWARD MIGRATION --",
        postflightSql: "-- MOCK POSTFLIGHT SQL --",
      });
    } catch (err) {
      caughtErr = err as FatalRecoveryError;
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr?.message).toContain("ACL_STATE_UNKNOWN");
    expect(caughtErr?.recoveryReport?.applicationRoleExposed).toBe("UNKNOWN");
  });
});

describe("HIGH 3 — Real Denial Proof & Scenario 29 Replacement", () => {
  it("executeDeniedRpcProof verifies permission denied for all four retired RPCs", async () => {
    const executedFunctions: string[] = [];
    const mockSql: F017SqlRunner = async (sql) => {
      for (const fn of F017_RETIRED_FUNCTIONS) {
        if (sql.includes(fn)) {
          executedFunctions.push(fn);
          // Simulate PostgreSQL 42501 error
          throw new Error(`permission denied for function ${fn} (SQLSTATE 42501)`);
        }
      }
      return 0;
    };

    await expect(executeDeniedRpcProof(mockSql)).resolves.toBeUndefined();
    expect(executedFunctions).toEqual(F017_RETIRED_FUNCTIONS);
  });

  it("executeDeniedRpcProof throws if any retired RPC is unexpectedly permitted", async () => {
    const mockSql: F017SqlRunner = async (sql) => {
      if (sql.includes("record_stripe_payment_intent")) {
        // Unexpectedly succeeds!
        return 0;
      }
      throw new Error("permission denied for function (SQLSTATE 42501)");
    };

    await expect(executeDeniedRpcProof(mockSql)).rejects.toThrow("Execution was NOT denied for retired RPC: record_stripe_payment_intent");
  });

  it("executeF017Scenario29 asserts postflight, retired denial, and active V1 review RPC health", async () => {
    const executedSteps: string[] = [];
    const mockSql: F017SqlRunner = async (sql) => {
      executedSteps.push(sql.trim());
      if (sql.includes("jsonb_build_array")) {
        return JSON.stringify({
          functions: F017_RETIRED_FUNCTIONS.map((fn, i) => ({
            name: fn,
            sig: F017_RETIRED_SIGNATURES[i],
            oid: 1000 + i,
            has_public: false,
            has_anon: false,
            has_authenticated: false,
            has_service_role: false,
          })),
        });
      }
      if (sql.includes("set local role authenticated")) {
        throw new Error("permission denied for function (SQLSTATE 42501)");
      }
      if (sql.includes("finance_review_bank_transfer_v1")) {
        return [["true"]];
      }
      return 0;
    };

    await expect(executeF017Scenario29(mockSql)).resolves.toBeUndefined();
    expect(executedSteps.some((s) => s.includes("finance_review_bank_transfer_v1"))).toBe(true);
  });
});

describe("HIGH 3 — Real Rollback / Reapply Lifecycle & Mandatory Restoration", () => {
  it("executes complete lifecycle orchestration on happy path", async () => {
    let isAppliedState = true;
    const mockSql: F017SqlRunner = async (sql) => {
      if (sql.includes("jsonb_build_array")) {
        return JSON.stringify({
          functions: F017_RETIRED_FUNCTIONS.map((fn, i) => ({
            name: fn,
            sig: F017_RETIRED_SIGNATURES[i],
            oid: 1000 + i,
            has_public: false,
            has_anon: false,
            has_authenticated: !isAppliedState && fn !== "ingest_stripe_event", // exact rollback baseline
            has_service_role: !isAppliedState,
          })),
        });
      }
      if (sql.includes("MOCK ROLLBACK SQL")) {
        isAppliedState = false;
        return 0;
      }
      if (sql.includes("MOCK FORWARD MIGRATION")) {
        isAppliedState = true;
        return 0;
      }
      if (sql.includes("set local role authenticated")) {
        throw new Error("permission denied for function (SQLSTATE 42501)");
      }
      return 0;
    };

    await expect(
      executeF017LifecycleOrchestration(mockSql, [], {
        migrationSql: "-- MOCK FORWARD MIGRATION --",
        rollbackSql: "-- MOCK ROLLBACK SQL --",
        postflightSql: "-- MOCK POSTFLIGHT SQL --",
      })
    ).resolves.toBeUndefined();
  });

  // Six failure injection paths:
  const failurePoints = [
    { point: "after_rollback", label: "failure immediately after rollback" },
    { point: "during_baseline", label: "failure during baseline verification" },
    { point: "during_compat", label: "failure during compatibility verification" },
    { point: "during_reapply", label: "failure during forward reapply" },
    { point: "during_postflight", label: "failure during postflight" },
    { point: "during_denial", label: "failure during final denial/state verification" },
  ] as const;

  for (const { point, label } of failurePoints) {
    it(`mandatory restoration attempts recovery on ${label}`, async () => {
      let restored = false;
      let isAppliedState = true;

      const mockSql: F017SqlRunner = async (sql) => {
        if (sql.includes("jsonb_build_array")) {
          return JSON.stringify({
            functions: F017_RETIRED_FUNCTIONS.map((fn, i) => ({
              name: fn,
              sig: F017_RETIRED_SIGNATURES[i],
              oid: 1000 + i,
              has_public: false,
              has_anon: false,
              has_authenticated: !isAppliedState && fn !== "ingest_stripe_event",
              has_service_role: !isAppliedState,
            })),
          });
        }
        if (sql.includes("MOCK ROLLBACK SQL")) {
          isAppliedState = false;
          return 0;
        }
        if (sql.includes("MOCK FORWARD MIGRATION")) {
          isAppliedState = true;
          restored = true;
          return 0;
        }
        if (sql.includes("set local role authenticated")) {
          throw new Error("permission denied for function (SQLSTATE 42501)");
        }
        return 0;
      };

      await expect(
        executeF017LifecycleOrchestration(mockSql, [], {
          migrationSql: "-- MOCK FORWARD MIGRATION --",
          rollbackSql: "-- MOCK ROLLBACK SQL --",
          postflightSql: "-- MOCK POSTFLIGHT SQL --",
          failpoint: point,
        })
      ).rejects.toThrow(`injected_failure:${point}`);

      expect(restored, `Mandatory restoration must be attempted for ${label}`).toBe(true);
    });
  }
});

describe("MEDIUM 1 — Structured session-failure classification", () => {
  it.each([
    ["08006", true], ["57014", false], ["P0001", false],
  ])("preserves %s classification through state inspection and mandatory restoration", async (code, transport) => {
    let factoryCalled = false;
    const error = Object.assign(new Error("f016_session_closed"), { code });
    const runner: F017SqlRunner = async () => { throw error; };
    const inspected = await inspectF017State(runner);
    expect(inspected.inspectionIsSessionFailure).toBe(transport);
    await expect(executeF017MandatoryRestoration(runner, {
      migrationSql: "-- MOCK FORWARD --",
      freshSessionFactory: async () => { factoryCalled = true; throw new Error("recovery_connection_unavailable"); },
    })).rejects.toThrow("FATAL_RESTORATION_FAILURE");
    expect(factoryCalled).toBe(transport);
  });
  it.each([
    [{ code: "ECONNRESET" }, true], [{ code: "EPIPE" }, true], [{ sqlState: "08006" }, true], [new Error("f016_session_closed"), true],
    [{ sqlState: "57014", message: "canceling statement due to statement timeout" }, false],
    [{ sqlState: "55P03", message: "canceling statement due to lock timeout" }, false],
    [{ sqlState: "40P01", message: "deadlock detected" }, false], [{ sqlState: "42501", message: "permission denied" }, false],
    [{ sqlState: "P0001", message: "semantic timeout wording" }, false],
    [{ code: "08006", message: "whatever" }, true],
    [{ code: "08003", message: "connection does not exist" }, true],
    [{ code: "57014", message: "timeout" }, false],
    [{ code: "57014", message: "f016_session_closed" }, false],
    [{ code: "P0001", message: "connection failed" }, false],
    [{ code: "40P01", message: "connection failed timeout" }, false],
    [{ code: "42501", message: "session closed" }, false],
    [{ code: "23505", message: "f016_session_closed" }, false],
    [{ code: "42601", message: "connection failed" }, false],
    [{ sqlState: "57014", message: "f016_session_closed" }, false],
    [{ sqlState: "P0001", message: "connection failed" }, false],
    [{ sqlState: "57014", code: "ECONNRESET", message: "f016_session_closed" }, false],
    [{ sqlState: "EPIPE", code: "ECONNRESET" }, false],
    [{ code: "ETIMEDOUT" }, true],
    [{ code: "ECONNREFUSED" }, true],
    [{ code: "UNKNOWN_ERROR", message: "f016_session_closed" }, false],
    [new Error("timeout"), false],
    [new Error("connection failed"), false],
    [new Error("f016_session_query_timeout"), true],
    [new Error("f016_session_lifetime_timeout"), true],
    [new Error("f017_recovery_session_unusable:f016_session_closed"), true],
  ])("classifies %# as %s", (error, expected) => expect(isSessionFailure(error)).toBe(expected));
});

describe("HIGH C — Fresh-session mandatory restoration", () => {
  it("restores on a fresh pinned session after rollback when the lifecycle session expires", async () => {
    let applied = true;
    let expired = false;
    const payload = () => JSON.stringify({ functions: F017_RETIRED_FUNCTIONS.map((name, index) => ({
      name, sig: F017_RETIRED_SIGNATURES[index], oid: 1000 + index,
      has_public: false, has_anon: false,
      has_authenticated: !applied && name !== "ingest_stripe_event", has_service_role: !applied,
    })) });
    const lifecycleRunner: F017SqlRunner = async (sql) => {
      if (expired) throw new Error("f016_session_closed");
      if (sql.includes("jsonb_build_array")) return payload();
      if (sql.includes("MOCK ROLLBACK")) { applied = false; return 0; }
      if (sql.includes("MOCK FORWARD")) { applied = true; return 0; }
      if (sql.includes("set local role authenticated")) throw new Error("permission denied 42501");
      return 0;
    };
    const freshSql: string[] = [];
    let closed = false;
    const expiringScenarios = F016_APPROVED_COMPATIBLE_MANIFEST.map((scenario, index) => ({
      ...scenario,
      handler: async () => { if (index === 0) { expired = true; throw new Error("injected_compatibility_failure"); } },
    }));
    await expect(executeF017LifecycleOrchestration(lifecycleRunner, expiringScenarios, {
      migrationSql: "-- MOCK FORWARD --", rollbackSql: "-- MOCK ROLLBACK --", postflightSql: "-- MOCK POSTFLIGHT --",
      freshSessionFactory: async () => ({

        query: async (sql) => {
          freshSql.push(sql);
          if (sql.includes("jsonb_build_array")) return payload();
          if (sql.includes("MOCK FORWARD")) { applied = true; return 0; }
          if (sql.includes("set local role authenticated")) throw new Error("permission denied 42501");
          return 0;
        },
        close: () => { closed = true; },
      }),
    })).rejects.toThrow("injected_compatibility_failure");
    // The original runner was unusable after rollback; recovery re-applied and
    // verified from the independent session before surfacing the original error.
    expect(applied).toBe(true);
    expect(freshSql.some((sql) => sql.includes("MOCK FORWARD"))).toBe(true);
    expect(closed).toBe(true);
  });

  it("reports fatal recovery evidence when a fresh recovery connection cannot be opened", async () => {
    let applied = true;
    const runner: F017SqlRunner = async (sql) => {
      if (sql.includes("jsonb_build_array")) return JSON.stringify({ functions: F017_RETIRED_FUNCTIONS.map((name, index) => ({ name, sig: F017_RETIRED_SIGNATURES[index], oid: index + 1, has_public: false, has_anon: false, has_authenticated: !applied && name !== "ingest_stripe_event", has_service_role: !applied })) });
      if (sql.includes("ROLLBACK")) { applied = false; return 0; }
      if (!applied) throw new Error("f016_session_closed");
      return 0;
    };
    await expect(executeF017LifecycleOrchestration(runner, [], {
      migrationSql: "-- FORWARD --", rollbackSql: "-- ROLLBACK --", postflightSql: "-- POSTFLIGHT --",
      failpoint: "during_compat",
      freshSessionFactory: async () => { throw new Error("f016_session_transport_error"); },
    })).rejects.toThrow("FATAL_RESTORATION_FAILURE");
  });
});

// Remote verification tasks T036–T046: skipped unless approved remote gate is set
const IS_REMOTE_APPROVED = process.env.F016_REMOTE_LIVE_DB_APPROVED === "1";

describe.skipIf(!IS_REMOTE_APPROVED)("Feature 017 Remote Live Verification (Gated)", () => {
  it("runs the pinned DB lifecycle, real denial proof, approved F016 handlers, rollback baseline, and final recovery", async () => {
    // The gate is intentionally the first runtime operation. openLiveSession uses
    // the same TLS/SCRAM path and target validation retained from Feature 016.
    const target = assertF016LiveTarget();
    expect(target.ref).toBe("mxejnutukgxyccnohglo");
    expect(target.ref).toBe(F016_TARGET_REF);
    let activeSession = await openLiveSession();
    try {
      const runSql: F017SqlRunner = async (sql) => {
        try {
          return await activeSession.query(sql);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes("f016_session_closed") ||
            msg.includes("f016_session_not_ready") ||
            msg.includes("f016_session_lifetime_timeout")
          ) {
            activeSession.close();
            activeSession = await openLiveSession();
            return await activeSession.query(sql);
          }
          throw err;
        }
      };
      const initial = await inspectF017State(runSql);
      if (!initial.isApplied || initial.status !== "RETIRED") {
        throw new Error("f017_remote_lifecycle_requires_applied_postflight_green_state");
      }
      // Orchestration executes all selected F016 handlers, whose withFixture
      // finally blocks clean their own F016 compatibility fixtures.
      await executeF017LifecycleOrchestration(runSql, getF017CompatibleF016Scenarios(F016_LIVE_SCENARIOS), {
        // Recovery is independent of the lifecycle session, whose bounded TTL
        // can expire while the real F016 compatibility handlers are running.
        freshSessionFactory: () => openLiveSession(),
      });
    } finally {
      activeSession.close();
    }
  }, 60 * 60_000);

  it("mandatory restoration", async () => {
    const target = assertF016LiveTarget();
    expect(target.ref).toBe("mxejnutukgxyccnohglo");
    await withLiveSession(async (session) => {
      await executeF017MandatoryRestoration((sql) => session.query(sql));
    });
  }, 2 * 60_000);
});
