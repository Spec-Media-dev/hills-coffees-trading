import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ADMIN_AREAS } from "@/lib/admin/areas";
import { FOUNDATION_FIXTURES, cleanupSuperAdminFixture, createAnonymousFixtureClient, inspectSuperAdminFixture, prepareSuperAdminFixture, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 010 Phase 11 — T036: state coverage across every CURRENT console area (loading, empty,
 * error, unauthorized, forbidden, not-found, capability-gap/blocked, domain states).
 *
 * STATIC half: every live list page declares an empty state and an error state; every live detail
 * page declares a not-found state; every page re-verifies its own guard (`AdminAccessDenied` —
 * anonymous → redirect, member → `no-operational-role`, wrong role → `forbidden`); blocked areas
 * (Feature 008 finance) stay blocked placeholders (disputes became live with T012 over Feature 012); the route-level `loading`
 * and `error` boundaries exist and the error boundary renders NO raw text; every recorded domain
 * state / capability gap keeps its explicit marker.
 *
 * LIVE half (disposable SUPER_ADMIN — the one role that satisfies every area function, so one
 * session reaches every surface): a nil UUID and a malformed id render `not-found` on every detail
 * page (no fabricated record, no crash); the three configuration lists that are genuinely empty in
 * the live database render the honest `empty` state; a simulated database failure (the page's own
 * tables return a PostgREST error through a proxied client, identity tables untouched) renders the
 * inline `error` state on every list page that owns its read, throws an INTERNAL code (never the raw
 * message) from every detail read so the route boundary renders the generic error, and — where the
 * read belongs to Feature 009/005 (warehouse queues/custody), whose contract degrades a database
 * error to an empty result — renders the empty state without ever printing raw text (recorded).
 * Nothing here fabricates a record or a workflow to manufacture a state.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
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
const ADMIN = "src/app/dashboard-admin";
const PAGES = walk(ADMIN).filter((f) => f.endsWith("/page.tsx"));
const isDetail = (f: string) => /\[[a-zA-Z]+\]\/page\.tsx$/.test(f) && !/\/new\/page\.tsx$/.test(f);
const isCreate = (f: string) => /\/new\/page\.tsx$/.test(f);
const DETAIL_PAGES = PAGES.filter(isDetail);
const LIST_PAGES = PAGES.filter((f) => !isDetail(f) && !isCreate(f) && !/\/account\/|dashboard-admin\/page\.tsx$/.test(f) && !/\(finance\)/.test(f));

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
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/cache")>()), revalidatePath: () => undefined, revalidateTag: () => undefined }));

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

const RAW_ERROR_TEXT = /simulated|PGRST|permission denied|row-level security|SQLSTATE|42501|08006|_read_failed/i;
const IDENTITY_TABLES = new Set(["profiles", "organization_members"]);

/**
 * A client whose DOMAIN reads fail with a PostgREST-shaped error while identity resolution (auth +
 * the two identity tables) and the role-function RPCs pass through to the real session — so the page
 * is admitted by its real guard and then meets a failing database exactly where its own read runs.
 */
function failingClient(real: SupabaseClient): SupabaseClient {
  const failure = { data: null, error: { code: "08006", message: "simulated connection failure", details: null, hint: null }, count: null, status: 500, statusText: "simulated" };
  const builder: unknown = new Proxy(() => builder, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => unknown) => Promise.resolve(failure).then(resolve);
      return () => builder;
    },
    apply: () => builder,
  });
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "from") return (table: string) => (IDENTITY_TABLES.has(table) ? target.from(table) : builder);
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SupabaseClient;
}

const LIVE_TIMEOUT_MS = 150_000;
const NIL = "00000000-0000-4000-8000-000000000000";
let superAdmin: SupabaseClient;

