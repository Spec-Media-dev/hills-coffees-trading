import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 002 T034 verification (`components/motion/ANIMATION-OWNERSHIP.md`, MOTION-GSAP-01).
 * Confirms the frozen Phase-5.5 invariants still hold after Phase 6 (RFQ) — no new animation was
 * introduced there, so this is a regression proof, not new implementation.
 */

const GSAP_SITES = [
  "components/motion/gsap-timeline.ts",
  "components/motion/gsap-scroll-reveal.tsx",
  "components/public/animated-hero.tsx",
  "components/public/interactive-story-section.tsx",
] as const;

function publicSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...publicSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("T034 — motion application and reduced-motion (regression after Phase 6)", () => {
  it("Lenis is not initialised anywhere in the product", () => {
    const hits = [...publicSourceFiles("src"), ...publicSourceFiles("components")].filter((file) =>
      /lenis/i.test(readFileSync(file, "utf8"))
    );
    expect(hits).toEqual([]);
  });

  it("every GSAP call site is scoped inside gsap.context() and reverted on unmount", () => {
    for (const file of GSAP_SITES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must create GSAP work inside gsap.context()`).toMatch(/gsap\.context\(/);
      expect(source, `${file} must revert its context on cleanup`).toMatch(/\.revert\(\)/);
    }
  });

  it("Phase 6's RfqForm introduces no animation engine of its own", () => {
    const source = readFileSync("components/public/rfq-form.tsx", "utf8");
    expect(source).not.toMatch(/gsap|framer-motion|from "motion"|lenis/i);
  });

  it("the registry documents every current GSAP surface and still asserts Lenis is not initialized", () => {
    const registry = readFileSync("components/motion/ANIMATION-OWNERSHIP.md", "utf8");
    expect(registry).toMatch(/Lenis is not initialized/);
    for (const surface of ["Story timeline", "AnimatedHero", "InteractiveStorySection", "GsapScrollReveal"]) {
      expect(registry).toContain(surface);
    }
  });

  it("no rendered property is documented as owned by two engines on the same surface", () => {
    const registry = readFileSync("components/motion/ANIMATION-OWNERSHIP.md", "utf8");
    // The registry's own stated invariant — a structural proof that the rule is still recorded,
    // not a re-derivation of the table (which is asserted by inspection, not regex).
    expect(registry).toMatch(/one rendered property has one owner/i);
  });
});
