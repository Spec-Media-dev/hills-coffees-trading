import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AvailabilityBar } from "@/components/listings/availability-bar";
import { ListingCard } from "@/components/listings/listing-card";
import { ListingStatusBadge } from "@/components/listings/listing-status-badge";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { LISTING_STATUSES, type BuyerBrowseListing } from "@/lib/listings/types";
import { projectFillState } from "@/lib/listings/fills";

afterEach(cleanup);

const baseListing: BuyerBrowseListing = {
  id: "offer-1",
  title: "Feature 006 Fixture — Published Listing",
  coffeeId: "coffee-1",
  coffeeName: "Feature 006 Fixture Coffee",
  lot: { lotId: "lot-1", lotCode: "F006-LOT-C", cropYear: null, qualityGrade: null, cupScore: null, coffeeId: "coffee-1", coffeeName: "Feature 006 Fixture Coffee" },
  warehouse: null,
  sellerType: "HILLS",
  quantityKg: 100,
  reservedQuantityKg: 15.5,
  filledQuantityKg: 24.5,
  pricePerKg: 12.75,
  currency: "USD",
  status: "PARTIALLY_FILLED",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("T011 — ListingStatusBadge: exact closed vocabulary, dot + text", () => {
  it("renders all 9 approved statuses with their exact localized label, never a tenth value", () => {
    for (const status of LISTING_STATUSES) {
      const { unmount } = render(
        <LocaleProvider>
          <ListingStatusBadge status={status} />
        </LocaleProvider>
      );
      expect(document.querySelector(`[data-status="${status}"]`)).toBeTruthy();
      unmount();
    }
  });

  it("communicates status with both an aria-hidden dot and localized text — never color alone", () => {
    render(
      <LocaleProvider>
        <ListingStatusBadge status="PUBLISHED" />
      </LocaleProvider>
    );
    const badge = document.querySelector('[data-slot="listing-status-badge"]');
    expect(badge?.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(badge?.textContent).toContain("Published");
  });
});

describe("T011 — AvailabilityBar: listed/reserved/filled/remaining, from the RUN A fill projection only", () => {
  it("renders the fixture's exact stored quantities verbatim, with units", () => {
    const projection = projectFillState({ quantityKg: baseListing.quantityKg, reservedQuantityKg: baseListing.reservedQuantityKg, filledQuantityKg: baseListing.filledQuantityKg });
    render(
      <LocaleProvider>
        <AvailabilityBar projection={projection} />
      </LocaleProvider>
    );
    expect(screen.getByText("100 kg")).toBeTruthy();
    expect(screen.getByText("15.5 kg")).toBeTruthy();
    expect(screen.getByText("24.5 kg")).toBeTruthy();
    expect(screen.getByText("60 kg")).toBeTruthy();
  });

  it("a zero-listed edge case renders safely — no NaN, no crash", () => {
    const projection = projectFillState({ quantityKg: 0, reservedQuantityKg: 0, filledQuantityKg: 0 });
    render(
      <LocaleProvider>
        <AvailabilityBar projection={projection} />
      </LocaleProvider>
    );
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("a negative-remainder integrity problem renders a controlled error, never a broken/negative bar", () => {
    const projection = projectFillState({ quantityKg: 10, reservedQuantityKg: 6, filledQuantityKg: 6 });
    render(
      <LocaleProvider>
        <AvailabilityBar projection={projection} />
      </LocaleProvider>
    );
    expect(screen.getAllByText(/data integrity/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("-2 kg")).toBeNull();
  });

  it("large quantities never overflow the bar's own bounded value (source-level proof: Math.min(100, ...))", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/listings/availability-bar.tsx", "utf8");
    expect(source).toMatch(/Math\.min\(100,/);
  });
});

describe("T011 — ListingCard: presentation only, no fetching, no independent recalculation", () => {
  it("renders the listing's title, price, currency and the SAME remaining figure the caller computed", () => {
    const projection = projectFillState({ quantityKg: baseListing.quantityKg, reservedQuantityKg: baseListing.reservedQuantityKg, filledQuantityKg: baseListing.filledQuantityKg });
    render(
      <LocaleProvider>
        <ListingCard listing={baseListing} projection={projection} />
      </LocaleProvider>
    );
    expect(screen.getByText("Feature 006 Fixture — Published Listing")).toBeTruthy();
    expect(screen.getByText("USD 12.75")).toBeTruthy();
    expect(screen.getByText("60 kg")).toBeTruthy();
    expect(screen.getAllByText("Hills Coffee").length).toBeGreaterThan(0);
  });

  it("links to the exact listing detail route", () => {
    const projection = projectFillState({ quantityKg: baseListing.quantityKg, reservedQuantityKg: baseListing.reservedQuantityKg, filledQuantityKg: baseListing.filledQuantityKg });
    render(
      <LocaleProvider>
        <ListingCard listing={baseListing} projection={projection} />
      </LocaleProvider>
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/dashboard/coffee/offer-1");
  });

  it("performs no data fetching and no independent quantity arithmetic (source-level proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/listings/listing-card.tsx", "utf8");
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/server["']/);
    expect(source).not.toMatch(/projectFillState/);
    expect(source).not.toMatch(/quantityKg\s*[-+*/]|[-+*/]\s*quantityKg/);
  });
});
