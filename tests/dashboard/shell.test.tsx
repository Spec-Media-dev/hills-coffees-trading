import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import { DashboardNotificationsButton } from "@/components/dashboard/topbar";
import { LocaleProvider } from "@/components/locale/locale-provider";
import type { OrganizationMembership } from "@/lib/auth/types";
import type { DashboardModule } from "@/lib/dashboard/modules";

const source = (path: string) => readFileSync(path, "utf8");

afterEach(cleanup);

function withLocale(children: React.ReactNode) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

describe("Feature 004 T005 — capability filtering is fresh, never cached/memoised", () => {
  const testModule: DashboardModule = {
    id: "test",
    requiredCapability: "member",
    navGroups: [
      { key: "g", label: "g", entries: [{ id: "buy-entry", label: "Buy area", href: "/dashboard/buy", requiredCapability: "buy" }] },
    ],
  };
  const base: OrganizationMembership = {
    organizationId: "org-1",
    displayName: "Org",
    memberRole: "OWNER",
    canBuy: false,
    canSell: false,
  };

  it("the exact same module list produces different output for different organizations on successive calls", () => {
    const noBuy = buildDashboardNavGroups({ modules: [testModule], organization: base });
    expect(noBuy).toHaveLength(0);

    const withBuy = buildDashboardNavGroups({ modules: [testModule], organization: { ...base, canBuy: true } });
    expect(withBuy).toHaveLength(1);

    // Calling again with the ORIGINAL (no-buy) organization must still produce the denied result —
    // proves there is no memoisation keyed only on the module list.
    const noBuyAgain = buildDashboardNavGroups({ modules: [testModule], organization: base });
    expect(noBuyAgain).toHaveLength(0);
  });
});

describe("Feature 004 T006 — the reserved notifications entry is genuinely inert", () => {
  it("renders disabled, with a truthful accessible name, and no unread count/badge", () => {
    render(withLocale(<DashboardNotificationsButton />));
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toMatch(/notification/i);
    expect(button.getAttribute("aria-label")).toMatch(/available yet|unavailable/i);
    // No numeric badge anywhere near the control.
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it("the component itself contains no fake count, polling, or fabricated notification data", () => {
    const src = source("components/dashboard/topbar.tsx");
    expect(src).not.toMatch(/setInterval|unreadCount|markRead|fetch\(/i);
  });
});

describe("Feature 004 T028 (early proof) — no service-role usage, no shared private cache", () => {
  it("lib/dashboard and components/dashboard introduce neither", () => {
    const files = [
      "lib/dashboard/modules.ts",
      "lib/dashboard/registry.tsx",
      "lib/dashboard/overview.tsx",
      "components/dashboard/sidebar.tsx",
      "components/dashboard/topbar.tsx",
      "components/dashboard/responsive/table-card-list.tsx",
    ];
    for (const file of files) {
      const src = source(file);
      expect(src).not.toMatch(/SERVICE_ROLE|service_role/);
      expect(src).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag/);
      expect(src).not.toMatch(/globalThis\.|^let \w+.*=.*;?$/m);
    }
  });
});

describe("Feature 004 T027 (early proof) — no parallel member application", () => {
  it("no /buyer-dashboard or /seller-dashboard reference anywhere in the new dashboard code", () => {
    const files = [
      "lib/dashboard/modules.ts",
      "lib/dashboard/registry.tsx",
      "lib/dashboard/overview.tsx",
      "components/dashboard/sidebar.tsx",
      "components/dashboard/topbar.tsx",
    ];
    for (const file of files) {
      expect(source(file)).not.toMatch(/buyer-dashboard|seller-dashboard/);
    }
  });
});
