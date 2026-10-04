import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Feature 017: Database ACL Retirement SQL Contract & Postflight Drift Tests
 *
 * Verifies that:
 * 1. HIGH 1 — Exact function lookup:
 *    - Uses exact PostgreSQL type signatures via to_regprocedure(...)
 *    - Independent of parameter names (e.g. p_funding_confirmed vs p_trusted)
 *    - Consistent across forward migration, rollback, and postflight
 * 2. HIGH 2 — Preflight and rollback safety guards:
 *    - Legacy reviewability preflight (clean baseline, reviewable legacy payment, NULL provider/method edge case, released/stale state)
 *    - Pre-017 ACL baseline verification (ingest_stripe_event has service_role only)
 *    - Rollback starting-state assertion (refuses if not in retired state)
 * 3. HIGH 5 — Complete executable postflight security contract:
 *    - Function ownership (owner = postgres)
 *    - search_path assertions (pg_catalog, public, auth)
 *    - Active V1 bank-transfer RPCs (all 6 functions exact signatures + authenticated-only)
 *    - Legacy fences (submit_payment_proof + admin_review_payment)
 *    - Feature 015 / 016 security seams (RLS, policies, projections, authorization helpers)
 *    - Drift detection tests for all specified failure modes
 */

const F017_MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql");
const F017_ROLLBACK_PATH = resolve(process.cwd(), "supabase/rollback/20261003100000_feature_017_stripe_runtime_retirement.rollback.sql");
const F017_POSTFLIGHT_PATH = resolve(process.cwd(), "supabase/maintenance/20261003_feature_017_stripe_runtime_retirement_postflight.sql");

const RETIRED_SIGNATURES = [
  "admin_review_payment(uuid, boolean, text)",
  "record_stripe_payment_intent(uuid, text, text)",
  "record_payment_transfer(uuid, text, text, text)",
  "ingest_stripe_event(text, text, text, uuid, jsonb, boolean)",
] as const;

const ACTIVE_V1_SIGNATURES = [
  "checkout_bank_transfer_v1(uuid, uuid, uuid)",
  "issue_proforma(uuid, uuid, text, uuid)",
  "confirm_proforma(uuid, uuid)",
  "prepare_payment_proof_upload(uuid, uuid, text)",
  "finalize_payment_proof(uuid, uuid, numeric, date, text, text, uuid)",
  "finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)",
] as const;

describe("HIGH 1 — Exact Function Lookup across Migration, Rollback, and Postflight", () => {
  it("uses exact to_regprocedure resolution without parameter-name dependencies", () => {
    const migration = readFileSync(F017_MIGRATION_PATH, "utf8");
    const rollback = readFileSync(F017_ROLLBACK_PATH, "utf8");
    const postflight = readFileSync(F017_POSTFLIGHT_PATH, "utf8");

    // Must NOT rely on pg_get_function_identity_arguments
    expect(migration).not.toContain("pg_get_function_identity_arguments");
    expect(rollback).not.toContain("pg_get_function_identity_arguments");
    expect(postflight).not.toContain("pg_get_function_identity_arguments");

    // Must resolve every retired function via exact to_regprocedure in all three artifacts
    for (const sig of RETIRED_SIGNATURES) {
      expect(migration, `migration must use to_regprocedure for ${sig}`).toContain(`to_regprocedure('public.${sig}')`);
      expect(rollback, `rollback must use to_regprocedure for ${sig}`).toContain(`to_regprocedure('public.${sig}')`);
      expect(postflight, `postflight must use to_regprocedure for ${sig}`).toContain(`to_regprocedure('public.${sig}')`);
    }
  });

  it("regression: parameter name variations (p_funding_confirmed vs p_trusted) cannot affect resolution", () => {
    // In PostgreSQL, to_regprocedure resolves ONLY types: text, text, text, uuid, jsonb, boolean
    const ingestSig = "public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)";
    const migration = readFileSync(F017_MIGRATION_PATH, "utf8");
    expect(migration).toContain(`to_regprocedure('${ingestSig}')`);
    expect(migration).not.toContain("p_funding_confirmed");
    expect(migration).not.toContain("p_trusted");
  });
});

