import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 006 RUN C (T017) — the seller listing detail/edit/withdraw page. Proven with module mocks
 * (`@/lib/auth/dal`, `@/lib/listings/manage`) rather than live fixtures: no genuine own-org
 * `coffee_offers` row exists live for the seller-capable fixture (the same settled-order root cause
 * established since RUN B — see `transitions.test.ts`'s own header). This file proves the PAGE's own
 * rendering/authorization logic; `create-action.test.ts`/`submit-action.test.ts`/`transitions.test.ts`
 * already prove every LIVE RLS/ownership boundary this page's own Server Actions depend on.
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  listing: null as unknown,
  history: [] as unknown[],
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/listings/manage", () => ({
  getManagedListingById: vi.fn(async () => mocks.listing),
  getListingStatusHistory: vi.fn(async () => mocks.history),
}));

afterEach(cleanup);

const sellerIdentity = {
  kind: "authenticated" as const,
  userId: "user-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-1", displayName: "Org One", memberRole: "OWNER", canBuy: true, canSell: true },
};

const baseListing = {
  id: "offer-1",
  title: "My Listing",
  coffeeId: "coffee-1",
  coffeeName: "Test Coffee",
  lot: null,
  warehouse: null,
  sellerOrganizationId: "org-1",
  sellerType: "MEMBER_SELLER" as const,
  sourcePurchaseOrderItemId: "order-item-1",
  quantityKg: 100,
  reservedQuantityKg: 0,
  filledQuantityKg: 0,
  pricePerKg: 5,
  currency: "USD",
  status: "DRAFT" as const,
  isVisible: false,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

async function renderPage() {
  vi.resetModules();
  const [{ default: SellerListingDetailPage }, { LocaleProvider }] = await Promise.all([
    import("@/src/app/dashboard/listings/[offerId]/page"),
    import("@/components/locale/locale-provider"),
  ]);
  const element = await SellerListingDetailPage({ params: Promise.resolve({ offerId: "offer-1" }) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T017 — seller listing detail (module mocks)", () => {
  it("a DRAFT listing (editable) renders the edit form and an enabled withdraw button", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = { ...baseListing, status: "DRAFT" };
    mocks.history = [];
    await renderPage();

    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeTruthy();
    const withdrawButton = screen.getByRole("button", { name: /Withdraw listing/i });
    expect(withdrawButton.hasAttribute("disabled")).toBe(false);
  });

  it("a PENDING_REVIEW listing is editable but withdraw is disabled (no ARCHIVED target from PENDING_REVIEW)", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = { ...baseListing, status: "PENDING_REVIEW" };
    mocks.history = [];
    await renderPage();

    expect(screen.getByLabelText("Title")).toBeTruthy();
    const withdrawButton = screen.getByRole("button", { name: /Withdraw listing/i });
    expect(withdrawButton.hasAttribute("disabled")).toBe(true);
  });

  it("a REJECTED listing shows the compliance reason and the 'move to draft' remediation action, never the edit form", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = { ...baseListing, status: "REJECTED", rejectionReason: "Missing warehouse certificate" };
    mocks.history = [];
    await renderPage();

    expect(screen.getByText("Missing warehouse certificate")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Move to draft/i })).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("a REJECTED listing with no recorded reason (RLS/data gap) shows the honest generic message, never a fabricated one", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = { ...baseListing, status: "REJECTED", rejectionReason: null };
    mocks.history = [];
    await renderPage();

    expect(screen.getByText(/Compliance did not approve this listing/i)).toBeTruthy();
  });

  it("a SOLD_OUT listing is neither editable nor withdrawable", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = { ...baseListing, status: "SOLD_OUT" };
    mocks.history = [];
    await renderPage();

    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.getByText("This listing can't be edited in its current state.")).toBeTruthy();
    const withdrawButton = screen.getByRole("button", { name: /Withdraw listing/i });
    expect(withdrawButton.hasAttribute("disabled")).toBe(true);
  });

  it("a buyer-only organization is refused before any listing read", async () => {
    mocks.identity = { ...sellerIdentity, organization: { ...sellerIdentity.organization, canSell: false } };
    mocks.listing = baseListing;
    await renderPage();
    expect(screen.getByText("Selling isn't enabled for your organization")).toBeTruthy();
  });

  it("a nonexistent/cross-org offer id triggers notFound() (getManagedListingById returned null)", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = null;
    await expect(renderPage()).rejects.toBeTruthy();
  });

  it("renders real status history entries when present", async () => {
    mocks.identity = sellerIdentity;
    mocks.listing = { ...baseListing, status: "PENDING_REVIEW" };
    mocks.history = [{ id: "h1", offerId: "offer-1", oldStatus: "DRAFT", newStatus: "PENDING_REVIEW", changedBy: "user-1", reason: null, createdAt: "2026-01-02T00:00:00.000Z" }];
    await renderPage();
    expect(screen.getByText("DRAFT → PENDING_REVIEW")).toBeTruthy();
  });
});
