import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteError } from "@/components/public/route-error";

afterEach(cleanup);

/**
 * Feature 002 T033 verification — public runtime states (loading, empty, error, unavailable,
 * not-found, retry, blocked sub-flow), reusing `StateScreen`/Feature-001 primitives, with no
 * fabricated "stale" state and no invented data in any blocked-flow message.
 */
describe("T033 — public runtime state coverage", () => {
  it("the (public) route group and the root homepage each have a real error boundary", () => {
    const publicError = readFileSync("src/app/(public)/error.tsx", "utf8");
    const rootError = readFileSync("src/app/error.tsx", "utf8");
    expect(publicError).toContain('"use client"');
    expect(rootError).toContain('"use client"');
    expect(publicError).toMatch(/RouteError/);
    expect(rootError).toMatch(/RouteError/);
  });

  it("the (public) error boundary does not double-wrap PublicShell (the group layout already does)", () => {
    const publicError = readFileSync("src/app/(public)/error.tsx", "utf8");
    expect(publicError).not.toMatch(/<PublicShell/);
  });

  it("the root error boundary DOES wrap PublicShell (no enclosing layout supplies one)", () => {
    const rootError = readFileSync("src/app/error.tsx", "utf8");
    expect(rootError).toMatch(/<PublicShell/);
  });

  it("RouteError never logs the raw error message or stack — digest only", () => {
    const source = readFileSync("components/public/route-error.tsx", "utf8");
    expect(source).not.toMatch(/error\.message|error\.stack/);
    expect(source).toMatch(/error\.digest/);
  });

  it("RouteError renders StateScreen's error state with a real reset()-driven retry, not a fake one", () => {
    const onReset = vi.fn();
    render(<RouteError error={Object.assign(new Error("boom"), { digest: "abc123" })} reset={onReset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("no route-group loading.tsx exists under (public) — it broke notFound() resolution on dynamic detail routes", () => {
    // A loading.tsx was tried here during this run and reverted: with it present, /coffee/[slug]/
    // and /origins/[slug]/ served the loading fallback forever instead of resolving notFound()'s
    // 404 for draft/archived/unknown slugs (confirmed live: status stuck at 200 instead of 404).
    // Documented in IMPLEMENTATION-HANDOFF.md's Phase 10 section as a defect found and reverted.
    expect(() => readFileSync("src/app/(public)/loading.tsx", "utf8")).toThrow();
  });

  it("the coffee and origin indexes render an honest empty state, not a fabricated result", () => {
    for (const file of ["src/app/(public)/coffee/page.tsx", "src/app/(public)/origins/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/\.length > 0/);
      expect(source).not.toMatch(/\$\d|AED|USD/); // no invented figure in the empty branch
    }
  });

  it("coffee/origin detail pages call the real notFound() boundary for non-public/unknown records", () => {
    for (const file of ["src/app/(public)/coffee/[slug]/page.tsx", "src/app/(public)/origins/[slug]/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/notFound\(\)/);
    }
  });

  it("no route or component anywhere in the public tree renders a fabricated \"stale\" state", () => {
    const files = [
      "src/app/(public)/coffee/page.tsx",
      "src/app/(public)/coffee/[slug]/page.tsx",
      "src/app/(public)/origins/page.tsx",
      "src/app/(public)/origins/[slug]/page.tsx",
      "src/app/(public)/contact/page.tsx",
      "src/app/(public)/sourcing/page.tsx",
      "src/app/(public)/portal-entry/page.tsx",
      "src/app/(public)/about/page.tsx",
      "src/app/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not reference a stale state`).not.toMatch(/kind="stale"|"stale"/i);
    }
  });

  it("the RFQ unavailable panel and the reference-price unavailable state are the documented blocked-sub-flow examples, and neither fabricates data", () => {
    const rfqForm = readFileSync("components/public/rfq-form.tsx", "utf8");
    expect(rfqForm).toMatch(/isUnavailable/);
    const referencePrice = readFileSync("components/public/reference-price.tsx", "utf8");
    expect(referencePrice).toMatch(/"unavailable"/);
    expect(referencePrice).not.toMatch(/\$\d|€\d|AED\s*\d|USD\s*\d/);
  });
});