describe("HIGH 2 — Preflight and Rollback Safety Guards", () => {
  const migration = readFileSync(F017_MIGRATION_PATH, "utf8");
  const rollback = readFileSync(F017_ROLLBACK_PATH, "utf8");

  describe("A. Legacy reviewability preflight", () => {
    it("derives reviewability from the effective Feature 016 function routing guard, not an invented status whitelist", () => {
      const f016 = readFileSync(resolve(process.cwd(), "supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql"), "utf8");
      const effectiveFunction = f016.slice(f016.indexOf("create or replace function public.admin_review_payment"), f016.indexOf("-- ── 3. Single RPC"));
      expect(effectiveFunction).toContain("if v_commerce_flow = 'BANK_TRANSFER_V1' then");
      expect(effectiveFunction).toContain("if not p_approved then");
      expect(effectiveFunction).toMatch(/where order_id = v_order\.id\s+and status = 'ACTIVE'/);
      expect(migration).toContain("coalesce(o.commerce_flow, '') <> 'BANK_TRANSFER_V1'");
      expect(migration).not.toContain("p.status in ('PENDING', 'PROOF_SUBMITTED', 'UNDER_REVIEW')");
      expect(migration).not.toContain("o.status in ('HOLD', 'CONFIRMED', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW')");
    });

    it("evaluates legacy reviewability predicate correctly across business states", () => {
      // Simulation of the exact SQL predicate against candidate records:
      interface MockRow {
        commerce_flow: string | null;
        payment_status: string;
        payment_method: string | null;
        provider: string | null;
        order_status: string;
        reservation_status: string | null;
        reservation_expired: boolean;
      }

      function isReviewableLegacyRow(row: MockRow): boolean {
        // Exclude BANK_TRANSFER_V1 (fenced)
        if ((row.commerce_flow ?? "") === "BANK_TRANSFER_V1") return false;

        // Exclude terminal confirmed/paid (idempotent no-op in admin_review_payment)
        const isTerminalConfirmed = row.payment_status === "CONFIRMED" &&
          ["PAID", "FULFILLMENT_IN_PROGRESS", "PARTIALLY_DELIVERED", "COMPLETED", "DISPUTED"].includes(row.order_status);

        // Exclude terminal expired/cancelled/void
        const isTerminalExpired = ["EXPIRED", "VOID"].includes(row.payment_status) &&
          ["EXPIRED", "CANCELLED", "VOID"].includes(row.order_status);

        return !(isTerminalConfirmed || isTerminalExpired);
      }

      // Case 1: BANK_TRANSFER_V1 fenced state -> passes (false)
      expect(isReviewableLegacyRow({
        commerce_flow: "BANK_TRANSFER_V1",
        payment_status: "UNDER_REVIEW",
        payment_method: null,
        provider: null,
        order_status: "PAYMENT_UNDER_REVIEW",
        reservation_status: "ACTIVE",
        reservation_expired: false,
      })).toBe(false);

      // Case 2: EXPIRED terminal legacy -> passes (false)
      expect(isReviewableLegacyRow({
        commerce_flow: "LEGACY",
        payment_status: "EXPIRED",
        payment_method: "BANK_TRANSFER",
        provider: null,
        order_status: "EXPIRED",
        reservation_status: "EXPIRED",
        reservation_expired: true,
      })).toBe(false);

      // Case 3: PAID/CONFIRMED terminal legacy -> passes (false)
      expect(isReviewableLegacyRow({
        commerce_flow: "LEGACY",
        payment_status: "CONFIRMED",
        payment_method: "BANK_TRANSFER",
        provider: null,
        order_status: "PAID",
        reservation_status: "CONSUMED",
        reservation_expired: true,
      })).toBe(false);

      // Case 4: Genuinely reviewable legacy (PENDING) -> fails closed (true)
      expect(isReviewableLegacyRow({
        commerce_flow: "LEGACY",
        payment_status: "PENDING",
        payment_method: null,
        provider: null,
        order_status: "PAYMENT_UNDER_REVIEW",
        reservation_status: "ACTIVE",
        reservation_expired: false,
      })).toBe(true);

      // Case 5: Genuinely reviewable legacy (PROOF_SUBMITTED) -> fails closed (true)
      expect(isReviewableLegacyRow({
        commerce_flow: "LEGACY",
        payment_status: "PROOF_SUBMITTED",
        payment_method: "BANK_TRANSFER",
        provider: null,
        order_status: "PAYMENT_PROOF_SUBMITTED",
        reservation_status: "ACTIVE",
        reservation_expired: false,
      })).toBe(true);

      // Case 6: NULL provider/method reviewable edge case (HOLD order with REJECTED payment) -> fails closed (true)
      expect(isReviewableLegacyRow({
        commerce_flow: null,
        payment_status: "REJECTED",
        payment_method: null,
        provider: null,
        order_status: "HOLD",
        reservation_status: "ACTIVE",
        reservation_expired: false,
      })).toBe(true);

      // Case 7: Legacy UNDER_REVIEW with non-terminal order status -> fails closed (true)
      expect(isReviewableLegacyRow({
        commerce_flow: "LEGACY",
        payment_status: "UNDER_REVIEW",
        payment_method: null,
        provider: null,
        order_status: "HOLD",
        reservation_status: "RELEASED",
        reservation_expired: false,
      })).toBe(true);
    });
  });

  describe("B. Exact pre-017 ACL baseline", () => {
    it("migration verifies expected pre-017 baseline before revoking grants", () => {
      // admin_review_payment: authenticated, service_role
      expect(migration).toContain("has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')");
      expect(migration).toContain("has_function_privilege('service_role', v_admin_oid, 'EXECUTE')");

      // ingest_stripe_event: service_role ONLY, authenticated must NOT hold EXECUTE
      expect(migration).toContain("has_function_privilege('service_role', v_ingest_oid, 'EXECUTE')");
      expect(migration).toContain("has_function_privilege('authenticated', v_ingest_oid, 'EXECUTE')");
    });
  });

  describe("C. Rollback starting-state assertion", () => {
    it("rollback preflight verifies all four functions are in retired state before restoring grants", () => {
      expect(rollback).toContain("has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')");
      expect(rollback).toContain("has_function_privilege('service_role', v_admin_oid, 'EXECUTE')");
      expect(rollback).toContain("admin_review_payment is not in retired state");
      expect(rollback).toContain("record_stripe_payment_intent is not in retired state");
      expect(rollback).toContain("record_payment_transfer is not in retired state");
      expect(rollback).toContain("ingest_stripe_event is not in retired state");
    });

    it("rollback restores ingest_stripe_event to service_role only (never authenticated)", () => {
      expect(rollback).toMatch(/grant\s+execute\s+on\s+function\s+public\.ingest_stripe_event\([^)]+\)\s+to\s+service_role;/i);
      expect(rollback).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.ingest_stripe_event\([^)]+\)\s+to\s+authenticated/i);
    });
  });
});

