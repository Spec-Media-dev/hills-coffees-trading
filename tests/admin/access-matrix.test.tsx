import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_AREAS,
  ADMIN_AREA_GROUP_KEYS,
  ADMIN_GROUP_ROLE_FUNCTIONS,
  ADMIN_ROLE_FUNCTIONS,
  ADMIN_SHELL_ROUTES,
  ROLE_FUNCTION_ATTESTS,
  getAdminAreaForPath,
  getVisibleAdminAreas,
} from "@/lib/admin/areas";
import { FOUNDATION_FIXTURES, createAnonymousFixtureClient, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN A — Phase 1 proof for T001 (matrix), T002 (guards), T004 (route-group guards).
 *
 * STRUCTURAL half: the single matrix declares every area exactly once with one approved function,
 * no "any staff" catch-all exists, every route group carries its own layout guard, and navigation
 * is derived from the same matrix.
 *
 * LIVE half: with the REAL fixture sessions this repository already has (WAREHOUSE and FINANCE
 * operators with no organization, and a fully approved trading member with no operational role),
 * the guards call the real database functions and refuse/permit exactly per the matrix. No
 * COMPLIANCE/AUDITOR/ADMIN/SUPER_ADMIN fixture exists yet (Phase 10's T030 owns the full six-role
 * matrix), so those rows are proven structurally here and their live legs are recorded as pending.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const ADMIN_APP = path.join(root, "src", "app", "dashboard-admin");

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

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

/**
 * One area per approved function — every function is exercised live, without resolving identity
 * 21× per fixture (each `checkAreaAccess` re-resolves identity outside a request-scoped cache).
 */
const REPRESENTATIVE_AREAS = ADMIN_ROLE_FUNCTIONS.map((fn) => ADMIN_AREAS.find((area) => area.roleFunction === fn)!);
const LIVE_TIMEOUT_MS = 90_000;

describe("T001 — lib/admin/areas.ts is the single declarative access matrix", () => {
  it("declares every area exactly once (unique key, unique href) with exactly one approved role function", () => {
    const keys = ADMIN_AREAS.map((area) => area.key);
    const hrefs = ADMIN_AREAS.map((area) => area.href);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const area of ADMIN_AREAS) {
      expect(ADMIN_ROLE_FUNCTIONS).toContain(area.roleFunction);
      expect(area.href.startsWith("/dashboard-admin/")).toBe(true);
      expect(ADMIN_AREA_GROUP_KEYS).toContain(area.group);
    }
  });

  it("covers every console group the spec names, and every group's own guard is one of the six approved functions", () => {
    for (const group of ADMIN_AREA_GROUP_KEYS) {
      expect(ADMIN_AREAS.some((area) => area.group === group)).toBe(true);
      expect(ADMIN_ROLE_FUNCTIONS).toContain(ADMIN_GROUP_ROLE_FUNCTIONS[group]);
    }
    expect([...ADMIN_AREA_GROUP_KEYS].sort()).toEqual(["audit", "catalogue", "compliance", "finance", "system", "warehouse"]);
  });

  it("contains no 'any staff' / generic-admin catch-all and reads no membership or capability", () => {
    const src = source("lib/admin", "areas.ts");
    expect(src).not.toMatch(/isStaff|is_staff|anyRole|any_role|hasAnyOperationalRole|operationalRoles\.length\s*>\s*0/);
    expect(src).not.toMatch(/identity.organization|canBuy|canSell|is_org_member|is_authorized_member/);
    // The closed union of approved functions is the ONLY role vocabulary in the file.
    expect(ADMIN_ROLE_FUNCTIONS).toEqual([
      "is_compliance_operator",
      "is_warehouse_operator",
      "is_finance_operator",
      "is_auditor",
      "is_platform_admin",
      "is_super_admin",
    ]);
  });

  it("maps each function to exactly the role the DAL attests for it (no invented hierarchy)", () => {
    const dal = source("lib/auth/dal.ts");
    for (const [fn, role] of Object.entries(ROLE_FUNCTION_ATTESTS)) {
      expect(dal).toContain(`{ fn: "${fn}", role: "${role}" }`);
    }
  });

  it("the stricter System areas require is_super_admin while payment accounts require is_platform_admin — the RLS truth", () => {
    const byKey = Object.fromEntries(ADMIN_AREAS.map((area) => [area.key, area.roleFunction]));
    expect(byKey.roles).toBe("is_super_admin");
    expect(byKey.commission).toBe("is_super_admin");
    expect(byKey.tax).toBe("is_super_admin");
    expect(byKey.shipping).toBe("is_super_admin");
    expect(byKey.paymentAccounts).toBe("is_platform_admin");
    expect(ADMIN_GROUP_ROLE_FUNCTIONS.system).toBe("is_platform_admin");
  });

  it("availability is honest — only the areas with a real workflow are `live` (RUN B: kyb, organizations, listings; RUN D: shipments, inventory); every other area is planned or blocked", () => {
    const live = ADMIN_AREAS.filter((area) => area.availability === "live").map((area) => area.key).sort();
    expect(live).toEqual(["inventory", "kyb", "listings", "organizations", "shipments"]);
    for (const area of ADMIN_AREAS) {
      expect(["live", "planned", "blocked"]).toContain(area.availability);
      if (area.availability === "blocked") expect(area.blocker).toBeTruthy();
    }
  });

  it("getVisibleAdminAreas shapes navigation from attested roles only", () => {
    expect(getVisibleAdminAreas([])).toEqual([]);
    expect(getVisibleAdminAreas(["WAREHOUSE"]).map((a) => a.group)).toEqual(["warehouse", "warehouse"]);
    expect(getVisibleAdminAreas(["FINANCE"]).every((a) => a.group === "finance")).toBe(true);
    // ADMIN alone (as the DAL would attest it: ADMIN + the hierarchical roles) — payment accounts yes, super-only areas no.
    const adminVisible = getVisibleAdminAreas(["ADMIN", "COMPLIANCE", "WAREHOUSE", "FINANCE", "AUDITOR"]).map((a) => a.key);
    expect(adminVisible).toContain("paymentAccounts");
    expect(adminVisible).not.toContain("roles");
    expect(adminVisible).not.toContain("commission");
    const superVisible = getVisibleAdminAreas(["SUPER_ADMIN", "ADMIN", "COMPLIANCE", "WAREHOUSE", "FINANCE", "AUDITOR"]);
    expect(superVisible).toHaveLength(ADMIN_AREAS.length);
  });

  it("resolves an area from a direct URL path, including nested paths", () => {
    expect(getAdminAreaForPath("/dashboard-admin/kyb")?.key).toBe("kyb");
    expect(getAdminAreaForPath("/dashboard-admin/kyb/some-id/")?.key).toBe("kyb");
    expect(getAdminAreaForPath("/dashboard-admin/payment-accounts")?.key).toBe("paymentAccounts");
    expect(getAdminAreaForPath("/dashboard-admin")).toBeNull();
    expect(getAdminAreaForPath("/dashboard-admin/account")).toBeNull();
  });
});

