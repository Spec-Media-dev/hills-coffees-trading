import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ReferencePrice } from "@/components/public/reference-price";

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

afterEach(cleanup);

describe("Phase 5.5 UIF-E public story boundaries", () => {
  it("keeps sourcing content-only, on the article measure, and limited to audited editorial imagery", () => {
    const page = source("src", "app", "(public)", "sourcing", "page.tsx");
    expect(page).not.toMatch(/warehouses/);
    expect(page).toContain("max-w-[62ch]");
    expect(page).toContain('src="/images/coffee-cherry.jpg"');
    expect(page).toContain('src="/images/cupping-lab.jpg"');
    expect(source("specs", "002-public-website", "ASSET-MAP.json")).toContain('"sourcing-quality"');
  });

  it("keeps portal entry an honest, contact-led transition owned by Feature 003", () => {
    const page = source("src", "app", "(public)", "portal-entry", "page.tsx");
    expect(page).toContain("Feature 003 owns the real membership/sign-in destination");
    expect(page).toContain("PUBLIC_ROUTES.contact");
    expect(page).not.toMatch(/<form|<input|signIn|signUp|createClient|getRequestIdentity/);
  });

  it("renders reference pricing only as an honest unavailable state", () => {
    render(<ReferencePrice />);
    const rendered = document.body.textContent ?? "";
    expect(screen.getByText("Reference information, not an offer.")).toBeTruthy();
    expect(rendered).toContain("Reference pricing is not published yet");
    expect(rendered).not.toMatch(/\d/);
    expect(rendered).not.toMatch(/source|timestamp|licen[cs]e|conversion/i);
    const component = source("components", "public", "reference-price.tsx");
    expect(component).not.toMatch(/price_sources|price_observations|price_differentials/);
  });

  it("adds a branded root not-found boundary without changing catalogue status semantics", () => {
    const notFound = source("src", "app", "not-found.tsx");
    expect(notFound).toContain("PublicShell");
    expect(notFound).toContain("c.notFound");
    expect(notFound).toContain("<h1");
    const coffeeDetail = source("src", "app", "(public)", "coffee", "[slug]", "page.tsx");
    const originDetail = source("src", "app", "(public)", "origins", "[slug]", "page.tsx");
    expect(coffeeDetail).toContain("notFound()");
    expect(originDetail).toContain("notFound()");
  });
});
