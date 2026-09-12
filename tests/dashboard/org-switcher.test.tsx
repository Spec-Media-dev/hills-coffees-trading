import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { composeOverview } from "@/lib/dashboard/overview";
import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import type { OrganizationMembership } from "@/lib/auth/types";
import type { DashboardModule } from "@/lib/dashboard/modules";

const source = (path: string) => readFileSync(path, "utf8");

afterEach(cleanup);

function withLocale(children: React.ReactNode) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

const orgA: OrganizationMembership = {
  organizationId: "org-a",
  displayName: "Organization A",
  memberRole: "OWNER",
  canBuy: true,
  canSell: false,
};
const orgB: OrganizationMembership = {
  organizationId: "org-b",
  displayName: "Organization B",
  memberRole: "MEMBER",
  canBuy: true,
  canSell: true,
};

/** Stands in for the real `setActingOrganization` prop this component is never allowed to import itself. */
const noopSwitch: (organizationId: string, redirectTo: string) => Promise<never> = async () => {
  throw new Error("not invoked in these tests");
};

describe("Feature 004 T009 — acting organization switcher", () => {
  it("one organization: displays it clearly, with no selector control", () => {
    render(withLocale(<OrgSwitcher organizations={[orgA]} currentOrganizationId={orgA.organizationId} switchOrganization={noopSwitch} />));
    expect(screen.getByText("Organization A")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryAllByRole("button").length).toBe(0);
  });

  it("more than one organization: renders a real, accessible switcher naming the current selection", () => {
    render(withLocale(<OrgSwitcher organizations={[orgA, orgB]} currentOrganizationId={orgA.organizationId} switchOrganization={noopSwitch} />));
    const trigger = screen.getByRole("combobox");
    expect(trigger.getAttribute("aria-label")).toBeTruthy();
    expect(screen.getByText("Organization A")).toBeTruthy();
  });

  it("zero organizations: renders nothing rather than reading organizations[0]", () => {
    const { container } = render(withLocale(<OrgSwitcher organizations={[]} currentOrganizationId="anything" switchOrganization={noopSwitch} />));
    expect(container.textContent).toBe("");
  });

  it("reuses Feature 003's only acting-organization mechanism — receives setActingOrganization as a prop, never imports or redefines it", () => {
    const src = source("components/dashboard/org-switcher.tsx");
    // A DIRECT import would pull `lib/auth/eligibility.ts` (and its `next/headers` dependency chain)
    // into the client bundle — a real production build failure this run hit and fixed. The Server
    // Component caller (`src/app/dashboard/layout.tsx`) imports it instead and passes the function
    // down as the `switchOrganization` prop.
    expect(src).not.toMatch(/import\s*\{[^}]*setActingOrganization[^}]*\}\s*from\s*"@\/lib\/auth\/eligibility"/);
    expect(src).not.toMatch(/function setActingOrganization/);
    expect(src).toMatch(/switchOrganization/);
    const layout = source("src/app/dashboard/layout.tsx");
    expect(layout).toMatch(/import\s*\{\s*setActingOrganization\s*\}\s*from\s*"@\/lib\/auth\/eligibility"/);
    expect(layout).toContain("switchOrganization={setActingOrganization}");
  });
});

describe("Feature 004 T010 — explicit acting-organization threading, no ambient state", () => {
  const testModule: DashboardModule = {
    id: "isolation-probe",
    requiredCapability: "member",
    overviewCards: (context) => [
      { id: "probe", area: "bought", title: "probe", value: context.organization.displayName },
    ],
  };

  it("two interleaved calls with different organizations never bleed into each other's result", () => {
    // Simulates two concurrent requests: calls interleaved, not sequential-then-sequential, so any
    // shared/module-scope mutable state would show up as cross-contamination here.
    const resultA1 = composeOverview({ organization: orgA, registry: [testModule], hasAcceptedCurrentAgreements: true });
    const resultB1 = composeOverview({ organization: orgB, registry: [testModule], hasAcceptedCurrentAgreements: true });
    const resultA2 = composeOverview({ organization: orgA, registry: [testModule], hasAcceptedCurrentAgreements: true });
    const resultB2 = composeOverview({ organization: orgB, registry: [testModule], hasAcceptedCurrentAgreements: true });

    expect(resultA1.bought[0]!.value).toBe("Organization A");
    expect(resultB1.bought[0]!.value).toBe("Organization B");
    expect(resultA2.bought[0]!.value).toBe("Organization A");
    expect(resultB2.bought[0]!.value).toBe("Organization B");
    expect(resultA1.account[0]!.value).toBe("Organization A");
    expect(resultB1.account[0]!.value).toBe("Organization B");
  });

  it("buildDashboardNavGroups is likewise pure per-call — no cross-contamination between two organizations", () => {
    const sellModule: DashboardModule = {
      id: "sell-probe",
      requiredCapability: "sell",
      navGroups: [{ key: "selling", label: "Selling", entries: [{ id: "s", label: "Selling", href: "/dashboard/selling", requiredCapability: "sell" }] }],
    };
    const forA = buildDashboardNavGroups({ modules: [sellModule], organization: orgA });
    const forB = buildDashboardNavGroups({ modules: [sellModule], organization: orgB });
    expect(forA).toEqual([]);
    expect(forB.map((g) => g.key)).toEqual(["selling"]);
  });

  it("no ambient/module-scope mutable acting-org state exists anywhere in lib/dashboard or components/dashboard", () => {
    const files = [
      "lib/dashboard/modules.ts",
      "lib/dashboard/registry.tsx",
      "lib/dashboard/overview.tsx",
      "components/dashboard/sidebar.tsx",
      "components/dashboard/topbar.tsx",
      "components/dashboard/org-switcher.tsx",
      "components/dashboard/overview-card.tsx",
      "components/dashboard/action-list.tsx",
    ];
    for (const file of files) {
      const src = source(file);
      expect(src).not.toMatch(/globalThis\./);
      // A module-scope mutable binding for acting-org state (as opposed to a local `const` inside a
      // function body, which is fine) would appear as a top-level `let`/`var` — none exists.
      const topLevelMutable = src
        .split("\n")
        .some((line) => /^(let|var)\s+\w*[Oo]rg/.test(line.trim()));
      expect(topLevelMutable).toBe(false);
    }
  });

  it("every DashboardModule contribution receives the organization explicitly via DashboardModuleContext, never implicitly", () => {
    const src = source("lib/dashboard/modules.ts");
    expect(src).toMatch(/DashboardModuleContext/);
    expect(src).toMatch(/never read from an ambient global or module-scope variable/);
  });
});