describe("T002 — lib/admin/guards.ts calls the specific approved function, never a generic staff check", () => {
  it("verifyRoleFunction issues supabase.rpc(fn) for the named approved function and fails closed", () => {
    const src = source("lib/admin", "guards.ts");
    expect(src).toContain("await supabase.rpc(fn)");
    expect(src).toContain("if (error) return false;");
    expect(src).toContain('return data === true;');
    expect(src).not.toMatch(/is_staff|isStaff|hasAnyRole|anyOperationalRole/);
    // The area/group guards route through the live function call, not through operationalRoles alone.
    expect(src).toContain("const permitted = await verifyRoleFunction(fn);");
    expect(src).toContain('if (!permitted) return { ok: false, denial: "forbidden" };');
  });

  it("checks the console boundary (anonymous, MFA step-up, no operational role) BEFORE any function call, and never reads a membership", () => {
    const src = source("lib/admin", "guards.ts");
    const shellIndex = src.indexOf("checkConsoleShellAccess");
    const rpcIndex = src.indexOf("await supabase.rpc(fn)");
    expect(shellIndex).toBeGreaterThan(-1);
    expect(src.indexOf("if (!shell.ok) return shell;")).toBeGreaterThan(rpcIndex);
    expect(src).toContain('if (identity.kind !== "authenticated") return { ok: false, denial: "anonymous" };');
    expect(src).toContain('if (identity.requiresMfaStepUp) return { ok: false, denial: "mfa-step-up" };');
    expect(src).toContain('if (identity.operationalRoles.length === 0) return { ok: false, denial: "no-operational-role" };');
    expect(src).not.toMatch(/identity\.organization|organizations\b|canBuy|canSell/);
  });
});

