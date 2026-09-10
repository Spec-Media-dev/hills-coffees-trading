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
    expect(page).toContain("modulesArriveLater");
  });

  it("implements no admin business module and creates no new /dashboard-admin/* route", () => {
    const layout = source("src/app/dashboard-admin/layout.tsx");
    expect(layout).not.toMatch(/createClient|\.from\(["'`]/);
    const entries = readdirSync(path.join(root, "src", "app", "dashboard-admin"), { withFileTypes: true });
    expect(entries.filter((e) => e.isDirectory())).toHaveLength(0);
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

  it("Overview is role-agnostic — an empty role set still renders it, matching the live route", () => {
    const groups = buildAdminNavGroups([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("overview");
  });

  it("renders for an arbitrary supplied role set — WAREHOUSE sees catalogue and logistics only", () => {
    const groups = buildAdminNavGroups(["WAREHOUSE"]);
    expect(groups.map((g) => g.key).sort()).toEqual(["catalogue", "logistics", "overview"].sort());
  });

  it("renders for an arbitrary supplied role set — a mixed AUDITOR + FINANCE set unions correctly", () => {
    const groups = buildAdminNavGroups(["AUDITOR", "FINANCE"]);
    const keys = groups.map((g) => g.key).sort();
    expect(keys).toEqual(["audit", "commercial", "overview"].sort());
  });

  it("SUPER_ADMIN's real hierarchical attestation sees every group — a database fact, not an invented permission", () => {
    const groups = buildAdminNavGroups(["SUPER_ADMIN"]);
    expect(groups.map((g) => g.key).sort()).toEqual(
      ["audit", "catalogue", "commercial", "compliance", "logistics", "organizations", "overview"].sort(),
    );
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
    for (const href of ["/dashboard-admin/organizations", "/dashboard-admin/members", "/dashboard-admin/kyb"]) {
      expect(() => readFileSync(path.join(root, "src", "app", href.slice(1), "page.tsx"))).toThrow();
    }
  });

  it("records that Feature 010 supplies real role gating and that visibility is never authorization", () => {
    const src = source("components/app/admin-navigation.tsx");
    expect(src).toMatch(/Feature 010/);
    expect(src).toMatch(/never a security boundary/);
  });

  it("is never called with the real operationalRoles on the live route", () => {
    const layout = source("src/app/dashboard-admin/layout.tsx");
    expect(layout).toContain("buildAdminNavGroups([])");
    expect(layout).not.toContain("buildAdminNavGroups(identity.operationalRoles)");
  });
});