beforeAll(async () => {
  prepareSuperAdminFixture();
  superAdmin = await signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  const result = cleanupSuperAdminFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectSuperAdminFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

/** Route module path → the params/searchParams the page expects. */
function pageProps(file: string, id: string) {
  const param = file.match(/\[([a-zA-Z]+)\]\/page\.tsx$/)?.[1];
  const params: Record<string, string> = param ? { [param]: id } : {};
  if (file.includes("/taxonomy/[kind]/")) params.kind = "coffeeTypes";
  return { params: Promise.resolve(params), searchParams: Promise.resolve({}) };
}
const modulePath = (file: string) => `@/${file.replace(/\.tsx$/, "")}`;

describe("T036 — STATIC: every current surface declares its applicable states", () => {
  it("scans the real route tree (19 list pages incl. overview-free groups, 17 detail pages) and every page guards itself", () => {
    expect(LIST_PAGES.length).toBeGreaterThanOrEqual(16);
    expect(DETAIL_PAGES.length).toBe(17);
    for (const file of PAGES.filter((f) => !/dashboard-admin\/page\.tsx$|\/account\//.test(f))) {
      const page = source(file);
      expect(page, file).toMatch(/<AdminAccessDenied|<AdminAreaPlaceholder/);
    }
  });

  it("every live LIST page declares an honest empty state AND an error state (its own read failure renders the error card, never an empty list pretending nothing exists)", () => {
    for (const file of LIST_PAGES) {
      const page = source(file);
      expect(page, `${file} empty`).toMatch(/emptyState=|kind="empty"|kind="capability-gap"/);
      expect(page, `${file} error`).toMatch(/kind="error"|<SystemLoadError|catch \{/);
    }
  });

  it("every live DETAIL page declares a not-found state and validates the id shape before reading (a malformed id never reaches the database)", () => {
    for (const file of DETAIL_PAGES) {
      const page = source(file);
      expect(page, file).toMatch(/kind="not-found"|<SystemNotFound/);
      expect(page, file).toMatch(/\[0-9a-f-\]\{36\}|getCommissionPolicy|getTaxRule|getShippingRule|getPaymentAccount/);
    }
    // The four system detail reads validate the id inside the read function itself.
    for (const lib of ["commission", "pricing-rules", "payment-accounts"]) expect(source("lib", "admin", `${lib}.ts`)).toMatch(/\[0-9a-f-\]\{36\}/);
  });

  it("every Feature 010 read throws an INTERNAL code on a database error (so the page renders error, not empty), and no page or component prints error.message/details/hint", () => {
    for (const lib of ["catalogue", "commission", "pricing-rules", "payment-accounts", "roles", "compliance"]) {
      expect(source("lib", "admin", `${lib}.ts`), lib).toMatch(/if \(\w*[eE]rror\) throw new Error\("\w+_read_failed"\)/);
    }
    for (const file of [...walk(ADMIN), ...walk("components/admin"), ...walk("lib/admin")]) {
      expect(source(file), file).not.toMatch(/error\.message|error\.details|error\.hint|\{String\(error\)\}/);
    }
  });

  it("unauthorized (anonymous → operator sign-in redirect) and forbidden (wrong role → forbidden card) are distinct states; a member without a role is a third, distinct state", () => {
    const denied = source("components", "admin", "access-denied.tsx");
    expect(denied).toContain('if (denial === "anonymous") redirect("/admin/sign-in/");');
    expect(denied).toContain('if (denial === "mfa-step-up") redirect("/mfa/");');
    expect(denied).toContain('kind="no-operational-role"');
    expect(denied).toContain('kind="forbidden"');
  });

  it("blocked areas stay blocked placeholders (Feature 008 finance ×3) — no fake queue, no sample rows; disputes is live over Feature 012 (T012)", () => {
    const blocked = ADMIN_AREAS.filter((a) => a.availability === "blocked").map((a) => a.key).sort();
    expect(blocked).toEqual(["invoices", "payments", "payouts"]);
    for (const key of ["payments", "payouts", "invoices"]) expect(source(ADMIN, "(finance)", key, "page.tsx")).toContain(`<AdminAreaPlaceholder areaKey="${key}" />`);
    expect(source(ADMIN, "(compliance)", "disputes", "page.tsx")).not.toContain("AdminAreaPlaceholder");
    const placeholder = source("components", "admin", "area-placeholder.tsx");
    expect(placeholder).toContain('kind="blocked"');
    expect(placeholder).toContain('kind="planned"');
    expect(placeholder).not.toMatch(/TableCardList|placeholderRows|<table/);
  });

  it("route-level loading and error boundaries exist for the whole console; the error boundary renders a generic state and never the raw error", async () => {
    expect(source(ADMIN, "loading.tsx")).toContain('<StateScreen kind="loading" />');
    const boundary = source(ADMIN, "error.tsx");
    expect(boundary).not.toMatch(/error\.message|error\.stack|error\.cause|String\(error\)|\{error\}/); // only `digest` (a non-sensitive correlation id) may be referenced
    const { default: DashboardAdminError } = await import("@/src/app/dashboard-admin/error");
    render(<DashboardAdminError error={Object.assign(new Error("permission denied for table payments (42501) SIMULATED"), { digest: "abc" })} reset={() => undefined} />);
    expect(document.querySelector('[data-state-screen="error"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/permission denied|42501|SIMULATED/);
    cleanup();
    const { default: DashboardAdminLoading } = await import("@/src/app/dashboard-admin/loading");
    render(<DashboardAdminLoading />);
    expect(document.querySelector('[data-state-screen="loading"]')).not.toBeNull();
  });

  it("every recorded domain state / capability gap keeps its explicit marker in the current surfaces", () => {
    const expectations: [string, RegExp][] = [
      ["(compliance)/kyb/[applicationId]/page.tsx", /data-approval-readiness=|data-organization-gap|data-history-unavailable|data-document-view-unavailable|data-file-metadata=/],
      ["(compliance)/organizations/page.tsx", /probe === "gap"[\s\S]*kind="capability-gap"/],
      ["(catalogue)/coffees/[coffeeId]/page.tsx", /CoffeeMediaPanel .*uploadAvailable=|data-coffee-meta/],
      ["(system)/(super)/commission/[policyId]/page.tsx", /TierCoveragePanel|CommissionStatusPanel/],
      ["(system)/(super)/shipping/page.tsx", /<ShippingUnconsumedNotice \/>/],
      ["(system)/payment-accounts/page.tsx", /<HighRiskNotice \/>|data-payment-accounts-read-only/],
      ["(system)/(super)/roles/page.tsx", /<AttributionGapNotice \/>/],
      ["(audit)/audit/page.tsx", /<AuditLogPanel probe=|<AuditReadOnlyBanner \/>/],
    ];
    for (const [file, pattern] of expectations) expect(source(ADMIN, file), file).toMatch(pattern);
    expect(source("components", "admin", "audit", "audit-log-panel.tsx")).toContain('data-capability-gap="db-open-06"');
    expect(source("components", "admin", "catalogue", "coffee-media-panel.tsx")).toContain('data-media-upload={uploadAvailable ? "available" : "unavailable"}');
    expect(source("components", "admin", "catalogue", "coffee-publication-panel.tsx")).toContain('data-decision-state="not-operable"');
    expect(source("components", "admin", "system", "coverage-panel.tsx")).toContain('data-coverage={coverage.covered ? "covered" : "gaps"}');
    expect(source("components", "admin", "system", "notices.tsx")).toMatch(/data-system-notice=\{dataKey\}/);
  });
});

describe("T036 — LIVE: not-found, empty and error states on the real surfaces (disposable SUPER_ADMIN)", () => {
  it("every detail page renders `not-found` for a nil UUID and for a malformed id — 17 pages × 2 ids, no crash, no fabricated record", async () => {
    for (const file of DETAIL_PAGES) {
      for (const id of [NIL, "not-a-uuid"]) {
        await withLiveClient(superAdmin, async () => {
          const { default: Page } = await import(modulePath(file));
          await renderPage(await Page(pageProps(file, id)));
        });
        expect(document.querySelector('[data-admin-state="not-found"]'), `${file} × ${id}`).not.toBeNull();
        expect(document.querySelector("[data-record-form], [data-decision-form]"), `${file} × ${id}`).toBeNull();
        expect(document.body.textContent, `${file} × ${id}`).not.toMatch(RAW_ERROR_TEXT);
        cleanup();
      }
    }
  }, LIVE_TIMEOUT_MS * 2);

  it("the three configuration lists that are genuinely empty in the live database render the honest `empty` state (shipping rules, payment accounts, commission policies)", async () => {
    for (const file of ["src/app/dashboard-admin/(system)/(super)/shipping/page.tsx", "src/app/dashboard-admin/(system)/payment-accounts/page.tsx", "src/app/dashboard-admin/(system)/(super)/commission/page.tsx"]) {
      await withLiveClient(superAdmin, async () => {
        const { default: Page } = await import(modulePath(file));
        await renderPage(await Page({ searchParams: Promise.resolve({}) }));
      });
      expect(document.querySelector('[data-admin-state="empty"]'), file).not.toBeNull();
      expect(document.querySelector('[data-admin-state="error"]'), file).toBeNull();
      cleanup();
    }
  }, LIVE_TIMEOUT_MS);

  it("a simulated database failure renders the inline `error` state on every list page whose read Feature 010 owns, and never a raw message", async () => {
    const failing = failingClient(superAdmin);
    const ownReads = LIST_PAGES.filter((f) => /\(catalogue\)|\(system\)|\/kyb\/page|\/listings\/page|\/organizations\/page|\/disputes\/page|\(audit\)/.test(f));
    expect(ownReads.length).toBeGreaterThanOrEqual(14);
    for (const file of ownReads) {
      await withLiveClient(failing, async () => {
        const { default: Page } = await import(modulePath(file));
        await renderPage(await Page({ searchParams: Promise.resolve({}) }));
      });
      expect(document.querySelector('[data-admin-state="error"]'), file).not.toBeNull();
      expect(document.querySelector('[data-admin-state="empty"]'), file).toBeNull();
      expect(document.body.textContent, file).not.toMatch(RAW_ERROR_TEXT);
      cleanup();
    }
  }, LIVE_TIMEOUT_MS * 2);

  it("a simulated database failure on a detail page throws an INTERNAL read code (caught by the route error boundary), never the raw message", async () => {
    const failing = failingClient(superAdmin);
    for (const file of DETAIL_PAGES.filter((f) => /\(catalogue\)|\(system\)|\/kyb\/|\/listings\/|\/disputes\//.test(f))) {
      const outcome = await withLiveClient(failing, async () => {
        const { default: Page } = await import(modulePath(file));
        try {
          await renderPage(await Page(pageProps(file, NIL)));
          return { threw: false, message: "" };
        } catch (error) {
          return { threw: true, message: error instanceof Error ? error.message : String(error) };
        }
      });
      if (outcome.threw) expect(outcome.message, file).toMatch(/^\w+_read_failed$/);
      else expect(document.body.textContent, file).not.toMatch(/simulated|08006/i);
      cleanup();
    }
  }, LIVE_TIMEOUT_MS * 2);

  it("RECORDED: the warehouse queues/custody surfaces compose Feature 009/005 reads whose contract degrades a database error to an empty result — they render the honest empty state (never raw text); the error state there needs the owning features' read contract", async () => {
    const failing = failingClient(superAdmin);
    for (const file of ["src/app/dashboard-admin/(warehouse)/shipments/page.tsx", "src/app/dashboard-admin/(warehouse)/inventory/page.tsx"]) {
      await withLiveClient(failing, async () => {
        const { default: Page } = await import(modulePath(file));
        await renderPage(await Page({ searchParams: Promise.resolve({}) }));
      });
      expect(document.querySelector('[data-admin-state="empty"], [data-admin-state="error"]'), file).not.toBeNull();
      expect(document.body.textContent, file).not.toMatch(RAW_ERROR_TEXT);
      cleanup();
    }
  }, LIVE_TIMEOUT_MS);

  it("unauthorized vs forbidden vs no-operational-role are three distinct live outcomes on the same page", async () => {
    const member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    const file = "src/app/dashboard-admin/(system)/(super)/commission/page.tsx";
    await withLiveClient(member, async () => {
      const { default: Page } = await import(modulePath(file));
      await renderPage(await Page({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    cleanup();
    await withLiveClient(warehouse, async () => {
      const { default: Page } = await import(modulePath(file));
      await renderPage(await Page({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    cleanup();
    await withLiveClient(createAnonymousFixtureClient(), async () => {
      redirectCalls.targets.length = 0;
      const { default: Page } = await import(modulePath(file));
      const element = await Page({ searchParams: Promise.resolve({}) });
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });
  }, LIVE_TIMEOUT_MS);
});
