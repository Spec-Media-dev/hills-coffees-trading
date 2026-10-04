import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Feature 017: Runtime Absence Contract Verification
 *
 * Enforces specs/017-stripe-runtime-retirement/contracts/runtime-absence.md
 * Audits production scopes (src/, lib/, components/, supabase/functions/, package.json, package-lock.json).
 * Distinguishes active runtime from preserved historical artifacts (migrations, specifications, documentation).
 */

import {
  detectProviderRuntimeViolations,
  isExcludedHistoricalPath,
  listRuntimeFiles,
  stripComments,
} from "./runtime-absence-helpers";

describe("T001 — Feature 017 source-scope helper and exclusion rules", () => {
  it("correctly identifies historical paths as excluded from runtime absence checks", () => {
    expect(isExcludedHistoricalPath("specs/017-stripe-runtime-retirement/spec.md")).toBe(true);
    expect(isExcludedHistoricalPath("supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql")).toBe(true);
    expect(isExcludedHistoricalPath("supabase/rollback/20260922120000_feature_008_stripe_trusted_funding.rollback.sql")).toBe(true);
    expect(isExcludedHistoricalPath("supabase/maintenance/20260922_feature_008_postflight.sql")).toBe(true);
    expect(isExcludedHistoricalPath("tests/finance/f017-history-preservation.test.ts")).toBe(true);
  });

  it("correctly includes production runtime files in audit scope", () => {
    expect(isExcludedHistoricalPath("src/app/dashboard/payments/[orderId]/page.tsx")).toBe(false);
    expect(isExcludedHistoricalPath("lib/finance/read.ts")).toBe(false);
    expect(isExcludedHistoricalPath("components/finance/payment-status-badge.tsx")).toBe(false);
  });

  it("strips real comments while preserving quoted and template URL strings", () => {
    const raw = `
      // Stripe only in a line comment
      /* STRIPE_SECRET_KEY only in a block comment */
      const single = 'https://esm.sh/stripe@14';
      const double = "https://esm.sh/stripe@14";
      const template = \`https://esm.sh/stripe@14\`;
    `;
    const stripped = stripComments(raw);
    expect(stripped).not.toContain("Stripe only in a line comment");
    expect(stripped).not.toContain("STRIPE_SECRET_KEY");
    expect(stripped).toContain("https://esm.sh/stripe@14");
  });

  it("detects Stripe URL imports in single, double, and template strings but permits non-provider URLs", () => {
    for (const specifier of ["'https://esm.sh/stripe@14'", '\"https://esm.sh/stripe@14\"', "`https://esm.sh/stripe@14`"]) {
      expect(detectProviderRuntimeViolations(`import Stripe from ${specifier};`, "supabase/functions/renamed/index.ts"))
        .toContain("stripe_sdk_import in supabase/functions/renamed/index.ts");
    }
    expect(detectProviderRuntimeViolations('import { serve } from "https://deno.land/std/http/server.ts";', "supabase/functions/health/index.ts")).toEqual([]);
  });

  it("lists runtime files across src, lib, and components", () => {
    const files = listRuntimeFiles();
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(isExcludedHistoricalPath(file)).toBe(false);
    }
  });
});

