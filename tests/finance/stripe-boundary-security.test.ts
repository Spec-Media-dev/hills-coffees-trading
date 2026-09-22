import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Feature 008 RUN E (Stripe provider decision) T016/T032 — cross-cutting security proofs: no secret in
 * a client bundle, no direct client provider call, exactly one settlement caller. Source-level (no live
 * database/Stripe account needed) — mirrors T032's own established audit style (`tests/finance/
 * t023-documents-payouts.test.tsx`'s T032 block) and extends it to this run's new files.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

describe("T016 — no Stripe secret ever reaches a client-reachable module", () => {
  const clientFiles = ["src", "components"].flatMap((root) => listFiles(root, [".ts", ".tsx"])).filter((file) => stripComments(readFileSync(file, "utf8")).match(/^\s*["']use client["'];?/m));

  it("at least one client component exists to actually audit (sanity check the walk itself works)", () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it("no 'use client' file reads STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET", () => {
    for (const file of clientFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} must not read STRIPE_SECRET_KEY`).not.toMatch(/STRIPE_SECRET_KEY/);
      expect(source, `${file} must not read STRIPE_WEBHOOK_SECRET`).not.toMatch(/STRIPE_WEBHOOK_SECRET/);
    }
  });

  it("the Stripe payment collector never imports lib/finance/stripe/config.ts or lib/finance/stripe/adapter.ts (the secret-touching modules)", () => {
    const source = stripComments(readFileSync("components/finance/stripe-payment-collector.tsx", "utf8"));
    expect(source).not.toMatch(/lib\/finance\/stripe\/config/);
    expect(source).not.toMatch(/lib\/finance\/stripe\/adapter/);
    expect(source).not.toMatch(/process\.env/);
  });

  it("the Stripe payment collector receives its publishable key ONLY as a prop, never computes it itself", () => {
    const source = stripComments(readFileSync("components/finance/stripe-payment-collector.tsx", "utf8"));
    expect(source).toMatch(/publishableKey\s*:\s*string/);
    expect(source).not.toMatch(/stripePublishableKey\s*\(/);
  });
});

describe("T012/T016 — no direct client provider call bypasses the Edge/DB boundary", () => {
  it("no client-reachable file imports the Stripe SDK directly", () => {
    const clientFiles = ["src", "components"].flatMap((root) => listFiles(root, [".ts", ".tsx"])).filter((file) => stripComments(readFileSync(file, "utf8")).match(/^\s*["']use client["'];?/m));
    for (const file of clientFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} must not import the stripe SDK`).not.toMatch(/from ["']stripe["']|from ["']@stripe\/react-stripe-js["']/);
    }
  });

  it("lib/finance/stripe/adapter.ts and webhook.ts are never imported by a 'use client' file", () => {
    const clientFiles = ["src", "components"].flatMap((root) => listFiles(root, [".ts", ".tsx"])).filter((file) => stripComments(readFileSync(file, "utf8")).match(/^\s*["']use client["'];?/m));
    for (const file of clientFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} must not import stripe/adapter`).not.toMatch(/lib\/finance\/stripe\/adapter/);
      expect(source, `${file} must not import stripe/webhook`).not.toMatch(/lib\/finance\/stripe\/webhook/);
    }
  });
});

describe("T018/T032 — admin_review_payment() has exactly one application caller: lib/finance/settlement.ts", () => {
  const roots = ["src", "lib", "components"];
  const callSites: string[] = [];
  for (const root of roots) {
    for (const file of listFiles(root, [".ts", ".tsx"])) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes("admin_review_payment") && file !== path.join("lib", "finance", "settlement.ts")) {
        callSites.push(file);
      }
    }
  }

  it("no file under src/, lib/, or components/ other than lib/finance/settlement.ts references admin_review_payment", () => {
    expect(callSites).toEqual([]);
  });

  it("lib/finance/settlement.ts performs no direct ownership/inventory/reservation/payout/order mutation of its own", () => {
    const source = stripComments(readFileSync("lib/finance/settlement.ts", "utf8"));
    expect(source).not.toMatch(/\.from\(["'](inventory_positions|inventory_ownership_events|inventory_reservations|payouts|orders|order_items|coffee_offers|storage_allocations)["']\)/);
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).toMatch(/\.rpc\(["']admin_review_payment["']/);
  });

  it("settlement.ts reads no service-role client", () => {
    const source = stripComments(readFileSync("lib/finance/settlement.ts", "utf8"));
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});

describe("T012 — ingest_stripe_event()/record_payment_transfer() have exactly one application-side caller each", () => {
  const roots = ["src", "lib", "components"];
  const ingestCallSites: string[] = [];
  const transferCallSites: string[] = [];
  for (const root of roots) {
    for (const file of listFiles(root, [".ts", ".tsx"])) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes("ingest_stripe_event")) ingestCallSites.push(file);
      if (source.includes("record_payment_transfer")) transferCallSites.push(file);
    }
  }

  it("ingest_stripe_event is referenced nowhere under src/lib/components (it is called ONLY from the Deno Edge Function, which lives outside this Node project's tree)", () => {
    expect(ingestCallSites).toEqual([]);
  });

  it("record_payment_transfer is referenced nowhere under src/lib/components (same reason)", () => {
    expect(transferCallSites).toEqual([]);
  });
});
