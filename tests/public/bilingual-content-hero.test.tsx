import { readFileSync } from "node:fs";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalizedContent } from "@/components/locale/bilingual";
import type { PublicCoffeeSummary } from "@/lib/public/coffees";

/**
 * Hardening run — (1) bilingual catalogue content on the public site and (2) the hero's
 * background-film interaction model (hover on fine pointers, explicit toggle for touch/keyboard,
 * reduced motion honoured).
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
    const withImage = render(<ul><CoffeeCard coffee={{ ...base, image: { url: "https://x.supabase.co/storage/v1/object/public/public-assets/catalogue/c/1.webp" } }} /></ul>);
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

describe("Hero background film — interaction semantics", () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reduced.value = false;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  });

  async function renderHero() {
    const { LocaleProvider } = await import("@/components/locale/locale-provider");
    const { HeroBackdrop, HeroFilmToggle, HeroStage } = await import("@/components/public/hero-bean-media");
    return render(
      <LocaleProvider>
        <HeroStage className="hero">
          <HeroBackdrop />
          <HeroFilmToggle />
        </HeroStage>
      </LocaleProvider>,
    );
  }

  it("the film is part of the hero background (aria-hidden layer), lazy (preload=none) and never focusable", async () => {
    const { container } = await renderHero();
    const layer = container.querySelector("[data-hero-media]");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.className).toMatch(/absolute inset-0/);
    const video = container.querySelector("video");
    expect(video?.getAttribute("preload")).toBe("none");
    expect(video?.getAttribute("tabindex")).toBe("-1");
  });

  it("a mouse entering the hero plays and enhances; leaving stops (hover-started film is not pinned)", async () => {
    const { container } = await renderHero();
    const stage = container.querySelector("[data-hero-stage]")!;
    await act(async () => {
      fireEvent.pointerEnter(stage, { pointerType: "mouse" });
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(stage.getAttribute("data-hero-active")).toBe("true");
    await act(async () => {
      fireEvent.pointerLeave(stage, { pointerType: "mouse" });
    });
    expect(pause).toHaveBeenCalled();
    expect(stage.getAttribute("data-hero-active")).toBe("false");
  });

  it("a TOUCH pointer never autoplays; the explicit toggle plays and pauses (reversible, keyboard-reachable button)", async () => {
    const { container } = await renderHero();
    const stage = container.querySelector("[data-hero-stage]")!;
    await act(async () => {
      fireEvent.pointerEnter(stage, { pointerType: "touch" });
    });
    expect(play).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("data-hero-film-toggle")).toBe("paused");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute("data-hero-film-toggle")).toBe("playing");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(pause).toHaveBeenCalled();
    expect(toggle.getAttribute("data-hero-film-toggle")).toBe("paused");
  });

  it("prefers-reduced-motion: hover never plays or zooms; only an explicit toggle press can start the film", async () => {
    reduced.value = true;
    const { container } = await renderHero();
    const stage = container.querySelector("[data-hero-stage]")!;
    await act(async () => {
      fireEvent.pointerEnter(stage, { pointerType: "mouse" });
    });
    expect(play).not.toHaveBeenCalled();
    expect(container.querySelector("[data-hero-media] > div")?.className).toContain("scale-100");
  });

  it("the hero renders the film as background, not as a separate card column", () => {
    const hero = readFileSync("components/public/hero.tsx", "utf8");
    expect(hero).toContain("<HeroBackdrop />");
    expect(hero).not.toContain("<HeroBeanMedia");
    expect(hero).not.toMatch(/lg:grid-cols-\[minmax\(0,0\.92fr\)/);
  });
});
