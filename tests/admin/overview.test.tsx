import { readFileSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ADMIN_AREA_GROUP_KEYS, ROLE_FUNCTION_ATTESTS, getAdminArea, type AdminRoleFunction } from "@/lib/admin/areas";
import { ADMIN_OVERVIEW_QUERIES, ADMIN_OVERVIEW_SECTION_ROLE, type AdminOverviewSection } from "@/lib/admin/read";
import { FOUNDATION_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 010 T006 — the overview derives from real read functions, is role-shaped, fabricates
 * nothing, and states its deferred/blocked metrics honestly.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
/** Source with block/line comments removed — the assertions below are about CODE, not the prose documenting it. */
const code = (...segments: string[]) => source(...segments).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

type Policy = { table_name: string; command: string; using_expression: string | null };
function policies(): Policy[] {
  const raw = JSON.parse(readFileSync(path.join(root, "docs", "database", "database-schema-report.json"), "utf8"));
  const report = JSON.parse(raw[0].database_schema_report);
  return report.rls_policies as Policy[];
}

describe("T006 — every overview metric is a real, role-readable query (structural cross-check against the approved policy set)", () => {
  it("every metric's table carries a SELECT/ALL policy whose USING expression names the section's own role function", () => {
    const all = policies();
    for (const group of ADMIN_AREA_GROUP_KEYS) {
      // The function that attests the SECTION's role (audit is the recorded exception: ADMIN-only).
      const sectionRole = group === "audit" ? "ADMIN" : ADMIN_OVERVIEW_SECTION_ROLE[group];
      const fn = (Object.keys(ROLE_FUNCTION_ATTESTS) as AdminRoleFunction[]).find((candidate) => ROLE_FUNCTION_ATTESTS[candidate] === sectionRole)!;
      for (const query of ADMIN_OVERVIEW_QUERIES[group]) {
        const readable = all.some(
          (p) => p.table_name === query.table && (p.command === "SELECT" || p.command === "ALL") && (p.using_expression ?? "").includes(`${fn}()`),
        );
        expect(readable, `${group}.${query.key} on ${query.table} readable by ${fn}()`).toBe(true);
        // Every metric links to a declared console area.
        expect(getAdminArea(query.areaKey)?.group).toBe(group);
      }
    }
  });

  it("the audit-log count is deliberately gated to ADMIN because audit_logs is is_platform_admin()-only (DB-OPEN-06)", () => {
    const audit = policies().filter((p) => p.table_name === "audit_logs");
    expect(audit.some((p) => (p.using_expression ?? "").includes("is_auditor()"))).toBe(false);
    expect(source("lib", "admin", "read.ts")).toContain('if (group === "audit" && !attested.has("ADMIN"))');
    expect(ADMIN_OVERVIEW_SECTION_ROLE.audit).toBe("AUDITOR");
  });

  it("the read layer performs counts only — no sums, no money arithmetic, no cache, no service role", () => {
    const src = code("lib", "admin", "read.ts");
    expect(src).toContain('{ count: "exact", head: true }');
    expect(src).not.toMatch(/\.sum\(|reduce\(|buyerTotal|sellerNet|commissionAmount\b.*\+|revenue|profit|balance/i);
    expect(src).not.toMatch(/unstable_cache|"use cache"|cacheTag|SERVICE_ROLE|service_role/);
    expect(src).toContain("if (error || typeof count !== \"number\") return null;");
  });

  it("the page and tile component contain no sample, seeded or hardcoded figure", () => {
    const page = code("src", "app", "dashboard-admin", "page.tsx");
    const tiles = code("components", "admin", "overview.tsx");
    for (const src of [page, tiles]) {
      expect(src).not.toMatch(/\$\d|€\d|AED\s?\d|USD\s?\d|\b\d{2,}\s+(orders|members|organizations|disputes|pending|shipments)/i);
      expect(src).not.toMatch(/sample|placeholder value|mock|estimated|dummy|lorem/i);
    }
    expect(page).toContain("getAdminOverview(identity.operationalRoles)");
    expect(page).toContain('identity.kind !== "authenticated" ||\n    identity.operationalRoles.length === 0');
  });
});

describe("T006 — honest rendering states", () => {
  it("a genuine zero renders as an explicit empty state (never a bare 0), null renders as unavailable, and notes explain dependencies", async () => {
    const { AdminOverviewSections } = await import("@/components/admin/overview");
    const sections: AdminOverviewSection[] = [
      { group: "finance", metrics: [
        { key: "paymentsProofSubmitted", areaKey: "payments", value: 0 },
        { key: "paymentsUnderReview", areaKey: "payments", value: 0 },
        { key: "payoutsPending", areaKey: "payouts", value: 0 },
      ], note: "financeMoneyDeferred" },
      { group: "warehouse", metrics: [
        { key: "shipmentsRequested", areaKey: "shipments", value: 3 },
        { key: "inventoryPositions", areaKey: "inventory", value: null },
      ] },
      { group: "audit", metrics: [{ key: "auditEvents24h", areaKey: "audit", value: null }], note: "auditOpen06" },
    ];
    render(<AdminOverviewSections sections={sections} />);

    expect(document.querySelectorAll('[data-metric-state="empty"]')).toHaveLength(3);
    expect(document.querySelector('[data-overview-empty="finance"]')).not.toBeNull();
    expect(document.querySelector('[data-metric="paymentsProofSubmitted"]')?.textContent).not.toMatch(/\b0\b/);
    expect(screen.getAllByText("None").length).toBe(3);

    expect(document.querySelector('[data-metric="shipmentsRequested"][data-metric-state="value"]')?.textContent).toContain("3");
    expect(document.querySelector('[data-metric="inventoryPositions"][data-metric-state="unavailable"]')).not.toBeNull();
    expect(document.querySelector('[data-overview-empty="warehouse"]')).toBeNull();

    expect(document.querySelector('[data-overview-note="financeMoneyDeferred"]')?.textContent).toMatch(/Feature 008/);
    expect(document.querySelector('[data-overview-note="auditOpen06"]')?.textContent).toMatch(/DB-OPEN-06/);
    // Every tile links to its declared area (which states live/planned/blocked itself).
    expect(document.querySelector('[data-metric="shipmentsRequested"]')?.getAttribute("href")).toBe("/dashboard-admin/shipments");
  });

  it("no sections at all renders nothing fabricated", async () => {
    const { AdminOverviewSections } = await import("@/components/admin/overview");
    const { container } = render(<AdminOverviewSections sections={[]} />);
    expect(container.querySelectorAll("[data-metric]")).toHaveLength(0);
  });
});

describe("T006 — LIVE role-shaped overview from the real identity and real counts", () => {
  it("a WAREHOUSE operator receives ONLY the warehouse section, every figure a real number (never null) read under their own session", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    await withLiveClient(client, async () => {
      const { getRequestIdentity } = await import("@/lib/auth/dal");
      const { getAdminOverview } = await import("@/lib/admin/read");
      const identity = await getRequestIdentity();
      expect(identity.kind).toBe("authenticated");
      if (identity.kind !== "authenticated") return;
      const sections = await getAdminOverview(identity.operationalRoles);
      expect(sections.map((s) => s.group)).toEqual(["warehouse"]);
      for (const metric of sections[0]!.metrics) {
        expect(typeof metric.value, metric.key).toBe("number");
        expect(metric.value).toBeGreaterThanOrEqual(0);
      }
      // Cross-check one figure against a direct count under the same session: the tile is the query.
      const { count } = await client.from("order_shipments").select("id", { count: "exact", head: true }).in("status", ["REQUESTED"]);
      expect(sections[0]!.metrics.find((m) => m.key === "shipmentsRequested")!.value).toBe(count);
    });
  }, 60_000);

  it("a FINANCE operator receives ONLY the finance section (no Compliance, no Warehouse), with the money-deferred note", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
    await withLiveClient(client, async () => {
      const { getRequestIdentity } = await import("@/lib/auth/dal");
      const { getAdminOverview } = await import("@/lib/admin/read");
      const identity = await getRequestIdentity();
      if (identity.kind !== "authenticated") throw new Error("finance fixture not authenticated");
      const sections = await getAdminOverview(identity.operationalRoles);
      expect(sections.map((s) => s.group)).toEqual(["finance"]);
      expect(sections[0]!.note).toBe("financeMoneyDeferred");
      for (const metric of sections[0]!.metrics) expect(typeof metric.value, metric.key).toBe("number");
    });
  }, 60_000);

  it("a member with no operational role gets no section at all", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    await withLiveClient(client, async () => {
      const { getRequestIdentity } = await import("@/lib/auth/dal");
      const { getAdminOverview } = await import("@/lib/admin/read");
      const identity = await getRequestIdentity();
      if (identity.kind !== "authenticated") throw new Error("member fixture not authenticated");
      expect(identity.operationalRoles).toEqual([]);
      expect(await getAdminOverview(identity.operationalRoles)).toEqual([]);
    });
  }, 60_000);
});
