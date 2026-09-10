import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { ReferencePrice } from "@/components/public/reference-price";
import { ThemeProvider } from "@/components/theme/theme-provider";

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);
});

afterEach(cleanup);

describe("T043 — unavailable reference price", () => {
  it("renders the honest unavailable state and the mandatory not-an-offer disclosure", () => {
    const { container } = render(
      <ThemeProvider><LocaleProvider><ReferencePrice /></LocaleProvider></ThemeProvider>
    );
    const text = container.textContent ?? "";
    expect(screen.getByText("Reference information")).toBeTruthy();
    expect(text).toMatch(/not published yet/i);
    expect(text).toMatch(/reference information, not an offer/i);
  });

  it("renders no numeric price, source, timestamp, or licence claim", () => {
    const { container } = render(
      <ThemeProvider><LocaleProvider><ReferencePrice state={{ status: "available" }} /></LocaleProvider></ThemeProvider>
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[$€£¥]|\b\d+(?:[,.]\d+)?\b|per\s*(kg|lb)|USD|EUR|AED/i);
    expect(text).not.toMatch(/source:|observed|updated|timestamp|licen[cs]e/i);
    expect(text).toMatch(/not published yet/i);
  });
});