describe("T002 — Static absence assertions in production runtime", () => {
  const runtimeFiles = listRuntimeFiles();

  it("no runtime file imports the Stripe SDK directly", () => {
    const violations: { file: string; line: string }[] = [];
    for (const file of runtimeFiles) {
      const content = readFileSync(file, "utf8");
      const stripped = stripComments(content);
      const lines = stripped.split("\n");
      for (const line of lines) {
        if (/from\s+["'](stripe|@stripe\/stripe-js|@stripe\/react-stripe-js)["']/.test(line)) {
          violations.push({ file, line: line.trim() });
        }
      }
    }
    expect(violations, `Stripe SDK imports found in runtime: ${JSON.stringify(violations)}`).toEqual([]);
  });

  it("no runtime file references StripePaymentCollector or Payment Element controls", () => {
    const violations: string[] = [];
    for (const file of runtimeFiles) {
      const content = readFileSync(file, "utf8");
      const stripped = stripComments(content);
      if (/StripePaymentCollector|loadStripe\s*\(|\.elements\s*\(/.test(stripped)) {
        violations.push(file);
      }
    }
    expect(violations, `Payment Element / StripePaymentCollector found in runtime: ${violations.join(", ")}`).toEqual([]);
  });

  it("no runtime file references requestFunding or provider funding seams", () => {
    const violations: string[] = [];
    for (const file of runtimeFiles) {
      const content = readFileSync(file, "utf8");
      const stripped = stripComments(content);
      if (/\brequestFunding\b|from\s+["'].*\/lib\/finance\/funding["']/.test(stripped)) {
        violations.push(file);
      }
    }
    expect(violations, `requestFunding / funding seam found in runtime: ${violations.join(", ")}`).toEqual([]);
  });

  it("no runtime file reads Stripe secrets or publishable key env variables", () => {
    const violations: { file: string; match: string }[] = [];
    for (const file of runtimeFiles) {
      const content = readFileSync(file, "utf8");
      const stripped = stripComments(content);
      const matches = stripped.match(/(?:process\.env\.)?(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)/g);
      if (matches) {
        violations.push({ file, match: matches.join(", ") });
      }
    }
    expect(violations, `Stripe env reads found in runtime: ${JSON.stringify(violations)}`).toEqual([]);
  });

  it("no deployable stripe-* Edge Function directories exist in supabase/functions/", () => {
    const edgeFunctionDirs = [
      "supabase/functions/stripe-create-payment-intent",
      "supabase/functions/stripe-webhook",
      "supabase/functions/stripe-release-transfer",
    ];
    const presentDirs = edgeFunctionDirs.filter((dir) => existsSync(dir));
    expect(presentDirs, `Deployable Stripe Edge functions still exist: ${presentDirs.join(", ")}`).toEqual([]);
  });

  it("audits supabase/functions/ files for any reintroduced provider runtime content", () => {
    const edgeFiles = listRuntimeFiles(["supabase/functions"]);
    const violations: string[] = [];
    for (const file of edgeFiles) {
      const content = readFileSync(file, "utf8");
      const detected = detectProviderRuntimeViolations(content, file);
      violations.push(...detected);
    }
    expect(violations, `Provider runtime detected in supabase/functions: ${violations.join(", ")}`).toEqual([]);
  });

  it("regression: detectProviderRuntimeViolations catches renamed or reintroduced provider Edge Functions", () => {
    // 1. Renamed edge function importing Stripe via Deno / esm.sh
    const sampleSdkSource = `
      import Stripe from "https://esm.sh/stripe@14.0.0";
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
      Deno.serve(async (req) => { return new Response("ok"); });
    `;
    const sdkViolations = detectProviderRuntimeViolations(sampleSdkSource, "supabase/functions/renamed-billing/index.ts");
    expect(sdkViolations.length).toBeGreaterThanOrEqual(2);
    expect(sdkViolations.some((v) => v.includes("stripe_sdk_import"))).toBe(true);
    expect(sdkViolations.some((v) => v.includes("stripe_env_read"))).toBe(true);

    // 2. Renamed webhook handler calling ingest_stripe_event
    const sampleWebhookSource = `
      import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
      const sig = req.headers.get("stripe-signature");
      const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      await supabase.rpc("ingest_stripe_event", { p_provider: "STRIPE" });
    `;
    const webhookViolations = detectProviderRuntimeViolations(sampleWebhookSource, "supabase/functions/payment-hook/index.ts");
    expect(webhookViolations.length).toBeGreaterThanOrEqual(2);
    expect(webhookViolations.some((v) => v.includes("retired_rpc_caller:ingest_stripe_event"))).toBe(true);
    expect(webhookViolations.some((v) => v.includes("stripe_env_read"))).toBe(true);
  });

  it("allows legitimate non-provider Edge Functions without false rejection", () => {
    const legitimateEdgeSource = `
      import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
      serve(async (req) => {
        return new Response(JSON.stringify({ status: "healthy" }), {
          headers: { "Content-Type": "application/json" },
        });
      });
    `;
    const violations = detectProviderRuntimeViolations(legitimateEdgeSource, "supabase/functions/health-check/index.ts");
    expect(violations).toEqual([]);
  });

  it("retired provider runtime files are completely absent", () => {
    const retiredFiles = [
      "lib/finance/funding.ts",
      "components/finance/stripe-payment-collector.tsx",
      "components/finance/funding-unavailable-notice.tsx",
      "lib/finance/stripe/config.ts",
      "lib/finance/stripe/adapter.ts",
      "lib/finance/stripe/webhook.ts",
      "lib/finance/settlement.ts",
    ];
    const presentFiles = retiredFiles.filter((f) => existsSync(f));
    expect(presentFiles, `Retired runtime files still exist: ${presentFiles.join(", ")}`).toEqual([]);
  });

  it("zero runtime callers exist for retired database functions", () => {
    const retiredRpcs = [
      "admin_review_payment",
      "record_stripe_payment_intent",
      "record_payment_transfer",
      "ingest_stripe_event",
    ];
    const violations: { rpc: string; file: string }[] = [];
    for (const file of runtimeFiles) {
      const content = readFileSync(file, "utf8");
      const stripped = stripComments(content);
      for (const rpc of retiredRpcs) {
        if (new RegExp(`(?:\\.rpc\\(\\s*["']${rpc}["']|\\b${rpc}\\b)`).test(stripped)) {
          violations.push({ rpc, file });
        }
      }
    }
    expect(violations, `Retired RPC callers found in runtime: ${JSON.stringify(violations)}`).toEqual([]);
  });
});

describe("T003 — Dependency-manifest assertions for package.json and package-lock.json", () => {
  it("package.json does not list stripe or @stripe/stripe-js in dependencies or devDependencies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};

    expect(deps["stripe"]).toBeUndefined();
    expect(deps["@stripe/stripe-js"]).toBeUndefined();
    expect(devDeps["stripe"]).toBeUndefined();
    expect(devDeps["@stripe/stripe-js"]).toBeUndefined();
  });

  it("package-lock.json does not list stripe or @stripe/stripe-js in root packages or dependencies", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    if (lock.packages) {
      expect(lock.packages["node_modules/stripe"]).toBeUndefined();
      expect(lock.packages["node_modules/@stripe/stripe-js"]).toBeUndefined();
      const rootPkg = lock.packages[""];
      if (rootPkg && rootPkg.dependencies) {
        expect(rootPkg.dependencies["stripe"]).toBeUndefined();
        expect(rootPkg.dependencies["@stripe/stripe-js"]).toBeUndefined();
      }
    }
    if (lock.dependencies) {
      expect(lock.dependencies["stripe"]).toBeUndefined();
      expect(lock.dependencies["@stripe/stripe-js"]).toBeUndefined();
    }
  });
});
