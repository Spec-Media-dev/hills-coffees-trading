import { readFileSync } from "node:fs";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestIdentity } from "@/lib/auth/types";
import type { BuyerBrowseListing } from "@/lib/listings/types";

/**
 * Final non-payment closure run — homepage Marketplace + "Recently listed" (Features 002 + 006).
 *
 * THE MARKETPLACE IS PRIVATE: only an authorized member's request ever reaches the listing/media reads;
 * every other audience renders a state panel with NO listing data — and the listing and media queries
 * are provably never CALLED for them (not fetched-then-hidden).
 */
const mocks = vi.hoisted(() => ({
  identity: { kind: "anonymous" } as unknown,
  rows: [] as unknown[],
  getBrowseListings: vi.fn(),
  getPrimaryOfferImages: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: async () => mocks.identity }));
vi.mock("@/lib/listings/browse", () => ({ getBrowseListings: mocks.getBrowseListings }));
vi.mock("@/lib/listings/media", () => ({ getPrimaryOfferImages: mocks.getPrimaryOfferImages }));

beforeEach(() => {
  mocks.getBrowseListings.mockReset().mockImplementation(async () => ({ rows: mocks.rows, hasMore: false }));
  mocks.getPrimaryOfferImages.mockReset().mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, `https://x.supabase.co/storage/v1/object/sign/offer-media/${id}.webp?token=SIGNED`])));
});
afterEach(cleanup);

const org = { organizationId: "org-1", displayName: "Org One", memberRole: "OWNER", canBuy: true, canSell: true };
const member = {
  kind: "authenticated",
  userId: "user-1",
  requiresMfaStepUp: false,
  isEmailVerified: true,
  requiresOrganizationSelection: false,
  organization: org,
  organizations: [org],
  isAuthorizedMember: true,
  operationalRoles: [],
  profile: { fullName: "Sara", companyName: null, avatarPath: null },
} as unknown as RequestIdentity;

const listing = (n: number): BuyerBrowseListing => ({
  id: `offer-${n}`,
  title: `Secret lot ${n}`,
  coffeeId: "c-1",
  coffeeName: "Guji",
  lot: null,
  warehouse: null,
  sellerType: "MEMBER_SELLER",
  quantityKg: 1000 + n,
  reservedQuantityKg: 0,
  filledQuantityKg: 0,
  pricePerKg: 7.77,
  currency: "USD",
  status: "PUBLISHED",
  createdAt: `2026-09-${String(10 + n).padStart(2, "0")}T00:00:00.000Z`,
  updatedAt: "2026-09-01T00:00:00.000Z",
});

