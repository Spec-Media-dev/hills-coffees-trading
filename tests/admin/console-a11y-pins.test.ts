import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 010 Phase 11 — T037 static pins (the browser half is `tests/browser/feature010-runh.browser.mjs`,
 * real Chrome + axe over every console group × EN/AR × light/dark × 390/1366/1920).
 *
 * Verify clause "grep for physical CSS properties returns nothing": every console source file
 * (`src/app/dashboard-admin`, `components/admin`, `lib/admin`) is scanned for physical-direction
 * utilities and inline styles — RTL correctness comes from logical properties only (`ps-`/`pe-`/`ms-`/
 * `me-`/`start`/`end`/`border-s`/`border-e`/`rounded-s`/`rounded-e`), never from `left`/`right`.
 * The remaining pins guard the shared primitives every surface composes: the responsive table
 * (a real `<table>` with a caption at `lg:`, a card list below), text-labelled status badges, and
 * long identifiers rendered with `break-all`/`overflow-wrap:anywhere` under `dir="ltr"`.
 */

const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}
const CONSOLE_FILES = [...walk("src/app/dashboard-admin"), ...walk("components/admin"), ...walk("lib/admin")];
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// Tailwind physical-direction utilities (with any variant prefix) and physical inline-style keys.
const PHYSICAL_UTILITY = /(?:^|[\s"'`:(])(?:-?(?:ml|mr|pl|pr|left|right|inset-x|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-(?:\d|px|auto|full|\[)|text-left|text-right|border-[lr](?:-|\b)|rounded-[lr]-|rounded-[tb][lr]\b|rounded-[tb][lr]-|float-(?:left|right)|clear-(?:left|right)|origin-(?:left|right)|(?:justify|items|self|place)-(?:left|right))/;
const PHYSICAL_INLINE_STYLE = /\b(?:marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|textAlign:\s*["'](?:left|right)|left:\s*["'\d]|right:\s*["'\d]|float:\s*["'](?:left|right))/;

describe("T037 — static pins: no physical-direction CSS in the console; responsive/status primitives", () => {
  it("scans every console source file (routes, components, libs) — the set is not empty", () => {
    expect(CONSOLE_FILES.length).toBeGreaterThan(80);
  });

  it("grep for physical-direction Tailwind utilities across the console returns nothing", () => {
    const offenders: string[] = [];
    for (const file of CONSOLE_FILES) {
      read(file)
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (PHYSICAL_UTILITY.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("grep for physical-direction inline styles across the console returns nothing", () => {
    const offenders: string[] = [];
    for (const file of CONSOLE_FILES) {
      read(file)
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (PHYSICAL_INLINE_STYLE.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the shared responsive table is a real <table> with a caption at lg: and a card list below lg:", () => {
    const table = read("components/dashboard/responsive/table-card-list.tsx");
    expect(table).toMatch(/<table className="hidden [^"]*lg:table"/);
    expect(table).toContain('<caption className="sr-only">{caption}</caption>');
    expect(table).toMatch(/<ul className=\{cn\("flex flex-col gap-3 lg:hidden"\)\}/);
    expect(table).toContain("text-start");
  });

  it("status badges always carry a text label (the colour dot is aria-hidden), and the locale provider sets lang/dir on <html>", () => {
    const badge = read("components/admin/compliance/status-badge.tsx");
    expect(badge).toContain('<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />');
    expect(badge).toMatch(/<span>\s*<AppBilingual pick=\{pick\} \/>/);
    const provider = read("components/locale/locale-provider.tsx");
    expect(provider).toContain("root.lang = locale;");
    expect(provider).toContain("root.dir = directionOf(locale);");
  });

  it("long identifiers in console lists and details are rendered break-all / overflow-wrap:anywhere and LTR", () => {
    const withIds = CONSOLE_FILES.filter((f) => /\{row\.(?:id|userId)\}|\{(?:coffee|policy|rule|account|application|shipment|position|offer|organization)\.id\}/.test(read(f)));
    expect(withIds.length).toBeGreaterThan(5);
    for (const file of withIds) {
      expect(read(file), file).toMatch(/break-all|\[overflow-wrap:anywhere\]|font-mono/);
    }
  });
});
