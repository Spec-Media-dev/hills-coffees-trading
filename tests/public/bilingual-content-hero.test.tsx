import { readFileSync } from "node:fs";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalizedContent } from "@/components/locale/bilingual";
import type { PublicCoffeeSummary } from "@/lib/public/coffees";

/**
 * Hardening runs — (1) bilingual catalogue content on the public site and (2) the hero's background
 * film: muted looping autoplay with NO visible control, poster when autoplay is blocked, and the
 * static poster only under reduced motion.
 */
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("motion/react", () => ({ useReducedMotion: () => reduced.value }));

afterEach(cleanup);

describe("LocalizedContent — Arabic when present, English (marked lang=en dir=ltr) otherwise", () => {
  it("renders both languages as CSS-picked spans with correct lang/dir", () => {
    const { container } = render(<LocalizedContent en="Yirgacheffe" ar="يرغاتشيفي" />);
    const en = container.querySelector(".hc-lang-en");
    const ar = container.querySelector(".hc-lang-ar");
    expect(en?.getAttribute("lang")).toBe("en");
    expect(en?.getAttribute("dir")).toBe("ltr");
    expect(en?.textContent).toBe("Yirgacheffe");
    expect(ar?.getAttribute("lang")).toBe("ar");
    expect(ar?.getAttribute("dir")).toBe("rtl");
    expect(ar?.textContent).toBe("يرغاتشيفي");
  });

  it("missing Arabic → the English value ONCE, marked as English (never shown as if it were Arabic)", () => {
    const { container } = render(<LocalizedContent en="Washed" ar={null} />);
    expect(container.querySelectorAll("span")).toHaveLength(1);
    expect(container.querySelector("span")?.getAttribute("lang")).toBe("en");
    expect(container.querySelector("span")?.getAttribute("dir")).toBe("ltr");
    expect(container.querySelector(".hc-lang-ar")).toBeNull();
  });

  it("CSS hides the inactive language by the <html lang> attribute", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(':root:not([lang="ar"]) .hc-lang-ar { display: none; }');
    expect(css).toContain('[lang="ar"] .hc-lang-en { display: none; }');
  });
});

describe("CoffeeCard — primary image + localized fields", () => {
  const base: PublicCoffeeSummary = {
    name: "Sidamo Natural",
    nameAr: "سيدامو طبيعية",
    slug: "sidamo-natural",
    description: "Fruit-forward.",
    descriptionAr: null,
    origin: { name: "Sidamo", nameAr: "سيدامو", slug: "sidamo", countryCode: "ET", region: null },
    coffeeType: { name: "Arabica", nameAr: "أرابيكا", slug: "arabica" },
    processingMethod: { name: "Natural", nameAr: null, slug: "natural" },
    image: null,
  };

  it("uses the coffee's own image when present, the placeholder otherwise — same 4:3 box", async () => {
    const { CoffeeCard } = await import("@/components/public/coffee-card");
    const withImage = render(<ul><CoffeeCard coffee={{ ...base, image: { url: "https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/1.webp", isPrimary: true } }} /></ul>);
    expect(withImage.container.querySelector("[data-coffee-image] img")).not.toBeNull();
    withImage.unmount();
    const without = render(<ul><CoffeeCard coffee={base} /></ul>);
    expect(without.container.querySelector("[data-coffee-image]")).toBeNull();
  });

  it("renders Arabic name/origin/type, and English (marked) where Arabic is missing", async () => {
    const { CoffeeCard } = await import("@/components/public/coffee-card");
    const { container } = render(<ul><CoffeeCard coffee={base} /></ul>);
    expect([...container.querySelectorAll('[lang="ar"]')].map((node) => node.textContent)).toEqual(expect.arrayContaining(["سيدامو طبيعية", "سيدامو", "أرابيكا"]));
    const englishFallbacks = [...container.querySelectorAll('span[lang="en"][dir="ltr"]:not(.hc-lang-en)')].map((node) => node.textContent);
    expect(englishFallbacks).toEqual(expect.arrayContaining(["Fruit-forward.", "Natural"]));
  });
});

describe("Hero background film — ambient autoplay, no visible control (pre-Stripe hardening run)", () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reduced.value = false;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  });

  async function renderBackdrop() {
    const { LocaleProvider } = await import("@/components/locale/locale-provider");
    const { HeroBackdrop } = await import("@/components/public/hero-bean-media");
    return render(
      <LocaleProvider>
        <section>
          <HeroBackdrop />
        </section>
      </LocaleProvider>,
    );
  }

  it("the film is a muted, looping, inline, autoplaying background layer — aria-hidden, never focusable", async () => {
    const { container } = await renderBackdrop();
    const layer = container.querySelector("[data-hero-media]");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.className).toMatch(/absolute inset-0/);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect(video.getAttribute("tabindex")).toBe("-1");
    // started from the effect, after `muted` was set as a property
    expect(play).toHaveBeenCalled();
  });

  it("there is NO visible playback control anywhere in the hero", async () => {
    const { container } = await renderBackdrop();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    const hero = readFileSync("components/public/hero.tsx", "utf8");
    expect(hero).not.toMatch(/HeroFilmToggle|playHeroFilm|pauseHeroFilm/);
    expect(readFileSync("lib/public/copy/en.ts", "utf8")).not.toMatch(/Pause the green coffee film/);
  });

  it("a blocked autoplay keeps the poster (the film only fades in on the `playing` event)", async () => {
    play.mockRejectedValue(new Error("NotAllowedError"));
    const { container } = await renderBackdrop();
    const video = container.querySelector("video")!;
    expect(video.className).toContain("opacity-0");
    expect(container.querySelector("[data-hero-media] img")?.className).toContain("opacity-100");
  });

  it("prefers-reduced-motion: no film element at all — the static poster only", async () => {
    reduced.value = true;
    const { container } = await renderBackdrop();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("[data-hero-media] img")).not.toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it("the hero renders the film as background, not as a separate card column", () => {
    const hero = readFileSync("components/public/hero.tsx", "utf8");
    expect(hero).toContain("<HeroBackdrop />");
    expect(hero).not.toMatch(/lg:grid-cols-\[minmax\(0,0\.92fr\)/);
  });
});