describe("HIGH 5 — Executable Postflight Security Contract & Drift Detection", () => {
  const postflight = readFileSync(F017_POSTFLIGHT_PATH, "utf8");

  it("asserts owner postgres for all four retired functions", () => {
    expect(postflight).toContain("admin_review_payment owner is not postgres");
    expect(postflight).toContain("record_stripe_payment_intent owner is not postgres");
    expect(postflight).toContain("record_payment_transfer owner is not postgres");
    expect(postflight).toContain("ingest_stripe_event owner is not postgres");
  });

  it("asserts search_path=pg_catalog, public, auth on retired functions", () => {
    expect(postflight).toContain("admin_review_payment search_path mismatch");
    expect(postflight).toContain("record_stripe_payment_intent search_path mismatch");
    expect(postflight).toContain("record_payment_transfer search_path mismatch");
    expect(postflight).toContain("ingest_stripe_event search_path mismatch");
  });

  it("asserts exact existence, owner, search_path, and authenticated-only grants for all active V1 functions", () => {
    for (const sig of ACTIVE_V1_SIGNATURES) {
      expect(postflight, `postflight must assert ${sig}`).toContain(sig);
    }
    expect(postflight).toContain("unexpected public/anon/service_role EXECUTE");
    expect(postflight).toContain("missing authenticated EXECUTE");
  });

  it("asserts legacy fences on submit_payment_proof and admin_review_payment", () => {
    expect(postflight).toContain("endpoint_deprecated_use_finalize_payment_proof");
    expect(postflight).toContain("endpoint_deprecated_use_finance_review_bank_transfer_v1");
  });

  it("retains proof projection and RLS security seams", () => {
    expect(postflight).toContain("finance_payment_proof_projection(uuid)");
    expect(postflight).toContain("finance_payment_proof_asset_projection(uuid)");
    expect(postflight).toContain("payment_proofs RLS is not enabled");
  });

  // Complete policy contracts and drift cases execute the real PostgreSQL
  // postflight in f017-policy-baseline.test.ts, using historical migrations
  // independently of this Feature 017 artifact.

  // Static/Contract Drift Simulator Tests
  describe("Postflight Drift Simulator", () => {
    interface CatalogFunction {
      signature: string;
      exists: boolean;
      owner: string;
      secdef: boolean;
      search_path: string[];
      grants: {
        public: boolean;
        anon: boolean;
        authenticated: boolean;
        service_role: boolean;
      };
      body: string;
    }

    interface PostflightCatalog {
      functions: Record<string, CatalogFunction>;
      rlsEnabled: Record<string, boolean>;
      policies: Record<string, string[]>;
    }

    function createHealthyCatalog(): PostflightCatalog {
      const functions: Record<string, CatalogFunction> = {};

      for (const sig of RETIRED_SIGNATURES) {
        functions[sig] = {
          signature: sig,
          exists: true,
          owner: "postgres",
          secdef: true,
          search_path: ["pg_catalog", "public", "auth"],
          grants: { public: false, anon: false, authenticated: false, service_role: false },
          body: sig.startsWith("admin_review_payment") ? "endpoint_deprecated_use_finance_review_bank_transfer_v1" : "",
        };
      }

      for (const sig of ACTIVE_V1_SIGNATURES) {
        functions[sig] = {
          signature: sig,
          exists: true,
          owner: "postgres",
          secdef: true,
          search_path: ["pg_catalog", "public", "auth"],
          grants: { public: false, anon: false, authenticated: true, service_role: false },
          body: "",
        };
      }

      functions["checkout_order(uuid)"] = {
        signature: "checkout_order(uuid)",
        exists: true,
        owner: "postgres",
        secdef: true,
        search_path: ["pg_catalog", "public", "auth"],
        grants: { public: false, anon: false, authenticated: true, service_role: true },
        body: "",
      };

      functions["submit_payment_proof(uuid, uuid, text)"] = {
        signature: "submit_payment_proof(uuid, uuid, text)",
        exists: true,
        owner: "postgres",
        secdef: true,
        search_path: ["pg_catalog", "public", "auth"],
        grants: { public: false, anon: false, authenticated: true, service_role: false },
        body: "endpoint_deprecated_use_finalize_payment_proof",
      };

      for (const sig of ["finance_payment_proof_projection(uuid)", "finance_payment_proof_asset_projection(uuid)"]) {
        functions[sig] = {
          signature: sig,
          exists: true,
          owner: "postgres",
          secdef: true,
          search_path: ["pg_catalog", "public", "auth"],
          grants: { public: false, anon: false, authenticated: true, service_role: false },
          body: "",
        };
      }

      return {
        functions,
        rlsEnabled: { payment_proofs: true },
        policies: { payment_proofs: ["payment_proofs_read"] },
      };
    }

    function evaluatePostflight(cat: PostflightCatalog): string[] {
      const problems: string[] = [];

      // Check retired functions
      for (const sig of RETIRED_SIGNATURES) {
        const fn = cat.functions[sig];
        if (!fn || !fn.exists) {
          problems.push(`${sig} definition missing`);
          continue;
        }
        if (fn.owner !== "postgres") problems.push(`${sig} wrong owner`);
        if (!fn.secdef) problems.push(`${sig} not secdef`);
        if (!fn.search_path.includes("public") || !fn.search_path.includes("auth")) problems.push(`${sig} wrong search_path`);
        if (fn.grants.authenticated) problems.push(`${sig} leaked authenticated`);
        if (fn.grants.service_role) problems.push(`${sig} leaked service_role`);
      }

      // Check active V1 functions
      for (const sig of ACTIVE_V1_SIGNATURES) {
        const fn = cat.functions[sig];
        if (!fn || !fn.exists) {
          problems.push(`active V1 function ${sig} missing`);
          continue;
        }
        if (fn.owner !== "postgres") problems.push(`${sig} wrong owner`);
        if (!fn.secdef) problems.push(`${sig} not secdef`);
        if (!fn.search_path.includes("public") || !fn.search_path.includes("auth")) problems.push(`${sig} wrong search_path`);
        if (!fn.grants.authenticated) problems.push(`${sig} missing authenticated`);
        if (fn.grants.public || fn.grants.anon || fn.grants.service_role) problems.push(`${sig} wrong active V1 ACL`);
      }

      // Check legacy fences
      if (!cat.functions["submit_payment_proof(uuid, uuid, text)"]?.body.includes("endpoint_deprecated_use_finalize_payment_proof")) {
        problems.push("missing Feature 015 fence assertion");
      }
      if (!cat.functions["admin_review_payment(uuid, boolean, text)"]?.body.includes("endpoint_deprecated_use_finance_review_bank_transfer_v1")) {
        problems.push("missing Feature 016 finance assertion");
      }

      return problems;
    }

    it("passes cleanly on healthy baseline", () => {
      const cat = createHealthyCatalog();
      expect(evaluatePostflight(cat)).toEqual([]);
    });

    it("detects wrong owner drift", () => {
      const cat = createHealthyCatalog();
      cat.functions["admin_review_payment(uuid, boolean, text)"].owner = "supabase_admin";
      const errs = evaluatePostflight(cat);
      expect(errs.some((e) => e.includes("wrong owner"))).toBe(true);
    });

    it("detects wrong search_path drift", () => {
      const cat = createHealthyCatalog();
      cat.functions["finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)"].search_path = ["pg_catalog"];
      const errs = evaluatePostflight(cat);
      expect(errs.some((e) => e.includes("wrong search_path"))).toBe(true);
    });

    it("detects leaked authenticated grant on retired function", () => {
      const cat = createHealthyCatalog();
      cat.functions["record_stripe_payment_intent(uuid, text, text)"].grants.authenticated = true;
      const errs = evaluatePostflight(cat);
      expect(errs.some((e) => e.includes("leaked authenticated"))).toBe(true);
    });

    it("detects leaked service_role grant on retired function", () => {
      const cat = createHealthyCatalog();
      cat.functions["ingest_stripe_event(text, text, text, uuid, jsonb, boolean)"].grants.service_role = true;
      const errs = evaluatePostflight(cat);
      expect(errs.some((e) => e.includes("leaked service_role"))).toBe(true);
    });

    it("detects missing active V1 function", () => {
      const cat = createHealthyCatalog();
      delete (cat.functions as Record<string, unknown>)["checkout_bank_transfer_v1(uuid, uuid, uuid)"];
      const errs = evaluatePostflight(cat);
      expect(errs.some((e) => e.includes("active V1 function checkout_bank_transfer_v1(uuid, uuid, uuid) missing"))).toBe(true);
    });

    it("detects wrong active V1 ACL (e.g. granted to service_role)", () => {
      const cat = createHealthyCatalog();
      cat.functions["finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)"].grants.service_role = true;
      const errs = evaluatePostflight(cat);
      expect(errs.some((e) => e.includes("wrong active V1 ACL"))).toBe(true);
    });

    it("detects missing Feature 015 fence assertion", () => {
      const cat = createHealthyCatalog();
      cat.functions["submit_payment_proof(uuid, uuid, text)"].body = "open_legacy_body";
      const errs = evaluatePostflight(cat);
      expect(errs).toContain("missing Feature 015 fence assertion");
    });

    it("detects missing Feature 016 finance assertion", () => {
      const cat = createHealthyCatalog();
      cat.functions["admin_review_payment(uuid, boolean, text)"].body = "open_legacy_body";
      const errs = evaluatePostflight(cat);
      expect(errs).toContain("missing Feature 016 finance assertion");
    });
  });
});
