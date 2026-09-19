import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  RUN_E_CATALOGUE_FIXTURES,
  cleanupAuditorFixture,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  prepareAuditorFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 Phase 10 — T035: `tests/admin/auditor-readonly.test.ts` (this file), the console's
 * dedicated, independently-passing proof that AUDITOR is read-only BY CONSTRUCTION — not by a
 * disabled button. RUN E's `run-e-static.test.tsx`/`run-e-live.test.tsx` proved this as part of a
 * broader Phase 8 sweep; this file re-proves the T035 literal (zero mutation affordances, every
 * mutation path refused, no raw write path exists, DB-OPEN-06 stated honestly, no RLS fix, no
 * service-role workaround) standalone, so `npm test -- admin/auditor-readonly` passes on its own.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}
const AUDIT_FILES = [...walk("src/app/dashboard-admin/(audit)"), "lib/admin/audit.ts", ...walk("components/admin/audit")];

function schemaReport(): { rls_policies: { table_name: string; policy_name: string; using_expression: string | null }[] } {
  const raw = JSON.parse(source("docs", "database", "database-schema-report.json")) as unknown;
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) for (const item of node) {
      const hit = find(item);
      if (hit) return hit;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "database_schema_report" && typeof value === "string") return JSON.parse(value);
        const hit = find(value);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(raw) as ReturnType<typeof schemaReport>;
}

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
const redirectCalls = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectCalls.targets.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}
async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 120_000;
let auditor: SupabaseClient;
let member: SupabaseClient;

beforeAll(async () => {
  prepareAuditorFixture();
  auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  const result = cleanupAuditorFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectAuditorFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T035 — static: no raw write path exists in the audit domain (read-only by construction, not by a disabled button)", () => {
  it("no audit file imports a Server Action, a decision/record form, a mutation hook, or performs an insert/update/upsert/delete/rpc", () => {
    expect(AUDIT_FILES.length).toBeGreaterThanOrEqual(5);
    for (const file of AUDIT_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/\/actions"|"use server"|useActionState|useFormStatus|DecisionForm|RecordForm|<form|onSubmit|onClick|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
      expect(src, file).not.toMatch(/@\/lib\/admin\/(decisions|catalogue|warehouse|roles|commission|pricing-rules|payment-accounts)"/);
    }
  });

  it("no audit file uses a service role, a shared/operational cache, or a raw error passthrough", () => {
    for (const file of AUDIT_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/SERVICE_ROLE|service_role|unstable_cache|"use cache"|cacheTag|cacheLife/);
      expect(src, file).not.toMatch(/error\.message|error\.details|error\.hint/);
    }
  });

  it("DB-OPEN-06 is not silently 'fixed': the schema report's ONLY audit_logs policy is still audit_admin_read = is_platform_admin(), and no migration since the last audit touches it", () => {
    const { rls_policies } = schemaReport();
    const policies = rls_policies.filter((p) => p.table_name === "audit_logs");
    expect(policies.map((p) => p.policy_name)).toEqual(["audit_admin_read"]);
    expect(policies[0].using_expression).toBe("is_platform_admin()");
    // Forward migrations AND the rollback scripts (kept under `supabase/rollback/`, outside the CLI's
    // migration folder) — a rollback must not touch the audit-log policy either.
    for (const dir of ["migrations", "rollback"]) {
      for (const file of readdirSync(path.join(root, "supabase", dir)).filter((f) => f.endsWith(".sql"))) {
        const sql = source("supabase", dir, file);
        expect(sql, `${dir}/${file}`).not.toMatch(/(create|drop|alter)\s+policy[^;]*on\s+public\.audit_logs\b/i);
      }
    }
  });
});

