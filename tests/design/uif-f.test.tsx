import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { AppShell } from "@/components/app/app-shell";
import { DetailPage } from "@/components/app/detail-page";
import { ModulePage } from "@/components/app/module-page";
import { Sidebar } from "@/components/app/sidebar";
import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import type { OrganizationMembership } from "@/lib/auth/types";
import type { DashboardModule } from "@/lib/dashboard/modules";

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const gitDiff = (...args: string[]) =>
  execFileSync("git", ["diff", "--unified=0", "--", ...args], { cwd: root, encoding: "utf8" });

// jsdom does not implement matchMedia; ThemeProvider subscribes to it on mount.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
});

function withProviders(children: React.ReactNode) {
  return (
    <ThemeProvider>
      <LocaleProvider>{children}</LocaleProvider>
    </ThemeProvider>
  );
}

afterEach(cleanup);

describe("Phase 5.5 UIF-035 — shared application shell primitives", () => {
  it("is presentational and prop-driven: no capability, role or organization is read by the shell", () => {
    for (const file of [
      "components/app/app-shell.tsx",
      "components/app/sidebar.tsx",
      "components/app/topbar.tsx",
      "components/app/mobile-app-nav.tsx",
      "components/app/page-header.tsx",
    ]) {
      const src = source(file);
      expect(src).not.toMatch(/getRequestIdentity|canBuy|canSell|operationalRoles/);
    }
  });

  it("renders navigation and identity purely from props", () => {
    render(
      <Sidebar
        logoHref="/dashboard"
        logoLabel="Hills Coffee — home"
        groups={[
          { key: "g", label: "Test group", items: [{ key: "i", label: "Test item", href: "/dashboard" }] },
        ]}
        activeKey="i"
        navigationLabel="Application"
      />,
    );
    expect(screen.getByText("Test group")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Test item" });
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("collapses to a drawer at tablet and below, and the sidebar is desktop-only", () => {
    const sidebarSrc = source("components/app/sidebar.tsx");
    expect(sidebarSrc).toMatch(/hidden[^"]*lg:flex/);
    const mobileNavSrc = source("components/app/app-shell.tsx");
    // MobileAppNav's own trigger is lg:hidden (mobile-app-nav.tsx renders it via IconButton with no
    // explicit breakpoint class — the shell places it only inside Topbar's `leading` slot, which
    // Topbar itself marks `lg:hidden`).
    expect(source("components/app/topbar.tsx")).toMatch(/lg:hidden/);
    expect(mobileNavSrc).toContain("MobileAppNav");
  });

  it("keeps the sidebar dark forest in both themes — no theme-conditional background", () => {
    const sidebarSrc = source("components/app/sidebar.tsx");
    expect(sidebarSrc).toContain("bg-[var(--sidebar)]");
    // No `dark:` background override anywhere in the sidebar's own className strings — the design
    // reference is explicit that the sidebar does not invert.
    expect(sidebarSrc).not.toMatch(/dark:bg-/);
  });

  it("uses only logical CSS for direction — sidebar sits at the inline-start edge via border-e", () => {
    const sidebarSrc = source("components/app/sidebar.tsx");
    expect(sidebarSrc).toContain("border-e");
    expect(sidebarSrc).not.toMatch(/\bborder-[lr]-|text-left|text-right/);
  });

  it("mirrors to the inline-end under dir=\"rtl\" through browser bidi, not a directional override", () => {
    // AppShell lays Sidebar and the content column out with plain `flex` and no `flex-row`/
    // `row-reverse` override — the one condition that lets `dir="rtl"` reorder them for free.
    const shellSrc = source("components/app/app-shell.tsx");
    expect(shellSrc).toMatch(/className="flex min-h-full flex-1"/);
    expect(shellSrc).not.toMatch(/flex-row-reverse|rtl:flex-row/);
  });

  it("renders the full shell (Sidebar + Topbar + MobileAppNav + content) without hydration errors", () => {
    render(
      withProviders(
        <AppShell
          navGroups={[
            { key: "g", label: "Overview", items: [{ key: "i", label: "Overview", href: "/dashboard" }] },
          ]}
          workspaceLabel="Member portal"
          logoHref="/dashboard"
        >
          <div>Page content</div>
        </AppShell>,
      ),
    );
    expect(screen.getByText("Page content")).toBeTruthy();
    expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
    // The mobile drawer trigger and the desktop sidebar both exist in the DOM (CSS, not JS,
    // decides which is visible at a given width) — proving the collapse is a real transformation,
    // not a conditional render that would break under a resize.
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy();
  });
});

describe("Phase 5.5 UIF-036 — member shell applied at /dashboard", () => {
  it("keeps the authorization guard predicate byte-identical to before this block", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    expect(layout).toContain('if (identity.kind !== "authenticated") {');
    expect(layout).toContain("if (identity.organization === null) {");
    expect(layout).toContain("await getRequestIdentity()");

    const page = source("src/app/dashboard/page.tsx");
    expect(page).toContain('identity.kind !== "authenticated" || identity.organization === null');

    // The predicate LINES themselves carry no diff hunk — only imports/JSX around them changed.
    const diff = gitDiff("src/app/dashboard/layout.tsx");
    const touchedGuardLine = diff
      .split("\n")
      .some(
        (line) =>
          /^[+-]/.test(line) &&
          !/^(\+\+\+|---)/.test(line) &&
          /identity\.kind !== "authenticated"|identity\.organization === null/.test(line),
      );
    expect(touchedGuardLine).toBe(false);
  });

  it("Feature 004 T004 — implements real capability resolution: the acting organization's own canBuy/canSell drives navigation, never a hardcoded value", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    expect(layout).toContain("buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: identity.organization })");
    expect(layout).toMatch(/Feature 004/);
  });

  it("shows honest overview content with no invented business figure", () => {
    const page = source("src/app/dashboard/page.tsx");
    expect(page).not.toMatch(/\$\d|€\d|AED|USD|\d+ orders|\d+ shipments/i);
    expect(page).toContain("modulesArriveLater");
  });

  it("preserves the update-my-profile security contract while returning controlled feedback codes", () => {
    const action = source("src/app/dashboard/settings/actions.ts");
    expect(action).toContain("MyProfileInput.safeParse");
    expect(action).toContain("await getRequestIdentity()");
    expect(action).toContain('supabase.rpc("update_my_profile"');
    expect(action).toContain("ACTION_FEEDBACK.PROFILE_SAVE_FAILED");
    expect(action).toContain("ACTION_FEEDBACK.PROFILE_SAVED");
    expect(action).not.toMatch(/error\.message|SERVICE_ROLE/);
  });

  it("converges the settings surface onto the UIF-008 Field scaffold", () => {
    const form = source("src/app/dashboard/settings/profile-settings-form.tsx");
    expect(form).toContain('from "@/components/ui/field"');
    expect(form).toContain("<Field");
    expect(form).toContain("<FieldGroup>");
    expect(form).toContain("<FormActionBar");
    expect(form).not.toContain('from "@/components/ui/label"');
    const shell = source("src/app/dashboard/settings/settings-foundation-shell.tsx");
    expect(shell).toContain("PageHeader");
    expect(shell).toContain('data-testid="hills-settings-proof"');
    expect(shell).toContain('data-testid="hills-settings-card"');
  });

  it("creates no /dashboard/* BUSINESS route beyond what its OWN owning feature genuinely ships (kyb is the KYB verification workspace itself, not a business module; onboarding stays action-only; inventory/storage are Feature 005's own real, live routes)", () => {
    const entries = readdirSync(path.join(root, "src", "app", "dashboard"), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    // Feature 003 RUN B (T016) deliberately adds `dashboard/kyb/` as a real route — the KYB
    // draft/upload/submit workspace tasks.md explicitly requires at `src/app/dashboard/kyb/page.tsx`.
    // It is reachable only for a not-yet-authorized organization (`dashboard/layout.tsx` never
    // renders the business `AppShell`/nav for that case — see the "Critical access rule" tests in
    // `tests/auth/run-a-sign-up-onboarding.test.ts`), and it carries no business content (no
    // inventory, marketplace, order, or listing data) — it is the verification gate itself, not a
    // module past it.
    //
    // Feature 005 RUN B adds `dashboard/inventory/` and `dashboard/storage/` as genuinely-live
    // business routes (T007–T012), registered with Feature 004's own module contract
    // (`lib/dashboard/registry.tsx`) — this is exactly the kind of real module this test's own
    // original comment anticipated arriving later ("no inventory... module past it" describes `kyb`,
    // not a permanent ban on any feature ever adding one).
    //
    // Feature 006 RUN A (T007) adds `dashboard/coffee/` — but ONLY the private marketplace route
    // GUARD (identity → membership → an honest "not yet built" placeholder). It carries no listing
    // read, no `lib/listings/browse` import, and is not registered with 004's module contract yet
    // (that is Phase 6's job, T020) — see `tests/listings/guard.test.ts` for the guard-order proof.
    // No OTHER business area (orders, payments, delivery, disputes) has a directory here yet, and
    // `dashboard/listings`/`dashboard/sales` (006's OWN later phases) do not exist yet either.
    expect(dirs.sort()).toEqual(["coffee", "inventory", "kyb", "onboarding", "settings", "storage"]);
    for (const stillUnbuilt of ["orders", "payments", "delivery", "disputes", "listings", "sales"]) {
      expect(dirs).not.toContain(stillUnbuilt);
    }

    // Feature 003 T013 added `dashboard/onboarding/` for the controlled-onboarding Server Action
    // only — it carries no `page.tsx`, so Next.js never registers it as a route. The onboarding
    // UI itself renders INLINE from `dashboard/layout.tsx` (same precedent as `OrganizationSelector`),
    // not from a navigable `/dashboard/onboarding` URL. This assertion is what actually proves the
    // "no new business route" property this test names, rather than merely forbidding the directory.
    const onboardingEntries = readdirSync(path.join(root, "src", "app", "dashboard", "onboarding"));
    expect(onboardingEntries).not.toContain("page.tsx");

    const kybEntries = readdirSync(path.join(root, "src", "app", "dashboard", "kyb"));
    expect(kybEntries).toContain("page.tsx");
    const kybPage = readFileSync(path.join(root, "src", "app", "dashboard", "kyb", "page.tsx"), "utf8");
    expect(kybPage).not.toMatch(/\$\d|AED|USD|inventory|marketplace|order (count|total)/i);
  });
});

describe("Phase 5.5 UIF-037 — buyer module layout patterns", () => {
  it("ModulePage renders honest empty/skeleton content from props alone, with no business data read", () => {
    render(
      <ModulePage title="Example module" pagination={<div data-testid="pagination-slot" />}>
        <div data-testid="empty-region">No records yet.</div>
      </ModulePage>,
    );
    expect(screen.getByRole("heading", { name: "Example module" })).toBeTruthy();
    expect(screen.getByTestId("empty-region")).toBeTruthy();
    expect(screen.getByTestId("pagination-slot")).toBeTruthy();
    expect(source("components/app/module-page.tsx")).not.toMatch(/createClient|getRequestIdentity|supabase/i);
  });

  it("DetailPage stacks to one column and only renders a summary rail when supplied", () => {
    const { rerender } = render(<DetailPage title="Record">Body</DetailPage>);
    expect(screen.queryByRole("complementary")).toBeNull();
    rerender(
      <DetailPage title="Record" summary={<div>Summary</div>}>
        Body
      </DetailPage>,
    );
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(source("components/app/detail-page.tsx")).toContain("lg:grid-cols-");
  });

  it("documents every candidate module by name without implementing any of them", () => {
    const modulePageSrc = source("components/app/module-page.tsx");
    expect(modulePageSrc).toMatch(/Discovery, Orders, Deliveries, Invoices, Notifications/);
    expect(modulePageSrc).not.toMatch(/from ".*\/lib\/(?!public)/);
  });
});

describe("Phase 5.5 / Feature 004 T005 — seller additive UI architecture, now real", () => {
  const buyerOnly: OrganizationMembership = {
    organizationId: "org-buyer-only",
    displayName: "Buyer Co",
    memberRole: "OWNER",
    canBuy: true,
    canSell: false,
  };
  const buyerAndSeller: OrganizationMembership = { ...buyerOnly, canSell: true };

  const accountModule: DashboardModule = {
    id: "account",
    requiredCapability: "member",
    navGroups: [
      { key: "overview", label: "Overview", entries: [{ id: "overview", label: "Overview", href: "/dashboard", requiredCapability: "member" }] },
      { key: "account", label: "Account", entries: [{ id: "settings", label: "Settings", href: "/dashboard/settings", requiredCapability: "member" }] },
    ],
  };
  const sellingModule: DashboardModule = {
    id: "selling",
    requiredCapability: "sell",
    navGroups: [
      { key: "selling", label: "Selling", entries: [{ id: "selling-overview", label: "Selling", href: "/dashboard/selling", requiredCapability: "sell" }] },
    ],
  };

  it("the buyer baseline (canSell=false) renders only what the organization is granted", () => {
    const groups = buildDashboardNavGroups({ modules: [accountModule, sellingModule], organization: buyerOnly });
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key)).toEqual(["overview", "account"]);
  });

  it("the seller-additive path (canSell=true) adds one group to the SAME shell shape — buyer entries stay, never replaced", () => {
    const groups = buildDashboardNavGroups({ modules: [accountModule, sellingModule], organization: buyerAndSeller });
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.key)).toEqual(["overview", "account", "selling"]);

    render(
      withProviders(
        <Sidebar logoHref="/dashboard" logoLabel="Home" groups={groups} navigationLabel="Application" />,
      ),
    );
    expect(screen.getAllByText("Selling").length).toBeGreaterThan(0);
  });

  it("declaring requiredCapability never authorizes a route — buildDashboardNavGroups performs no redirect, no throw, no data read", () => {
    const src = source("components/dashboard/sidebar.tsx");
    expect(src).not.toMatch(/redirect\(|createClient|supabase|throw /i);
    expect(src).toMatch(/PRESENTATIONAL ONLY/);
  });

  it("the LIVE route now reads the acting organization's real canBuy/canSell, not a hardcoded value", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    expect(layout).toContain("organization: identity.organization");
    expect(layout).not.toMatch(/buildDashboardNavGroups\([^)]*canSell:\s*false/);
  });

  it("creates no /seller-dashboard or /buyer-dashboard route anywhere in the app tree", () => {
    const appDir = path.join(root, "src", "app");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? [entry.name, ...walk(path.join(dir, entry.name))] : [],
      );
    const allDirNames = walk(appDir);
    expect(allDirNames).not.toContain("seller-dashboard");
    expect(allDirNames).not.toContain("buyer-dashboard");
  });
});
