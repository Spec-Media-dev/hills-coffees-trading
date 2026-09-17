import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ADMIN_AREAS } from "@/lib/admin/areas";
import { FOUNDATION_FIXTURES, cleanupSuperAdminFixture, inspectSuperAdminFixture, prepareSuperAdminFixture, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 010 Phase 12 — T039 surface-separation PROOF (recorded by RUN H; the task itself stays open
 * because it depends on T038, whose "Depends: all" is unmet).
 *
 * Real sessions, real identity resolution, the real route layouts:
 *  1. an approved trading MEMBER with no operational role (buyerOnly) is refused by the console
 *     shell (`src/app/dashboard-admin/layout.tsx`) and by every one of the 22 declared areas with the
 *     `no-operational-role` denial — the member's organization authorization buys nothing here;
 *  2. an OPERATOR with no organization (the standing WAREHOUSE fixture and the disposable SUPER_ADMIN)
 *     is refused by the member trading surface: `src/app/dashboard/layout.tsx` renders onboarding —
 *     never the member shell, never `{children}` — and `src/app/dashboard/coffee/layout.tsx` (the
 *     marketplace guard) refuses outright; the console admits the same session;
 *  3. the two surfaces read different facts from the same identity (`organization` vs
 *     `operationalRoles`) — neither implies the other.
 */

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
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  usePathname: () => "/dashboard/",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/cache")>()), revalidatePath: () => undefined, revalidateTag: () => undefined }));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}
async function renderTree(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  const { ThemeProvider } = await import("@/components/theme/theme-provider");
  return render(
    <ThemeProvider>
      <LocaleProvider>{element}</LocaleProvider>
    </ThemeProvider>,
  );
}
const CHILD_MARKER = "surface-separation-child-marker";
const child = <p data-testid={CHILD_MARKER}>{CHILD_MARKER}</p>;

const LIVE_TIMEOUT_MS = 120_000;
let member: SupabaseClient;
let warehouseOperator: SupabaseClient;
let superAdmin: SupabaseClient;

beforeAll(async () => {
  // jsdom does not implement matchMedia; the member shell's ThemeProvider subscribes to it on mount.
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList);
  prepareSuperAdminFixture();
  [member, warehouseOperator, superAdmin] = await Promise.all([
    signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email),
    signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email),
    signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email),
  ]);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  const result = cleanupSuperAdminFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectSuperAdminFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T039 proof — /dashboard and /dashboard-admin are independent authorization surfaces (live sessions)", () => {
  it("an approved trading MEMBER with no operational role: authorized on the member surface, refused by the console shell AND all 22 areas (no-operational-role)", async () => {
    await withLiveClient(member, async () => {
      const { getRequestIdentity } = await import("@/lib/auth/dal");
      const identity = await getRequestIdentity();
      expect(identity.kind).toBe("authenticated");
      if (identity.kind !== "authenticated") return;
      expect(identity.organization).not.toBeNull();
      expect(identity.isAuthorizedMember).toBe(true);
      expect(identity.operationalRoles).toEqual([]);

      const { checkConsoleShellAccess, checkAreaAccess } = await import("@/lib/admin/guards");
      const shell = await checkConsoleShellAccess();
      expect(shell.ok).toBe(false);
      if (!shell.ok) expect(shell.denial).toBe("no-operational-role");
      for (const area of ADMIN_AREAS) {
        const access = await checkAreaAccess(area.key);
        expect(access.ok, area.key).toBe(false);
        if (!access.ok) expect(access.denial, area.key).toBe("no-operational-role");
      }

      const { default: DashboardAdminLayout } = await import("@/src/app/dashboard-admin/layout");
      await renderTree(await DashboardAdminLayout({ children: child }));
      expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
      expect(document.querySelector(`[data-testid="${CHILD_MARKER}"]`)).toBeNull();
      expect(document.querySelector("nav")).toBeNull();
    });
  }, LIVE_TIMEOUT_MS);

  it.each([
    ["WAREHOUSE (standing fixture)", () => warehouseOperator],
    ["SUPER_ADMIN (disposable fixture)", () => superAdmin],
  ])("an OPERATOR with no organization — %s: admitted to the console, refused by the member trading surface (onboarding, no shell, no children; marketplace guard refuses)", async (_label, client) => {
    await withLiveClient(client(), async () => {
      const { getRequestIdentity } = await import("@/lib/auth/dal");
      const identity = await getRequestIdentity();
      expect(identity.kind).toBe("authenticated");
      if (identity.kind !== "authenticated") return;
      expect(identity.operationalRoles.length).toBeGreaterThan(0);
      expect(identity.organization).toBeNull();
      expect(identity.organizations).toEqual([]);
      expect(identity.isAuthorizedMember).toBe(false);

      const { checkConsoleShellAccess } = await import("@/lib/admin/guards");
      expect((await checkConsoleShellAccess()).ok).toBe(true);

      const { default: DashboardLayout } = await import("@/src/app/dashboard/layout");
      await renderTree(await DashboardLayout({ children: child }));
      expect(document.querySelector(`[data-testid="${CHILD_MARKER}"]`)).toBeNull();
      expect(document.querySelector('[data-slot="app-shell"], aside nav')).toBeNull();
      expect(document.body.textContent).not.toContain(CHILD_MARKER);
      cleanup();

      const { default: CoffeeLayout } = await import("@/src/app/dashboard/coffee/layout");
      await renderTree(await CoffeeLayout({ children: child }));
      expect(document.querySelector('[data-state-screen="unauthorized"], [data-state-screen="forbidden"]')).not.toBeNull();
      expect(document.querySelector(`[data-testid="${CHILD_MARKER}"]`)).toBeNull();
    });
  }, LIVE_TIMEOUT_MS);

  it("the member surface admits the member's children; the console admits the operator's children — the two facts never cross", async () => {
    await withLiveClient(member, async () => {
      const { default: DashboardLayout } = await import("@/src/app/dashboard/layout");
      await renderTree(await DashboardLayout({ children: child }));
      expect(document.querySelector(`[data-testid="${CHILD_MARKER}"]`)).not.toBeNull();
    });
    cleanup();
    await withLiveClient(warehouseOperator, async () => {
      const { default: DashboardAdminLayout } = await import("@/src/app/dashboard-admin/layout");
      await renderTree(await DashboardAdminLayout({ children: child }));
      expect(document.querySelector(`[data-testid="${CHILD_MARKER}"]`)).not.toBeNull();
      expect(document.querySelector('[data-admin-state="no-operational-role"]')).toBeNull();
    });
  }, LIVE_TIMEOUT_MS);
});
