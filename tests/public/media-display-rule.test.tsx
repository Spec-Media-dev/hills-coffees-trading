import { readFileSync } from "node:fs";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicCoffeeImage, PublicCoffeeSummary } from "@/lib/public/coffees";

/**
 * Pre-Stripe hardening run — MEDIA DISPLAY RULE, "primary outside, gallery inside", for BOTH
 * catalogue coffees (`coffee_media`) and seller listings (`coffee_offer_media`):
 * - list/card surfaces show exactly ONE image — the primary, or (defensively) the first in sort order;
 * - detail pages show EVERY authorized image in a gallery that opens on the primary, keeps the stored
 *   order for the supporting images, and swaps the chosen image into the main slot.
 */
vi.mock("motion/react", async () => {
  const React = await import("react");
  const MOTION_ONLY = new Set(["layout", "layoutId", "transition"]);
  const domProps = (props: Record<string, unknown>) => Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_ONLY.has(key)));
  const button = React.forwardRef<HTMLButtonElement, Record<string, unknown>>((props, ref) => React.createElement("button", { ...domProps(props), ref }));
  button.displayName = "MotionButton";
  return {
    useReducedMotion: () => true,
    LayoutGroup: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: { button },
  };
});

afterEach(cleanup);

const img = (n: number, isPrimary = false): PublicCoffeeImage => ({ url: `https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/${n}.webp`, isPrimary });

describe("pickCardImage — the ONE catalogue image a card shows", () => {
  it("selects the admin's primary even when it is not first in sort order", async () => {
    const { pickCardImage } = await import("@/lib/public/coffees");
    expect(pickCardImage([img(1), img(2, true), img(3)])?.url).toMatch(/2\.webp$/);
  });

  it("falls back to the first image (sort order) when no primary exists, and null when there are none", async () => {
    const { pickCardImage } = await import("@/lib/public/coffees");
    expect(pickCardImage([img(7), img(8)])?.url).toMatch(/7\.webp$/);
    expect(pickCardImage([])).toBeNull();
  });

  it("set-primary / reorder changes the card image: moving the primary flag moves the card's image", async () => {
    const { pickCardImage } = await import("@/lib/public/coffees");
    const before = [img(1, true), img(2), img(3)];
    const afterSetPrimary = [img(1), img(2), img(3, true)];
    expect(pickCardImage(before)?.url).toMatch(/1\.webp$/);
    expect(pickCardImage(afterSetPrimary)?.url).toMatch(/3\.webp$/);
  });

  it("the public DTO keeps the admin sort order (primary is FLAGGED, not moved) and derives card + gallery start from it", () => {
    const source = readFileSync("lib/public/coffees.ts", "utf8");
    expect(source).toContain(".sort((a, b) => a.sort_order - b.sort_order)");
    expect(source).not.toMatch(/Number\(b\.is_primary\) - Number\(a\.is_primary\)/);
    expect(source).toContain("image: pickCardImage(supplement.images)");
  });
});

describe("CoffeeCard — multiple images never produce multiple card images", () => {
  const base: PublicCoffeeSummary = {
    name: "Sidamo Natural",
    nameAr: null,
    slug: "sidamo-natural",
    description: null,
    descriptionAr: null,
    origin: null,
    coffeeType: null,
    processingMethod: null,
    image: img(2, true),
  };

  it("renders exactly one image — the primary", async () => {
    const { CoffeeCard } = await import("@/components/public/coffee-card");
    const { container } = render(
      <ul>
        <CoffeeCard coffee={base} />
      </ul>,
    );
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]!.getAttribute("src")).toMatch(/2\.webp/);
  });
});

