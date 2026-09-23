import { readFileSync } from "node:fs";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicCoffeeDetail } from "@/lib/public/coffees";

/**
 * Pre-Stripe hardening run — the redesigned public coffee detail page, rendered from a fixture DTO.
 * Proves the commercial hierarchy keeps Feature 011's price concepts apart (reference data labelled
 * as information; live seller offers stated as members-only, never rendered from public data), the
 * grouped specification, the gallery ("gallery inside") and the missing-image fallback.
 */
const fixture = vi.hoisted(() => ({ coffee: null as unknown }));
vi.mock("@/lib/public/coffees", async (original) => ({
  ...(await original<typeof import("@/lib/public/coffees")>()),
  getPublicCoffeeBySlug: async () => fixture.coffee,
}));
vi.mock("@/lib/pricing/presentation", () => ({
  getReferencePresentation: async () => ({ status: "unavailable", unavailable: { reason: "no_approved_source", lastSuccessAt: null } }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("motion/react", async () => {
  const React = await import("react");
  const MOTION_ONLY = new Set(["layout", "layoutId", "transition"]);
  const domProps = (props: Record<string, unknown>) => Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_ONLY.has(key)));
  const button = React.forwardRef<HTMLButtonElement, Record<string, unknown>>((props, ref) => React.createElement("button", { ...domProps(props), ref }));
  button.displayName = "MotionButton";
  return { useReducedMotion: () => true, LayoutGroup: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children), motion: { button } };
});

afterEach(cleanup);

const base: PublicCoffeeDetail = {
  name: "Guji Natural",
  nameAr: "جوجي طبيعية",
  slug: "guji-natural",
  description: "A natural lot.",
  descriptionAr: null,
  origin: { name: "Guji", nameAr: "جوجي", slug: "guji", countryCode: "ET", region: { name: "Oromia", nameAr: "أوروميا", slug: "oromia", countryCode: "ET" } },
  coffeeType: { name: "Arabica", nameAr: "أرابيكا", slug: "arabica" },
  processingMethod: { name: "Natural", nameAr: null, slug: "natural" },
  image: { url: "https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/2.webp", isPrimary: true },
  images: [
    { url: "https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/1.webp", isPrimary: false },
    { url: "https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/2.webp", isPrimary: true },
    { url: "https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/3.webp", isPrimary: false },
  ],
  variety: null,
  packagingType: { name: "GrainPro", nameAr: null, slug: "grainpro" },
  tags: [{ name: "Fruity", nameAr: "فاكهي", slug: "fruity" }],
  certifications: [{ name: "Organic", expiresAt: "2027-01-01" }],
};

async function renderPage(coffee: PublicCoffeeDetail) {
  fixture.coffee = coffee;
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  const { default: Page } = await import("@/src/app/(public)/coffee/[slug]/page");
  const element = await Page({ params: Promise.resolve({ slug: coffee.slug }) });
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("public coffee detail — commercial hierarchy", () => {
  it("states live seller offers as members-only and renders NO offer price / quantity / seller from public data", async () => {
    const { container } = await renderPage(base);
    const offers = container.querySelector('[data-coffee-offers="members-only"]');
    expect(offers).not.toBeNull();
    const hrefs = [...(offers?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([expect.stringMatching(/^\/sign-in\/?$/), expect.stringMatching(/^\/portal-entry\/?$/)]));
    // No executable number anywhere on the page: no currency amount, no per-kg price, no stock figure.
    expect(container.textContent).not.toMatch(/\b(USD|AED|EUR)\s?\d|\d+\s?kg\b/i);
  });

  it("labels reference market data as information, separate from offers, and keeps the RFQ path", async () => {
    const { container } = await renderPage(base);
    const reference = container.querySelector("[data-coffee-reference]");
    expect(reference?.textContent).toMatch(/Reference market data/);
    expect(reference?.textContent).toMatch(/not an offer/i);
    expect(container.querySelector("[data-coffee-rfq] a")?.getAttribute("href")).toMatch(/^\/contact\/?$/);
  });

  it("the page never reads listing/offer tables and passes the COFFEE scope to the reference contract", () => {
    const source = readFileSync("src/app/(public)/coffee/[slug]/page.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/coffee_offers|getBrowseListings|price_per_kg/);
    expect(source).toContain('getReferencePresentation({ kind: "coffee", slug: coffee.slug })');
  });
});

describe("public coffee detail — specification + localization", () => {
  it("groups the specification into cards (coffee / processing & packaging / origin), with an honest 'Not specified'", async () => {
    const { container } = await renderPage(base);
    const groups = [...container.querySelectorAll("[data-spec-group]")].map((node) => node.getAttribute("data-spec-group"));
    expect(groups).toEqual(["identity", "processing", "origin"]);
    expect(container.querySelector('[data-spec-group="identity"]')?.textContent).toMatch(/Not specified/); // variety is null
    expect(container.querySelector('[data-spec-group="origin"] a')?.getAttribute("href")).toMatch(/^\/origins\/guji\/?$/);
  });

  it("renders Arabic taxonomy/tag values where translations exist and English (marked) where they do not", async () => {
    const { container } = await renderPage(base);
    const arabic = [...container.querySelectorAll('[lang="ar"]')].map((node) => node.textContent);
    expect(arabic).toEqual(expect.arrayContaining(["جوجي طبيعية", "أوروميا", "أرابيكا", "فاكهي"]));
    const tags = container.querySelector("[data-coffee-tags]");
    expect(tags?.querySelector('li [lang="ar"]')?.textContent).toBe("فاكهي");
    const englishOnly = [...container.querySelectorAll('span[lang="en"][dir="ltr"]:not(.hc-lang-en)')].map((node) => node.textContent);
    expect(englishOnly).toEqual(expect.arrayContaining(["Natural", "GrainPro", "Organic"]));
  });
});

describe("public coffee detail — media", () => {
  it("renders the full gallery opening on the PRIMARY (even when it is not first), with every other image as a tile", async () => {
    const { container } = await renderPage(base);
    const gallery = container.querySelector("[data-media-gallery]");
    expect(gallery?.getAttribute("data-gallery-count")).toBe("3");
    expect(gallery?.querySelector("[data-gallery-main]")?.getAttribute("src")).toMatch(/2\.webp/);
    expect([...gallery!.querySelectorAll("[data-gallery-tile]")].map((node) => node.getAttribute("data-gallery-thumb"))).toEqual(["0", "2"]);
  });

  it("with no images, shows the designed placeholder and no gallery", async () => {
    const { container } = await renderPage({ ...base, image: null, images: [] });
    expect(container.querySelector("[data-media-gallery]")).toBeNull();
    expect(container.querySelector("[data-coffee-media]")?.textContent ?? "").not.toMatch(/undefined/);
    expect(container.querySelector("[data-coffee-media] [data-media-placeholder], [data-coffee-media] div")).not.toBeNull();
  });
});

describe("public coffee detail — lifecycle, optional relations & slug resolution regression", () => {
  it("1. Published coffee present in index resolves on detail page", async () => {
    const { container } = await renderPage(base);
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toMatch(/Guji Natural/);
    expect(container.querySelector("[data-coffee-detail]")).not.toBeNull();
  });

  it("2. Published coffee with missing optional relation still resolves without throwing or 404", async () => {
    const minimal: PublicCoffeeDetail = {
      name: "Minimal Published Coffee",
      nameAr: null,
      slug: "minimal-published-coffee",
      description: null,
      descriptionAr: null,
      origin: null,
      coffeeType: null,
      processingMethod: null,
      image: null,
      images: [],
      variety: null,
      packagingType: null,
      tags: [],
      certifications: [],
    };
    const { container } = await renderPage(minimal);
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toMatch(/Minimal Published Coffee/);
    expect(container.querySelector("[data-spec-group='origin']")?.textContent).toMatch(/Not specified/);
    expect(container.querySelector("[data-media-placeholder], [data-coffee-media] div")).not.toBeNull();
  });

  it("3. Unknown slug returns 404 (triggers notFound)", async () => {
    fixture.coffee = null;
    const { default: Page } = await import("@/src/app/(public)/coffee/[slug]/page");
    await expect(Page({ params: Promise.resolve({ slug: "nonexistent-unknown-slug" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("4. Draft coffee returns 404 (triggers notFound)", async () => {
    fixture.coffee = null;
    const { default: Page } = await import("@/src/app/(public)/coffee/[slug]/page");
    await expect(Page({ params: Promise.resolve({ slug: "public-test-coffee-draft" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("5. Archived/non-public coffee returns 404 (triggers notFound)", async () => {
    fixture.coffee = null;
    const { default: Page } = await import("@/src/app/(public)/coffee/[slug]/page");
    await expect(Page({ params: Promise.resolve({ slug: "public-test-coffee-archived" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("6. EN and AR route/data resolution both work cleanly", async () => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    const enResult = await renderPage(base);
    expect(enResult.container.querySelector("h1")?.textContent).toMatch(/Guji Natural/);
    enResult.unmount();

    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
    const arResult = await renderPage(base);
    expect(arResult.container.querySelector("h1 [lang='ar']")?.textContent).toMatch(/جوجي طبيعية/);
    arResult.unmount();

    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  });

  it("slug normalization defensively handles trailing slash, URI encoding, whitespace and casing", async () => {
    const { normalizeSlug } = await import("@/lib/public/coffees");
    expect(normalizeSlug("public-test-coffee-published/")).toBe("public-test-coffee-published");
    expect(normalizeSlug("public-test-coffee-published///")).toBe("public-test-coffee-published");
    expect(normalizeSlug("  public-test-coffee-published  ")).toBe("public-test-coffee-published");
    expect(normalizeSlug("Public-Test-Coffee-Published")).toBe("public-test-coffee-published");
    expect(normalizeSlug("public-test-coffee-published%2F")).toBe("public-test-coffee-published");
  });
});

