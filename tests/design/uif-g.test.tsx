import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ActionBar } from "@/components/app/action-bar";
import { buildAdminNavGroups } from "@/components/app/admin-navigation";
import { FilterBar } from "@/components/app/filter-bar";
import { ModulePage } from "@/components/app/module-page";
import { Sidebar } from "@/components/app/sidebar";
import { FilterChip } from "@/components/ui/filter-chip";
import { StatusBadge } from "@/components/ui/status-badge";

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const gitDiff = (...args: string[]) =>
  execFileSync("git", ["diff", "--unified=0", "--", ...args], { cwd: root, encoding: "utf8" });

afterEach(cleanup);

describe("Phase 5.5 UIF-039 — admin shell applied at /dashboard-admin", () => {
  it("keeps the authorization guard predicate byte-identical to before this block", () => {
    const layout = source("src/app/dashboard-admin/layout.tsx");
    expect(layout).toContain('if (identity.kind !== "authenticated") {');
    expect(layout).toContain("if (identity.operationalRoles.length === 0) {");

    const page = source("src/app/dashboard-admin/page.tsx");
    expect(page).toContain('identity.kind !== "authenticated" ||\n    identity.operationalRoles.length === 0');

    const diff = gitDiff("src/app/dashboard-admin/layout.tsx");
    const touchedGuardLine = diff
      .split("\n")
      .some(
        (line) =>
          /^[+-]/.test(line) &&
          !/^(\+\+\+|---)/.test(line) &&
          /identity\.kind !== "authenticated"|identity\.operationalRoles\.length === 0/.test(line),
      );
    expect(touchedGuardLine).toBe(false);
  });

  it("is independent of the Member guard — checks roles, never organization, and vice versa", () => {
    const adminLayout = source("src/app/dashboard-admin/layout.tsx");
    expect(adminLayout).not.toMatch(/identity\.organization/);
    const memberLayout = source("src/app/dashboard/layout.tsx");
    expect(memberLayout).not.toMatch(/identity\.operationalRoles/);
  });

  it("shows honest overview content with no invented KPI, queue count or activity row", () => {
    const page = source("src/app/dashboard-admin/page.tsx");
    expect(page).not.toMatch(/\$\d|€\d|AED|USD|\d+ (?:orders|members|organizations|disputes|pending)/i);
    // Feature 010 RUN A (T006) replaced the "modules arrive later" placeholder with real, role-shaped
    // counts read under the operator's own session (`lib/admin/read.ts`) — still no invented figure.
    expect(page).toContain("getAdminOverview(identity.operationalRoles)");
  });

  it("the shell layout itself still reads no business data; every /dashboard-admin/* route group is a guarded Feature 010 area", () => {
    const layout = source("src/app/dashboard-admin/layout.tsx");
    expect(layout).not.toMatch(/createClient|\.from\(["'`]/);
    // Feature 010 RUN A (T004): six route groups + the operator's own account route now exist, each
    // behind its own server-side guard — proven in `tests/admin/access-matrix.test.tsx`.
    const entries = readdirSync(path.join(root, "src", "app", "dashboard-admin"), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(dirs).toEqual(["(audit)", "(catalogue)", "(compliance)", "(finance)", "(system)", "(warehouse)", "account"]);
  });

  it("uses the same AppShell as /dashboard — one shell architecture, two densities", () => {
    expect(source("src/app/dashboard-admin/layout.tsx")).toContain('from "@/components/app/app-shell"');
    expect(source("src/app/dashboard/layout.tsx")).toContain('from "@/components/app/app-shell"');
  });
});

describe("Phase 5.5 UIF-040 — admin operational UI patterns", () => {
  it("composes ModulePage + FilterBar + a DataTable-shaped region + StatusBadge honestly, from props alone", () => {
    render(
      <ModulePage
        title="Example queue"
        toolbar={
          <FilterBar label="Filter example queue">
            <FilterChip>Under review</FilterChip>
            <FilterChip selected>Approved</FilterChip>
          </FilterBar>
        }
      >
        <div data-testid="queue-empty">No records yet.</div>
        <StatusBadge status="Under review" />
      </ModulePage>,
    );
    expect(screen.getByRole("group", { name: "Filter example queue" })).toBeTruthy();
    expect(screen.getByTestId("queue-empty")).toBeTruthy();
    expect(screen.getAllByText("Under review")).toHaveLength(2);
  });

  it("ActionBar renders only caller-supplied controls — no business-verb button of its own", () => {
    render(
      <ActionBar leading={<StatusBadge status="Draft" />}>
        <button type="button">Example action</button>
      </ActionBar>,
    );
    expect(screen.getByRole("button", { name: "Example action" })).toBeTruthy();
    const actionBarSrc = source("components/app/action-bar.tsx");
    expect(actionBarSrc).not.toMatch(/Approve|Reject|>Pay<|Settle|Publish|Delete|Archive/);
  });

  it("every pattern component reads no business data and no role", () => {
    for (const file of [
      "components/app/module-page.tsx",
      "components/app/detail-page.tsx",
      "components/app/filter-bar.tsx",
      "components/app/action-bar.tsx",
    ]) {
      const src = source(file);
      expect(src).not.toMatch(/createClient|getRequestIdentity|supabase|operationalRoles/i);
    }
  });

  it("documents these as visual foundations only, for every UIF-040-named module", () => {
    const src = source("components/app/module-page.tsx");
    expect(src).toContain("visual foundation");
    for (const moduleName of [
      "Organizations",
      "Members",
      "KYB",
      "Catalogue",
      "Inventory",
      "Listings",
      "Orders",
      "Payment proofs",
      "Finance",
      "Settlement",
      "Payouts",
      "Delivery",
      "Pricing",
      "Commission",
      "Disputes",
      "Audit",
    ]) {
      expect(src).toContain(moduleName);
    }
  });
});

describe("Phase 5.5 UIF-041 — role-scalable admin navigation structure", () => {
  it("implements no authorization logic and reads no role itself", () => {
    const src = source("components/app/admin-navigation.tsx");
    expect(src).not.toMatch(/getRequestIdentity|supabase|\.rpc\(/);
  });

  // Feature 010 RUN A (T001/T003): the structure is now DERIVED from the single access matrix
  // (`lib/admin/areas.ts`) — groups are the console's six areas plus Overview and Account, and a
  // role sees exactly the areas its attested role function unlocks.
  it("Overview and Account are role-agnostic shell routes — an empty role set still renders them, matching the live route", () => {
    const groups = buildAdminNavGroups([]);
    expect(groups.map((g) => g.key)).toEqual(["overview", "account"]);
  });

  it("renders for an arbitrary supplied role set — WAREHOUSE sees the warehouse group only", () => {
    const groups = buildAdminNavGroups(["WAREHOUSE"]);
    expect(groups.map((g) => g.key).sort()).toEqual(["account", "overview", "warehouse"].sort());
  });

  it("renders for an arbitrary supplied role set — a mixed AUDITOR + FINANCE set unions correctly", () => {
    const groups = buildAdminNavGroups(["AUDITOR", "FINANCE"]);
    const keys = groups.map((g) => g.key).sort();
    expect(keys).toEqual(["account", "audit", "finance", "overview"].sort());
  });

  it("the DAL's real hierarchical attestation for SUPER_ADMIN sees every group — a database fact, not an invented permission", () => {
    // `lib/auth/dal.ts` lists every role whose function returns true; for a SUPER_ADMIN that is all six.
    const groups = buildAdminNavGroups(["SUPER_ADMIN", "ADMIN", "COMPLIANCE", "WAREHOUSE", "FINANCE", "AUDITOR"]);
    expect(groups.map((g) => g.key).sort()).toEqual(
      ["account", "audit", "catalogue", "compliance", "finance", "overview", "system", "warehouse"].sort(),
    );
    // A bare "SUPER_ADMIN" string alone unlocks only the super-admin areas — no hierarchy is invented here.
    expect(buildAdminNavGroups(["SUPER_ADMIN"]).map((g) => g.key)).toEqual(["overview", "system", "account"]);
  });

  it("the structure renders through Sidebar without a client island or a live route existing for any module", () => {
    render(
      <Sidebar
        logoHref="/dashboard-admin"
        logoLabel="Home"
        groups={buildAdminNavGroups(["COMPLIANCE"])}
        navigationLabel="Application"
      />,
    );
    expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Organizations").length).toBeGreaterThan(0);
    // Feature 010 RUN A: these routes now exist as GUARDED, honest "not yet available" destinations
    // under their route group (`(compliance)/…`) — never under a bare, unguarded folder.
    for (const segment of ["organizations", "kyb"]) {
      expect(() => readFileSync(path.join(root, "src", "app", "dashboard-admin", segment, "page.tsx"))).toThrow();
      expect(readFileSync(path.join(root, "src", "app", "dashboard-admin", "(compliance)", segment, "page.tsx"), "utf8")).toContain("AdminAreaPlaceholder");
    }
  });

  it("records that Feature 010 supplies real role gating and that visibility is never authorization", () => {
    const src = source("components/app/admin-navigation.tsx");
    expect(src).toMatch(/Feature 010/);
    expect(src).toMatch(/never a security boundary/);
  });

  it("Feature 010 RUN A — the live route now shapes navigation from the real, DB-attested operationalRoles (presentation only; every route re-verifies server-side)", () => {
    const layout = source("src/app/dashboard-admin/layout.tsx");
    expect(layout).toContain("buildAdminNavGroups(identity.operationalRoles)");
    expect(layout).not.toContain("buildAdminNavGroups([])");
  });
});