describe("T004 — every route group carries its own server-side guard; every declared area has a guarded page", () => {
  const groupDirs = readdirSync(ADMIN_APP, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
    .map((entry) => entry.name);

  it("one route group per matrix group, each layout calling checkGroupAccess for ITS group", () => {
    expect(groupDirs.map((d) => d.slice(1, -1)).sort()).toEqual([...ADMIN_AREA_GROUP_KEYS].sort());
    for (const group of ADMIN_AREA_GROUP_KEYS) {
      const layout = source("src", "app", "dashboard-admin", `(${group})`, "layout.tsx");
      expect(layout).toContain(`checkGroupAccess("${group}")`);
      expect(layout).toContain("if (!access.ok)");
      expect(layout).toContain("<AdminAccessDenied");
      expect(layout).not.toMatch(/createClient|\.from\(|SERVICE_ROLE/);
    }
  });

  it("the SUPER_ADMIN-only slice of System has its own nested layout calling is_super_admin live", () => {
    const layout = source("src", "app", "dashboard-admin", "(system)", "(super)", "layout.tsx");
    expect(layout).toContain('checkRoleFunctionAccess("is_super_admin")');
    for (const key of ["roles", "commission", "tax", "shipping"]) {
      expect(existsSync(path.join(ADMIN_APP, "(system)", "(super)", key, "page.tsx"))).toBe(true);
    }
    expect(existsSync(path.join(ADMIN_APP, "(system)", "payment-accounts", "page.tsx"))).toBe(true);
  });

  it("every declared area's href resolves to a page under its own group's route folder, rendering the guarded placeholder for that exact key", () => {
    for (const area of ADMIN_AREAS) {
      const segment = area.href.replace("/dashboard-admin/", "");
      const candidates = [
        path.join(ADMIN_APP, `(${area.group})`, segment, "page.tsx"),
        path.join(ADMIN_APP, `(${area.group})`, "(super)", segment, "page.tsx"),
      ];
      const found = candidates.find((candidate) => existsSync(candidate));
      expect(found, `${area.key} has no page under (${area.group})`).toBeTruthy();
      const page = readFileSync(found!, "utf8");
      if (area.availability === "live") {
        // A live area's page performs its OWN area guard (the same function the group layout uses).
        expect(page).toContain(`checkAreaAccess("${area.key}")`);
        expect(page).toContain("<AdminAccessDenied");
      } else {
        expect(page).toContain(`<AdminAreaPlaceholder areaKey="${area.key}" />`);
      }
    }
    // No page exists outside a guarded group except the shell routes (overview, account).
    const topLevelPages = readdirSync(ADMIN_APP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !/^\(.+\)$/.test(entry.name))
      .map((entry) => entry.name);
    expect(topLevelPages.sort()).toEqual(["account"]);
  });

  it("the placeholder page re-verifies its own area's function (segments render in parallel)", () => {
    const src = source("components", "admin", "area-placeholder.tsx");
    expect(src).toContain("await checkAreaAccess(areaKey)");
    expect(src).toContain("<AdminAccessDenied");
  });

  it("the root layout guard predicate is byte-identical to Feature 001's, and the shell still never reads a membership", () => {
    const layout = source("src", "app", "dashboard-admin", "layout.tsx");
    expect(layout).toContain('if (identity.kind !== "authenticated") {');
    expect(layout).toContain("if (identity.requiresMfaStepUp) {");
    expect(layout).toContain("if (identity.operationalRoles.length === 0) {");
    expect(layout).not.toMatch(/identity\.organization/);
    expect(layout).toContain("buildAdminNavGroups(identity.operationalRoles)");
  });
});

describe("T003 — navigation is derived from the matrix and matches the permitted areas", () => {
  it("buildAdminNavGroups renders Overview + Account for no roles, and only the permitted groups otherwise", async () => {
    const { buildAdminNavGroups } = await import("@/components/app/admin-navigation");
    expect(buildAdminNavGroups([]).map((g) => g.key)).toEqual(["overview", "account"]);
    expect(buildAdminNavGroups(["WAREHOUSE"]).map((g) => g.key)).toEqual(["overview", "warehouse", "account"]);
    expect(buildAdminNavGroups(["FINANCE"]).map((g) => g.key)).toEqual(["overview", "finance", "account"]);
    const everything = buildAdminNavGroups(["SUPER_ADMIN", "ADMIN", "COMPLIANCE", "WAREHOUSE", "FINANCE", "AUDITOR"]);
    expect(everything.map((g) => g.key)).toEqual(["overview", "compliance", "warehouse", "finance", "catalogue", "audit", "system", "account"]);
    const hrefs = everything.flatMap((g) => g.items.map((i) => i.href));
    for (const area of ADMIN_AREAS) expect(hrefs).toContain(area.href);
    expect(hrefs).toContain(ADMIN_SHELL_ROUTES.account.href);
  });

  it("admin-navigation reads no role, calls no RPC and declares no area of its own", () => {
    const src = source("components", "app", "admin-navigation.tsx");
    expect(src).not.toMatch(/getRequestIdentity|supabase|\.rpc\(/);
    expect(src).not.toMatch(/href:\s*"\/dashboard-admin\/[a-z]/); // every href comes from the matrix
    expect(src).toContain("getVisibleAdminAreas(roles)");
  });
});

describe("LIVE — real fixture sessions × real role functions (T002/T004 direct-URL refusal)", () => {
  it("WAREHOUSE operator (no organization): permitted in the warehouse group only; forbidden by direct URL everywhere else; never gains member capability", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    await withLiveClient(client, async () => {
      const { checkGroupAccess, checkAreaAccess, checkConsoleShellAccess } = await import("@/lib/admin/guards");
      const shell = await checkConsoleShellAccess();
      expect(shell.ok).toBe(true);
      if (shell.ok) {
        expect(shell.roles).toEqual(["WAREHOUSE"]);
        // Operator/member independence: an operational role alone never grants member capability.
        expect(shell.identity.organization).toBeNull();
        expect(shell.identity.organizations).toEqual([]);
        expect(shell.identity.isAuthorizedMember).toBe(false);
      }
      for (const group of ADMIN_AREA_GROUP_KEYS) {
        const access = await checkGroupAccess(group);
        expect(access.ok, `warehouse → ${group}`).toBe(group === "warehouse");
        if (!access.ok) expect(access.denial).toBe("forbidden");
      }
      for (const area of REPRESENTATIVE_AREAS) {
        const access = await checkAreaAccess(area.key);
        expect(access.ok, `warehouse → ${area.key}`).toBe(area.roleFunction === "is_warehouse_operator");
      }
    });
  }, LIVE_TIMEOUT_MS);

  it("FINANCE operator (no organization): permitted in the finance group only; forbidden by direct URL everywhere else", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
    await withLiveClient(client, async () => {
      const { checkGroupAccess, checkAreaAccess } = await import("@/lib/admin/guards");
      for (const group of ADMIN_AREA_GROUP_KEYS) {
        const access = await checkGroupAccess(group);
        expect(access.ok, `finance → ${group}`).toBe(group === "finance");
      }
      for (const area of REPRESENTATIVE_AREAS) {
        const access = await checkAreaAccess(area.key);
        expect(access.ok, `finance → ${area.key}`).toBe(area.roleFunction === "is_finance_operator");
      }
    });
  }, LIVE_TIMEOUT_MS);

  it("an approved trading MEMBER with no operational role is refused everywhere in the console — shell, every group, every area", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    await withLiveClient(client, async () => {
      const { checkGroupAccess, checkAreaAccess, checkConsoleShellAccess } = await import("@/lib/admin/guards");
      const shell = await checkConsoleShellAccess();
      expect(shell).toEqual({ ok: false, denial: "no-operational-role" });
      for (const group of ADMIN_AREA_GROUP_KEYS) {
        expect(await checkGroupAccess(group)).toEqual({ ok: false, denial: "no-operational-role" });
      }
      for (const area of REPRESENTATIVE_AREAS) {
        const access = await checkAreaAccess(area.key);
        expect(access.ok).toBe(false);
        if (!access.ok) expect(access.denial).toBe("no-operational-role");
      }
    });
  }, LIVE_TIMEOUT_MS);

  it("an anonymous session is refused as anonymous before any role function is consulted", async () => {
    const client = createAnonymousFixtureClient();
    await withLiveClient(client, async () => {
      const { checkGroupAccess } = await import("@/lib/admin/guards");
      expect(await checkGroupAccess("warehouse")).toEqual({ ok: false, denial: "anonymous" });
    });
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: the (finance) route-group layout itself refuses a WAREHOUSE operator with the forbidden state, and the (warehouse) layout admits them", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    await withLiveClient(client, async () => {
      const { render, screen, cleanup } = await import("@testing-library/react");
      const FinanceLayout = (await import("@/src/app/dashboard-admin/(finance)/layout")).default;
      const WarehouseLayout = (await import("@/src/app/dashboard-admin/(warehouse)/layout")).default;

      const refused = await FinanceLayout({ children: "SECRET FINANCE CONTENT" });
      render(refused as React.ReactElement);
      expect(screen.queryByText("SECRET FINANCE CONTENT")).toBeNull();
      expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
      expect(screen.getAllByText(/Required role: Finance/).length).toBeGreaterThan(0);
      cleanup();

      const admitted = await WarehouseLayout({ children: "WAREHOUSE CONTENT" });
      expect(admitted).toBe("WAREHOUSE CONTENT");
    });
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: the anonymous branch redirects to the dedicated operator sign-in, never the member page", async () => {
    const client = createAnonymousFixtureClient();
    await withLiveClient(client, async () => {
      redirectCalls.targets.length = 0;
      const { render, cleanup } = await import("@testing-library/react");
      const ComplianceLayout = (await import("@/src/app/dashboard-admin/(compliance)/layout")).default;
      const refused = await ComplianceLayout({ children: "x" });
      // The layout returns the denial element; rendering it performs the redirect (which throws).
      expect(() => render(refused as React.ReactElement)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
      // React may retry a throwing render once; every recorded target must be the operator sign-in.
      expect(redirectCalls.targets.length).toBeGreaterThan(0);
      expect(new Set(redirectCalls.targets)).toEqual(new Set(["/admin/sign-in/"]));
      cleanup();
    });
  }, LIVE_TIMEOUT_MS);
});
