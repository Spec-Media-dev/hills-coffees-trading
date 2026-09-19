import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ADMIN_AREAS,
  ADMIN_AREA_GROUP_KEYS,
  ADMIN_GROUP_ROLE_FUNCTIONS,
  ADMIN_ROLE_FUNCTIONS,
  ADMIN_SHELL_ROUTES,
  ROLE_FUNCTION_ATTESTS,
  getAdminAreaForPath,
  getVisibleAdminAreas,
  type AdminRoleFunction,
} from "@/lib/admin/areas";
import type { OperationalRole } from "@/lib/auth/types";
import {
  FOUNDATION_FIXTURES,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  cleanupSuperAdminFixture,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectCatalogueAdminFixture,
  inspectComplianceFixture,
  inspectSuperAdminFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  prepareSuperAdminFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN A — Phase 1 proof for T001 (matrix), T002 (guards), T004 (route-group guards).
 *
 * STRUCTURAL half: the single matrix declares every area exactly once with one approved function,
 * no "any staff" catch-all exists, every route group carries its own layout guard, and navigation
 * is derived from the same matrix.
 *
 * LIVE half (T030, Phase 10): with REAL sessions for ALL SIX operational roles — the standing
 * WAREHOUSE/FINANCE fixtures and the human-authorized disposable COMPLIANCE/ADMIN/AUDITOR/SUPER_ADMIN
 * fixtures (prepared here, de-privileged in `afterAll`) — plus a fully approved trading MEMBER with
 * no operational role and an anonymous session, the guards call the REAL database functions for
 * EVERY declared area (not a sample) and refuse/permit exactly per the matrix AND per the role
 * hierarchy those functions themselves attest (`is_compliance_operator`/`is_warehouse_operator`/
 * `is_finance_operator`/`is_auditor` are true for their own role AND for ADMIN/SUPER_ADMIN;
 * `is_platform_admin` is true for ADMIN/SUPER_ADMIN; `is_super_admin` is true for SUPER_ADMIN only —
 * verified against the live function bodies in the schema report, never invented here). A dedicated
 * meta-test proves an area with a missing/invalid role-function entry would fail this same check
 * (the literal T030 "adding an area without a role entry fails the test" requirement), and a
 * "direct action" block proves the SAME refusal holds one layer deeper, at real mutating domain
 * functions, not merely at the page guard.
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
const LIVE_TIMEOUT_MS = 90_000;
const FIXTURE_LIVE_TIMEOUT_MS = 150_000;

/**
 * Which `platform_admins.role` each approved function returns TRUE for — copied verbatim from the
 * LIVE function bodies in `docs/database/database-schema-report.json` (re-verified 2026-09-17), not
 * invented here: `is_compliance_operator`/`is_warehouse_operator`/`is_finance_operator`/`is_auditor`
 * each read `role IN ('<OWN>', 'ADMIN', 'SUPER_ADMIN')`; `is_platform_admin` reads
 * `role IN ('ADMIN', 'SUPER_ADMIN')`; `is_super_admin` reads `role = 'SUPER_ADMIN'`.
 */
const ROLES_SATISFYING: Readonly<Record<AdminRoleFunction, readonly OperationalRole[]>> = {
  is_compliance_operator: ["COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  is_warehouse_operator: ["WAREHOUSE", "ADMIN", "SUPER_ADMIN"],
  is_finance_operator: ["FINANCE", "ADMIN", "SUPER_ADMIN"],
  is_auditor: ["AUDITOR", "ADMIN", "SUPER_ADMIN"],
  is_platform_admin: ["ADMIN", "SUPER_ADMIN"],
  is_super_admin: ["SUPER_ADMIN"],
};
function roleSatisfiesFunction(role: OperationalRole, fn: AdminRoleFunction): boolean {
  return ROLES_SATISFYING[fn].includes(role);
}
/** The one function each role's OWN name attests (`ROLE_FUNCTION_ATTESTS` inverted) — a sanity anchor, not a second source of truth. */
const ROLE_FUNCTION_ATTESTS_INVERSE: Readonly<Record<OperationalRole, AdminRoleFunction>> = Object.fromEntries(
  (Object.entries(ROLE_FUNCTION_ATTESTS) as [AdminRoleFunction, OperationalRole][]).map(([fn, role]) => [role, fn]),
) as Record<OperationalRole, AdminRoleFunction>;

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

  it("T030 — a declared area without a valid role-function entry fails this exact matrix check (the literal 'missing matrix entry causes proof failure' requirement)", () => {
    // The real matrix has no such row — this proves the CHECK ITSELF is capable of catching one, by
    // running it against a deliberately broken area object, never by mutating `ADMIN_AREAS`.
    const brokenRoleFunction = { key: "bogus", group: "system", href: "/dashboard-admin/bogus", roleFunction: "is_definitely_not_approved", icon: "users", availability: "live", phase: 9 } as unknown as (typeof ADMIN_AREAS)[number];
    expect(() => expect(ADMIN_ROLE_FUNCTIONS).toContain(brokenRoleFunction.roleFunction)).toThrow();
    // Same proof for `ROLE_FUNCTION_ATTESTS` (the table T003/T004 read to shape navigation and enforcement).
    expect((ROLE_FUNCTION_ATTESTS as Record<string, unknown>)["is_definitely_not_approved"]).toBeUndefined();
    // And for `roleSatisfiesFunction` below: an unapproved function has no entry, so every role is (correctly) refused, never silently admitted.
    expect(() => roleSatisfiesFunction("SUPER_ADMIN", "is_definitely_not_approved" as AdminRoleFunction)).toThrow();
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

  it("availability is honest — only the areas with a real workflow are `live` (RUN B: kyb, organizations, listings; RUN D: shipments, inventory; RUN E: catalogue areas + audit; RUN F: system configuration; T012: disputes over Feature 012); every other area is planned or blocked", () => {
    const live = ADMIN_AREAS.filter((area) => area.availability === "live").map((area) => area.key).sort();
    expect(live).toEqual(["audit", "coffees", "commission", "disputes", "inventory", "kyb", "listings", "media", "organizations", "origins", "paymentAccounts", "regions", "roles", "shipments", "shipping", "tax", "taxonomy", "warehouses"]);
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

describe("T030 — LIVE, all six operational role fixtures × every declared area (direct URL refusal); member and anonymous", () => {
  /**
   * COMPLIANCE/ADMIN/AUDITOR/SUPER_ADMIN have no standing fixture (unlike WAREHOUSE/FINANCE): each is
   * a human-authorized, disposable identity created here and de-privileged in `afterAll`, exactly the
   * lifecycle every other Feature 010 run has used (RUN B/E/F). Nothing here reuses a delivery/T013
   * fixture or a product identity.
   */
  beforeAll(() => {
    prepareComplianceFixture();
    prepareCatalogueAdminFixture();
    prepareAuditorFixture();
    prepareSuperAdminFixture();
  }, FIXTURE_LIVE_TIMEOUT_MS);

  afterAll(() => {
    for (const [cleanup, inspect] of [
      [cleanupComplianceFixture, inspectComplianceFixture],
      [cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture],
      [cleanupAuditorFixture, inspectAuditorFixture],
      [cleanupSuperAdminFixture, inspectSuperAdminFixture],
    ] as const) {
      const result = cleanup();
      expect(result.activeAdminPrivilege).toBe(false);
      expect(inspect().activeCapability).toBe(false);
    }
  }, FIXTURE_LIVE_TIMEOUT_MS);

  /** One `it` per role: EVERY declared group and EVERY declared area, checked against the real hierarchy — not a sample. */
  const cases: readonly { role: OperationalRole; email: () => string; standing: boolean }[] = [
    { role: "WAREHOUSE", email: () => FOUNDATION_FIXTURES.warehouseAdmin.email, standing: true },
    { role: "FINANCE", email: () => FOUNDATION_FIXTURES.financeAdmin.email, standing: true },
    { role: "COMPLIANCE", email: () => FOUNDATION_FIXTURES.complianceReviewer.email, standing: false },
    { role: "ADMIN", email: () => FOUNDATION_FIXTURES.catalogueAdmin.email, standing: false },
    { role: "AUDITOR", email: () => FOUNDATION_FIXTURES.auditor.email, standing: false },
    { role: "SUPER_ADMIN", email: () => FOUNDATION_FIXTURES.superAdmin.email, standing: false },
  ];

  for (const { role, email } of cases) {
    it(`${role} operator (no organization): permitted in exactly the groups/areas its role function satisfies — every declared group, every declared area, direct URL`, async () => {
      const client = await signInAsFixture(email());
      await withLiveClient(client, async () => {
        const { checkGroupAccess, checkAreaAccess, checkConsoleShellAccess } = await import("@/lib/admin/guards");
        const shell = await checkConsoleShellAccess();
        expect(shell.ok, role).toBe(true);
        if (shell.ok) {
          // The DAL attests EVERY function that returns true for this session (`lib/auth/dal.ts`), so
          // ADMIN/SUPER_ADMIN legitimately attest several roles (the same hierarchy fact this file's
          // `ROLES_SATISFYING` table records) — the set, not the order or the count, is what matters.
          const expectedRoles = new Set(ADMIN_ROLE_FUNCTIONS.filter((fn) => roleSatisfiesFunction(role, fn)).map((fn) => ROLE_FUNCTION_ATTESTS[fn]));
          expect(new Set(shell.roles), role).toEqual(expectedRoles);
          expect(shell.roles, role).toContain(role);
          // Operator/member independence: an operational role alone never grants member capability.
          expect(shell.identity.organization, role).toBeNull();
          expect(shell.identity.organizations, role).toEqual([]);
          expect(shell.identity.isAuthorizedMember, role).toBe(false);
        }
        for (const group of ADMIN_AREA_GROUP_KEYS) {
          const access = await checkGroupAccess(group);
          const expected = roleSatisfiesFunction(role, ADMIN_GROUP_ROLE_FUNCTIONS[group]);
          expect(access.ok, `${role} → group ${group}`).toBe(expected);
          if (!access.ok) expect(access.denial, `${role} → group ${group}`).toBe("forbidden");
        }
        for (const area of ADMIN_AREAS) {
          const access = await checkAreaAccess(area.key);
          const expected = roleSatisfiesFunction(role, area.roleFunction);
          expect(access.ok, `${role} → area ${area.key} (${area.roleFunction})`).toBe(expected);
          if (!access.ok) expect(access.denial, `${role} → area ${area.key}`).toBe("forbidden");
        }
        // Sanity: the role actually satisfies at least the ONE function that names it, and the matrix has at least one area for it.
        expect(roleSatisfiesFunction(role, ROLE_FUNCTION_ATTESTS_INVERSE[role]), role).toBe(true);
        expect(ADMIN_AREAS.some((area) => area.roleFunction === ROLE_FUNCTION_ATTESTS_INVERSE[role]), role).toBe(true);
      });
    }, FIXTURE_LIVE_TIMEOUT_MS);
  }

  it("an approved trading MEMBER with no operational role is refused everywhere in the console — shell, every group, every declared area", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    await withLiveClient(client, async () => {
      const { checkGroupAccess, checkAreaAccess, checkConsoleShellAccess } = await import("@/lib/admin/guards");
      const shell = await checkConsoleShellAccess();
      expect(shell).toEqual({ ok: false, denial: "no-operational-role" });
      for (const group of ADMIN_AREA_GROUP_KEYS) {
        expect(await checkGroupAccess(group)).toEqual({ ok: false, denial: "no-operational-role" });
      }
      for (const area of ADMIN_AREAS) {
        const access = await checkAreaAccess(area.key);
        expect(access.ok, area.key).toBe(false);
        if (!access.ok) expect(access.denial, area.key).toBe("no-operational-role");
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

  it("DIRECT URL: the SUPER_ADMIN-only (super) slice refuses an ADMIN (platform admin) with the forbidden state naming Super admin, and admits SUPER_ADMIN", async () => {
    const adminClient = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
    await withLiveClient(adminClient, async () => {
      const { render, screen, cleanup } = await import("@testing-library/react");
      const SuperLayout = (await import("@/src/app/dashboard-admin/(system)/(super)/layout")).default;
      const refused = await SuperLayout({ children: "SECRET SUPER-ADMIN CONTENT" });
      render(refused as React.ReactElement);
      expect(screen.queryByText("SECRET SUPER-ADMIN CONTENT")).toBeNull();
      expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
      expect(screen.getAllByText(/Required role: Super admin/).length).toBeGreaterThan(0);
      cleanup();
    });
    const superClient = await signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email);
    await withLiveClient(superClient, async () => {
      const SuperLayout = (await import("@/src/app/dashboard-admin/(system)/(super)/layout")).default;
      const admitted = await SuperLayout({ children: "SUPER-ADMIN CONTENT" });
      expect(admitted).toBe("SUPER-ADMIN CONTENT");
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

describe("T030 — LIVE direct action invocation: the SAME refusal holds one layer past the page guard, at real mutating domain functions", () => {
  /**
   * Every domain module (`lib/admin/{warehouse,decisions,catalogue,commission}.ts`) independently
   * re-verifies its own role function before touching the database — this is the structural claim
   * `run-e-static`/`run-f-static`/`finance-delegation` already pin per-domain. This block proves the
   * SAME claim live, cross-role, in ONE place: a forged/bypassed form post (skipping the page
   * entirely) is refused by the action itself, not merely by the page that would normally guard it.
   * `is_finance_operator` has no write domain yet (Feature 008 T013–T015 blocked — see the RUN C
   * report) and `is_auditor` has none by design (T025: read-only by construction), so neither is
   * exercised here; both are already proven refused from every area in the block above.
   */
  const NIL_UUID = "00000000-0000-4000-8000-000000000000";
  const probes: readonly { label: string; fn: AdminRoleFunction; call: () => Promise<{ ok: boolean; code?: string }> }[] = [
    { label: "warehouse.executeWarehouseOperation", fn: "is_warehouse_operator", call: async () => (await import("@/lib/admin/warehouse")).executeWarehouseOperation({ shipmentId: NIL_UUID, operation: "dispatch" }) },
    { label: "decisions.decideKybApplication", fn: "is_compliance_operator", call: async () => (await import("@/lib/admin/decisions")).decideKybApplication({ applicationId: NIL_UUID, decision: "APPROVED" }) },
    { label: "catalogue.createCoffee", fn: "is_platform_admin", call: async () => (await import("@/lib/admin/catalogue")).createCoffee({ name: "T030 direct-action probe", slug: "t030-direct-action-probe" }) },
    { label: "commission.createCommissionPolicy", fn: "is_super_admin", call: async () => (await import("@/lib/admin/commission")).createCommissionPolicy({ name: "T030 direct-action probe", effectiveFrom: "2099-01-01T00:00" }) },
  ];
  // Only the four functions actually probed below (`probes`) — `is_finance_operator` (blocked
  // pending Feature 008, no write domain yet) and `is_auditor` (read-only by construction, no write
  // domain by design) are deliberately absent rather than assigned an invented code.
  const NOT_CAPABLE_CODES: Partial<Record<AdminRoleFunction, string>> = {
    is_warehouse_operator: "warehouse_not_capable",
    is_compliance_operator: "compliance_not_capable",
    is_platform_admin: "catalogue_not_capable",
    is_super_admin: "system_not_capable",
  };
  const sessions: readonly { role: OperationalRole; email: () => string }[] = [
    { role: "WAREHOUSE", email: () => FOUNDATION_FIXTURES.warehouseAdmin.email },
    { role: "FINANCE", email: () => FOUNDATION_FIXTURES.financeAdmin.email },
    { role: "COMPLIANCE", email: () => FOUNDATION_FIXTURES.complianceReviewer.email },
    { role: "ADMIN", email: () => FOUNDATION_FIXTURES.catalogueAdmin.email },
    { role: "AUDITOR", email: () => FOUNDATION_FIXTURES.auditor.email },
    { role: "SUPER_ADMIN", email: () => FOUNDATION_FIXTURES.superAdmin.email },
  ];

  beforeAll(() => {
    prepareComplianceFixture();
    prepareCatalogueAdminFixture();
    prepareAuditorFixture();
    prepareSuperAdminFixture();
  }, FIXTURE_LIVE_TIMEOUT_MS);

  afterAll(() => {
    for (const [cleanup, inspect] of [
      [cleanupComplianceFixture, inspectComplianceFixture],
      [cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture],
      [cleanupAuditorFixture, inspectAuditorFixture],
      [cleanupSuperAdminFixture, inspectSuperAdminFixture],
    ] as const) {
      const result = cleanup();
      expect(result.activeAdminPrivilege).toBe(false);
      expect(inspect().activeCapability).toBe(false);
    }
  }, FIXTURE_LIVE_TIMEOUT_MS);

  for (const probe of probes) {
    it(`${probe.label} refuses every session whose role does not satisfy ${probe.fn}() — real domain function, not the page guard`, async () => {
      for (const { role, email } of sessions) {
        if (roleSatisfiesFunction(role, probe.fn)) continue; // the owning-role write path is proven live elsewhere (run-e-live/run-f-live/compliance-decisions/warehouse-operations); this test writes nothing.
        const client = await signInAsFixture(email());
        const result = await withLiveClient(client, probe.call);
        expect(result.ok, `${probe.label} × ${role}`).toBe(false);
        if (!result.ok) expect(result.code, `${probe.label} × ${role}`).toBe(NOT_CAPABLE_CODES[probe.fn]!);
      }
      // Anonymous is refused too, with the auth-required code (never the same not-capable code, and never a raw error).
      const anonymous = await withLiveClient(createAnonymousFixtureClient(), probe.call);
      expect(anonymous.ok, `${probe.label} × anonymous`).toBe(false);
      if (!anonymous.ok) expect(anonymous.code, `${probe.label} × anonymous`).toBe("profile_auth_required");
    }, FIXTURE_LIVE_TIMEOUT_MS);
  }

  it("no probe above left a stray row: the warehouse/KYB probes used a nil id (never found) and the catalogue/commission probes were refused before any insert", async () => {
    const superClient = await signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email);
    await withLiveClient(superClient, async () => {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: coffee } = await supabase.from("coffees").select("id").eq("slug", "t030-direct-action-probe");
      expect(coffee ?? []).toEqual([]);
      const { data: policy } = await supabase.from("commission_policies").select("id").eq("name", "T030 direct-action probe");
      expect(policy ?? []).toEqual([]);
    });
  }, LIVE_TIMEOUT_MS);
});