describe("T035 — LIVE: zero mutation affordances render for AUDITOR; every mutation path is refused; a direct table write affects zero rows", () => {
  it("the audit list page and the listing-detail page render no form, no submit button, no input/textarea/select, no decision/record form", async () => {
    await withLiveClient(auditor, async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      await renderPage(await AuditPage({ searchParams: Promise.resolve({}) }));
    });
    const MUTATION_SELECTOR = "form, button[type='submit'], input, textarea, select, [data-decision-form], [data-record-form]";
    expect(document.querySelector(MUTATION_SELECTOR)).toBeNull();
    expect(document.querySelector("[data-audit-read-only]")).not.toBeNull();
    cleanup();

    const listings = await withLiveClient(auditor, async () => (await import("@/lib/admin/audit")).listAuditListings());
    expect(listings.rows.length).toBeGreaterThan(0);
    await withLiveClient(auditor, async () => {
      const { default: ListingDetailPage } = await import("@/src/app/dashboard-admin/(audit)/audit/listings/[offerId]/page");
      await renderPage(await ListingDetailPage({ params: Promise.resolve({ offerId: listings.rows[0]!.id }) }));
    });
    expect(document.querySelector(MUTATION_SELECTOR)).toBeNull();
    cleanup();
  }, LIVE_TIMEOUT_MS);

  it("every mutation path across the console refuses AUDITOR: listing decision, KYB decision, catalogue transition, warehouse operation, role grant, commission policy — six distinct domains", async () => {
    const listing = await withLiveClient(auditor, async () => (await import("@/lib/admin/decisions")).decideListing({ offerId: "06000000-0000-4000-8000-00000000000d", decision: "APPROVED" }));
    expect(listing.ok).toBe(false);
    if (!listing.ok) expect(listing.code).toBe("compliance_not_capable");

    const kyb = await withLiveClient(auditor, async () => (await import("@/lib/admin/decisions")).decideKybApplication({ applicationId: "f0000000-0000-4000-8000-000000000072", decision: "APPROVED" }));
    expect(kyb.ok).toBe(false);
    if (!kyb.ok) expect(kyb.code).toBe("compliance_not_capable");

    const coffee = await withLiveClient(auditor, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: RUN_E_CATALOGUE_FIXTURES.proofCoffeeId, operation: "publish" }));
    expect(coffee.ok).toBe(false);
    if (!coffee.ok) expect(coffee.code).toBe("catalogue_not_capable");

    const warehouse = await withLiveClient(auditor, async () => (await import("@/lib/admin/warehouse")).executeWarehouseOperation({ shipmentId: "00000000-0000-4000-8000-000000000000", operation: "dispatch" }));
    expect(warehouse.ok).toBe(false);
    if (!warehouse.ok) expect(warehouse.code).toBe("warehouse_not_capable");

    const role = await withLiveClient(auditor, async () => (await import("@/lib/admin/roles")).grantPlatformAdminRole({ userId: "00000000-0000-4000-8000-000000000000", role: "COMPLIANCE" }));
    expect(role.ok).toBe(false);
    if (!role.ok) expect(role.code).toBe("system_not_capable");

    const commission = await withLiveClient(auditor, async () => (await import("@/lib/admin/commission")).createCommissionPolicy({ name: "T035 auditor probe", effectiveFrom: "2099-01-01T00:00" }));
    expect(commission.ok).toBe(false);
    if (!commission.ok) expect(commission.code).toBe("system_not_capable");
  }, LIVE_TIMEOUT_MS);

  it("a direct raw table write by AUDITOR affects zero rows (RLS is the backstop, not merely the application check)", async () => {
    const { data: touchedOffer } = await auditor.from("coffee_offers").update({ rejection_reason: "auditor tamper" }).eq("id", "06000000-0000-4000-8000-00000000000d").select("id");
    expect(touchedOffer ?? []).toEqual([]);
    const { data: touchedCoffee } = await auditor.from("coffees").update({ status: "PUBLISHED" }).eq("id", RUN_E_CATALOGUE_FIXTURES.proofCoffeeId).select("id");
    expect(touchedCoffee ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("DB-OPEN-06 is honestly represented: a live zero-row audit_logs read renders the recorded-gap statement, never a raw RLS/Postgres error, and no service-role fallback occurs", async () => {
    const probe = await withLiveClient(auditor, async () => (await import("@/lib/admin/audit")).probeAuditLog({ isPlatformAdmin: false }));
    expect(probe).toEqual({ readable: false, reason: "policy" });
    expect((await auditor.from("audit_logs").select("id").limit(1)).data ?? []).toEqual([]);
    await withLiveClient(auditor, async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      await renderPage(await AuditPage({ searchParams: Promise.resolve({ view: "log" }) }));
    });
    expect(document.querySelector('[data-capability-gap="db-open-06"]')).not.toBeNull();
    expect(document.body.textContent).toMatch(/DB-OPEN-06/);
    expect(document.body.textContent).not.toMatch(/permission denied|row-level security|42501|PGRST/i);
    cleanup();
  }, LIVE_TIMEOUT_MS);

  it("a plain member and an anonymous session are refused before ever reaching the audit area", async () => {
    await withLiveClient(member, async () => {
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      await renderPage(await AuditPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    cleanup();
    await withLiveClient(createAnonymousFixtureClient(), async () => {
      redirectCalls.targets.length = 0;
      const { default: AuditPage } = await import("@/src/app/dashboard-admin/(audit)/audit/page");
      const element = await AuditPage({ searchParams: Promise.resolve({}) });
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
      expect(new Set(redirectCalls.targets)).toEqual(new Set(["/admin/sign-in/"]));
    });
  }, LIVE_TIMEOUT_MS);
});