async function renderRecentlyListed() {
  const [{ RecentlyListed }, { LocaleProvider }] = await Promise.all([import("@/components/marketplace/home-marketplace"), import("@/components/locale/locale-provider")]);
  const element = await RecentlyListed();
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const PRIVATE_MARKERS = [/offer-\d/, /Secret lot/, /7\.77/, /1,?00\d/, /offer-media/, /token=/, /\/dashboard\/coffee\/offer-/];

describe("resolveMarketplaceAccess — who may see real listings", () => {
  it("classifies every audience; only a verified, org-scoped authorized member is a member", async () => {
    const { resolveMarketplaceAccess } = await import("@/components/marketplace/home-marketplace");
    expect(resolveMarketplaceAccess({ kind: "anonymous" } as RequestIdentity)).toBe("anonymous");
    expect(resolveMarketplaceAccess(member)).toBe("member");
    expect(resolveMarketplaceAccess({ ...member, requiresMfaStepUp: true } as RequestIdentity)).toBe("mfa");
    expect(resolveMarketplaceAccess({ ...member, isAuthorizedMember: false } as RequestIdentity)).toBe("pending");
    expect(resolveMarketplaceAccess({ ...member, isEmailVerified: false } as RequestIdentity)).toBe("pending");
    expect(resolveMarketplaceAccess({ ...member, requiresOrganizationSelection: true } as RequestIdentity)).toBe("pending");
    expect(resolveMarketplaceAccess({ ...member, organization: null, organizations: [], isAuthorizedMember: false, operationalRoles: ["ADMIN"] } as unknown as RequestIdentity)).toBe("operator");
  });

  it("routes View all / the nav entry: member → /dashboard/coffee/, anonymous → /sign-up/ (no next= param)", async () => {
    const { marketplaceDestination } = await import("@/components/marketplace/home-marketplace");
    expect(marketplaceDestination("member")).toBe("/dashboard/coffee/");
    expect(marketplaceDestination("anonymous")).toBe("/sign-up/");
    expect(marketplaceDestination("mfa")).toBe("/mfa/");
    expect(marketplaceDestination("pending")).toBe("/dashboard/");
    for (const access of ["member", "anonymous", "mfa", "pending", "operator"] as const) expect(marketplaceDestination(access)).not.toMatch(/next=/);
  });
});

describe("RecentlyListed — anonymous and ineligible audiences load NOTHING", () => {
  it("anonymous: a locked teaser with sign-up / sign-in, and the listing + media queries are never called", async () => {
    mocks.identity = { kind: "anonymous" };
    mocks.rows = [listing(1), listing(2)];
    const { container } = await renderRecentlyListed();
    expect(container.querySelector('[data-recently-listed="anonymous"]')).toBeTruthy();
    expect(container.querySelector("[data-marketplace-signup]")?.getAttribute("href")).toMatch(/^\/sign-up\/?$/);
    expect(container.querySelector("[data-marketplace-signin]")?.getAttribute("href")).toMatch(/^\/sign-in\/?$/);
    expect(mocks.getBrowseListings).not.toHaveBeenCalled();
    expect(mocks.getPrimaryOfferImages).not.toHaveBeenCalled();
    const html = container.innerHTML;
    for (const marker of PRIVATE_MARKERS) expect(html).not.toMatch(marker);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it.each([
    ["pending (not an authorized member)", { ...member, isAuthorizedMember: false }, "pending"],
    ["mfa step-up outstanding", { ...member, requiresMfaStepUp: true }, "mfa"],
    ["operator without an organization", { ...member, organization: null, organizations: [], isAuthorizedMember: false, operationalRoles: ["ADMIN"] }, "operator"],
  ])("%s: a state panel, and no listing/media query", async (_label, identity, state) => {
    mocks.identity = identity;
    mocks.rows = [listing(1)];
    const { container } = await renderRecentlyListed();
    expect(container.querySelector(`[data-recently-listed="${state}"]`)).toBeTruthy();
    expect(mocks.getBrowseListings).not.toHaveBeenCalled();
    expect(mocks.getPrimaryOfferImages).not.toHaveBeenCalled();
    for (const marker of PRIVATE_MARKERS) expect(container.innerHTML).not.toMatch(marker);
  });
});

describe("RecentlyListed — authorized member", () => {
  it("reuses getBrowseListings({ page: 0, pageSize: 5 }) and renders at most five real listings", async () => {
    mocks.identity = member;
    mocks.rows = [1, 2, 3, 4, 5, 6, 7].map(listing); // defensive: more than 5 must still render 5
    const { container } = await renderRecentlyListed();
    expect(mocks.getBrowseListings).toHaveBeenCalledTimes(1);
    expect(mocks.getBrowseListings).toHaveBeenCalledWith({ page: 0, pageSize: 5 });
    expect(mocks.getPrimaryOfferImages).toHaveBeenCalledWith(["offer-1", "offer-2", "offer-3", "offer-4", "offer-5"]);
    const root = container.querySelector('[data-recently-listed="member"]');
    expect(root?.getAttribute("data-recently-listed-count")).toBe("5");
    expect(root?.querySelectorAll("li")).toHaveLength(5);
    expect(container.querySelector("[data-recently-listed-view-all]")?.getAttribute("href")).toMatch(/^\/dashboard\/coffee\/?$/);
  });

  it("keeps the browse read's order (newest first) rather than re-sorting", async () => {
    mocks.identity = member;
    mocks.rows = [3, 1, 2].map(listing);
    const { container } = await renderRecentlyListed();
    const titles = [...container.querySelectorAll('[data-recently-listed="member"] li')].map((li) => li.textContent ?? "");
    expect(titles[0]).toContain("Secret lot 3");
    expect(titles[1]).toContain("Secret lot 1");
    expect(titles[2]).toContain("Secret lot 2");
  });

  it("an empty marketplace renders an honest empty state, never invented listings", async () => {
    mocks.identity = member;
    mocks.rows = [];
    const { container } = await renderRecentlyListed();
    expect(container.querySelector("[data-recently-listed-empty]")).toBeTruthy();
    expect(container.querySelector('[data-recently-listed="member"]')?.getAttribute("data-recently-listed-count")).toBe("0");
  });
});

describe("static guarantees", () => {
  const browse = readFileSync("lib/listings/browse.ts", "utf8");
  const home = readFileSync("src/app/page.tsx", "utf8");
  const marketplaceModule = readFileSync("components/marketplace/home-marketplace.tsx", "utf8");

  it("orders by created_at DESC with an id DESC tie-break — never updated_at", () => {
    expect(browse).toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
    expect(browse).not.toMatch(/\.order\("updated_at"/);
  });

  it("the homepage itself stays identity-independent and streams the member module behind Suspense", () => {
    expect(home).not.toMatch(/getRequestIdentity\(/);
    expect(home).toMatch(/<Suspense fallback=\{<MarketplaceLockedTeaser loading \/>\}>\s*<RecentlyListed \/>\s*<\/Suspense>/);
    expect(home).toMatch(/data-catalogue-vs-marketplace/);
  });

  it("the listing and media reads appear only after the member gate", () => {
    const gate = marketplaceModule.indexOf('if (access !== "member") return');
    expect(gate).toBeGreaterThan(0);
    expect(marketplaceModule.indexOf("await getBrowseListings(")).toBeGreaterThan(gate);
    expect(marketplaceModule.indexOf("await getPrimaryOfferImages(")).toBeGreaterThan(gate);
    expect(marketplaceModule).not.toMatch(/createAdminClient|service_role|SERVICE_ROLE/);
  });

  it("the Suspense fallback teaser is data-free", async () => {
    const [{ MarketplaceLockedTeaser }, { LocaleProvider }] = await Promise.all([import("@/components/marketplace/home-marketplace"), import("@/components/locale/locale-provider")]);
    const { container } = render(
      <LocaleProvider>
        <MarketplaceLockedTeaser loading />
      </LocaleProvider>
    );
    expect(container.querySelector('[data-recently-listed="loading"]')).toBeTruthy();
    expect(container.querySelectorAll("a, img")).toHaveLength(0);
  });
});

describe("navigation — Marketplace vs Coffee catalogue", () => {
  const header = readFileSync("components/public/site-header.tsx", "utf8");
  const mobile = readFileSync("components/public/mobile-nav.tsx", "utf8");

  it("the desktop header leads with an identity-aware Marketplace entry before the catalogue items", () => {
    expect(header).toMatch(/data-nav-marketplace/);
    expect(header.indexOf("data-nav-marketplace")).toBeLessThan(header.indexOf("PRIMARY_NAV.map"));
    expect(header).toMatch(/marketplaceAccess === "member" \? marketplaceDestination\("member"\) : "\/#marketplace"/);
    expect(header).toMatch(/ACCOUNT_ROUTES\.signUp/);
    expect(header).not.toMatch(/\?\? "Account"/);
  });

  it("the mobile drawer carries the same Marketplace entry and a localized account fallback", () => {
    expect(mobile).toMatch(/data-mobile-nav-marketplace/);
    expect(mobile).toMatch(/href=\{marketplaceHref\}/);
    expect(mobile).toMatch(/tApp\.dashboardAccount\.fallbackName/);
  });

  it("the copy states the distinction in both languages", async () => {
    const [{ en }, { ar }] = await Promise.all([import("@/lib/public/copy/en"), import("@/lib/public/copy/ar")]);
    expect(en.megaMenu.coffee.title).toMatch(/catalogue/i);
    expect(en.nav.marketplace).toBe("Marketplace");
    expect(ar.nav?.marketplace).toBeTruthy();
    expect(ar.megaMenu?.coffee?.title).toContain("كتالوج");
  });
});