describe("ListingCard — seller listing cards show only the primary listing image", () => {
  const listing = {
    id: "offer-1",
    coffeeId: "c-1",
    coffeeName: "Guji",
    lot: null,
    title: "Guji washed",
    sellerType: "MEMBER_SELLER",
    warehouse: null,
    quantityKg: 100,
    reservedQuantityKg: 0,
    filledQuantityKg: 0,
    pricePerKg: "7.50",
    currency: "USD",
    status: "PUBLISHED",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  } as unknown as import("@/lib/listings/types").BuyerBrowseListing;
  const projection = { ok: true, remainingQuantityKg: 100 } as unknown as import("@/lib/listings/types").FillProjection;

  it("with an image: exactly one <img>, the signed primary URL", async () => {
    const { ListingCard } = await import("@/components/listings/listing-card");
    const { container } = render(<ListingCard listing={listing} projection={projection} imageUrl="https://x.supabase.co/storage/v1/object/sign/listing-media/offers/o/1.webp?token=t" />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("[data-listing-card-media]")?.getAttribute("data-listing-card-media")).toBe("image");
  });

  it("without an image: the neutral placeholder in the same box", async () => {
    const { ListingCard } = await import("@/components/listings/listing-card");
    const { container } = render(<ListingCard listing={listing} projection={projection} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector("[data-listing-card-media]")?.getAttribute("data-listing-card-media")).toBe("placeholder");
  });

  it("pickPrimaryOfferMedia: primary first, else first by sort order", async () => {
    const { pickPrimaryOfferMedia } = await import("@/lib/listings/media");
    expect(pickPrimaryOfferMedia([{ sortOrder: 2, isPrimary: false, k: "b" }, { sortOrder: 1, isPrimary: false, k: "a" }])?.k).toBe("a");
    expect(pickPrimaryOfferMedia([{ sortOrder: 0, isPrimary: false, k: "a" }, { sortOrder: 1, isPrimary: true, k: "b" }])?.k).toBe("b");
    expect(pickPrimaryOfferMedia([])).toBeNull();
  });

  it("the marketplace browse page and the seller's own listings table resolve ONE image per offer", () => {
    expect(readFileSync("src/app/dashboard/coffee/page.tsx", "utf8")).toContain("imageUrl={primaryImages.get(listing.id) ?? null}");
    expect(readFileSync("src/app/dashboard/listings/page.tsx", "utf8")).toContain("getPrimaryOfferImages(rows.map((row) => row.id))");
    // never catalogue media on a listing card
    expect(readFileSync("components/listings/listing-card.tsx", "utf8")).not.toMatch(/coffee_media|public_coffee_images/);
  });

  it("the buyer listing detail renders EVERY authorized listing image as a gallery opening on the primary", () => {
    const page = readFileSync("src/app/dashboard/coffee/[offerId]/page.tsx", "utf8");
    expect(page).toContain("getOfferMedia(offerId)");
    expect(page).toContain("<MediaGallery");
    expect(page).toContain("initialIndex={primaryIndex}");
    expect(page).toMatch(/unoptimized/);
  });
});

describe("MediaGallery — the detail-page product gallery", () => {
  const urls = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/${i}.webp` }));

  async function renderGallery(n: number, initialIndex = 0) {
    const { LocaleProvider } = await import("@/components/locale/locale-provider");
    const { MediaGallery } = await import("@/components/media/media-gallery");
    return render(
      <LocaleProvider>
        <MediaGallery images={urls(n)} initialIndex={initialIndex} />
      </LocaleProvider>,
    );
  }
  const thumbs = (container: HTMLElement, kind: "featured" | "more") => [...container.querySelectorAll(`[data-gallery-tile="${kind}"]`)].map((node) => node.getAttribute("data-gallery-thumb"));

  it("one image: a single clean frame — no tiles, no counter, no gallery chrome", async () => {
    const { container } = await renderGallery(1);
    expect(container.querySelectorAll("[data-gallery-tile]")).toHaveLength(0);
    expect(container.querySelector("[data-gallery-position]")).toBeNull();
    expect(container.querySelector("[data-gallery-main]")).not.toBeNull();
  });

  it("two images: the second is one wide featured tile", async () => {
    const { container } = await renderGallery(2);
    expect(thumbs(container, "featured")).toEqual(["1"]);
    expect(thumbs(container, "more")).toEqual([]);
  });

  it("three+ images: the primary is main, the next two are featured, the rest are small — all in stored order", async () => {
    const { container } = await renderGallery(6);
    expect(container.querySelector("[data-media-gallery]")?.getAttribute("data-gallery-active")).toBe("0");
    expect(thumbs(container, "featured")).toEqual(["1", "2"]);
    expect(thumbs(container, "more")).toEqual(["3", "4", "5"]);
    expect(container.querySelectorAll("[data-gallery-tile]")).toHaveLength(5); // every image appears inside
  });

  it("opens on the primary even when the primary is not first in sort order", async () => {
    const { container } = await renderGallery(4, 2);
    expect(container.querySelector("[data-gallery-main]")?.getAttribute("src")).toMatch(/2\.webp/);
    expect(thumbs(container, "featured")).toEqual(["0", "1"]);
    expect(thumbs(container, "more")).toEqual(["3"]);
  });

  it("clicking a tile makes it the main image; the previous main returns to its stored slot", async () => {
    const { container } = await renderGallery(6);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-gallery-thumb="4"]')!);
    });
    expect(container.querySelector("[data-media-gallery]")?.getAttribute("data-gallery-active")).toBe("4");
    expect(container.querySelector("[data-gallery-main]")?.getAttribute("src")).toMatch(/4\.webp/);
    expect(thumbs(container, "featured")).toEqual(["0", "1"]);
    expect(thumbs(container, "more")).toEqual(["2", "3", "5"]);
  });

  it("tiles are labelled buttons and Arrow keys move focus between them", async () => {
    const { container } = await renderGallery(4);
    const first = container.querySelector('[data-gallery-thumb="1"]') as HTMLButtonElement;
    expect(first.tagName).toBe("BUTTON");
    expect(first.getAttribute("aria-label")).toMatch(/2/);
    first.focus();
    await act(async () => {
      fireEvent.keyDown(first, { key: "ArrowRight" });
    });
    expect((document.activeElement as HTMLElement).getAttribute("data-gallery-thumb")).toBe("2");
  });

  it("there are no side arrows — the gallery is tile-driven", async () => {
    const { container } = await renderGallery(3);
    expect(container.querySelector("[data-gallery-previous], [data-gallery-next]")).toBeNull();
  });
});
