import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { SettingsFoundationShell } from "@/src/app/dashboard/settings/settings-foundation-shell";

const projectRoot = process.cwd();
const globalsPath = path.join(projectRoot, "src/app/globals.css");
const pagePath = path.join(projectRoot, "src/app/dashboard/settings/page.tsx");
const shellPath = path.join(
  projectRoot,
  "src/app/dashboard/settings/settings-foundation-shell.tsx"
);
const fontsCssPath = path.join(
  projectRoot,
  "src/app/dashboard/settings/hills-fonts.module.css"
);

const globalsSource = readFileSync(globalsPath, "utf8");
const fontsCssSource = readFileSync(fontsCssPath, "utf8");
const existingTokenNames = [
  "--accent",
  "--accent-foreground",
  "--background",
  "--border",
  "--card",
  "--card-foreground",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--destructive",
  "--foreground",
  "--input",
  "--muted",
  "--muted-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--radius",
  "--ring",
  "--secondary",
  "--secondary-foreground",
  "--sidebar",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
].sort();

function themeBlock(selector: ":root" | ".dark") {
  const escapedSelector = selector.replace(".", "\\.");
  const match = globalsSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));

  if (!match?.[1]) {
    throw new Error(`Missing ${selector} token block`);
  }

  return match[1];
}

function tokenMap(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim().toLowerCase(),
    ])
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
});

describe("Hills design tokens and RTL proof", () => {
  it("maps the existing shadcn token contract to the approved Hills light and dark palettes", () => {
    const rootTokens = tokenMap(themeBlock(":root"));
    const darkTokens = tokenMap(themeBlock(".dark"));

    expect(Object.keys(rootTokens).sort()).toEqual(existingTokenNames);
    expect(Object.keys(darkTokens).sort()).toEqual(
      existingTokenNames.filter((name) => name !== "--radius")
    );
    expect(rootTokens).toMatchObject({
      "--background": "#eee4d1",
      "--foreground": "#173c32",
      "--card": "#ffffff",
      "--primary": "#173c32",
      "--primary-foreground": "#f7f1e6",
      "--accent": "#ce8a39",
      "--border": "#d7c8ad",
      "--ring": "#173c32",
      "--radius": "0.875rem",
    });
    expect(darkTokens).toMatchObject({
      "--background": "#1a2420",
      "--foreground": "#eee8dc",
      "--card": "#1e2c26",
      "--primary": "#2a5c3e",
      "--accent": "#c8893a",
      "--border": "#2e3e38",
      "--ring": "#e8a84e",
    });
    expect(globalsSource).not.toMatch(/oklch\(/);

    for (const [name, value] of Object.entries(rootTokens)) {
      document.documentElement.style.setProperty(name, value);
    }

    render(
      <SettingsFoundationShell title="Profile settings" description="Foundation proof">
        <Button>Save changes</Button>
      </SettingsFoundationShell>
    );

    const surface = screen.getByTestId("hills-settings-proof");
    const card = screen.getByTestId("hills-settings-card");
    const button = screen.getByRole("button", { name: "Save changes" });

    expect(getComputedStyle(surface).getPropertyValue("--primary").trim()).toBe("#173c32");
    expect(card.className).toContain("bg-card");
    expect(button.className).toContain("bg-primary");
  });

  it("scopes the supplied Benito and Manrope font files to the settings proof", () => {
    const pageSource = readFileSync(pagePath, "utf8");

    expect(fontsCssSource).toContain('font-family: "Hills Benito"');
    expect(fontsCssSource).toContain('font-family: "Hills Manrope"');
    expect(pageSource).toContain("SettingsFoundationShell");
    expect(readFileSync(path.join(projectRoot, "src/app/layout.tsx"), "utf8")).not.toContain(
      "Hills Manrope"
    );

    for (const font of [
      "Benito-Regular.ttf",
      "Benito-Bold.ttf",
      "Manrope-Regular.ttf",
      "Manrope-SemiBold.ttf",
    ]) {
      expect(
        statSync(path.join(projectRoot, "docs/claude-design/assets/fonts", font)).size
      ).toBeGreaterThan(0);
    }

    render(
      <SettingsFoundationShell title="Profile settings" description="Foundation proof">
        <span>Scoped font proof</span>
      </SettingsFoundationShell>
    );

    expect(getComputedStyle(screen.getByTestId("hills-settings-proof")).fontFamily).toContain(
      "Hills Manrope"
    );
    expect(getComputedStyle(screen.getByRole("heading", { level: 1 })).fontFamily).toContain(
      "Hills Benito"
    );
  });

  it("keeps long RTL content wrappable and free of physical-direction utilities", () => {
    const longDescription =
      "This deliberately long translation-length placeholder verifies that member settings content can wrap safely when the reading direction changes without clipping important account information or actions.";
    const source = `${readFileSync(pagePath, "utf8")}\n${readFileSync(shellPath, "utf8")}`;

    render(
      <SettingsFoundationShell dir="rtl" title="Profile settings" description={longDescription}>
        <Button>Save changes</Button>
      </SettingsFoundationShell>
    );

    const surface = screen.getByTestId("hills-settings-proof");
    const description = screen.getByTestId("hills-settings-description");

    expect(surface.dir).toBe("rtl");
    expect(surface.className).toContain("text-start");
    expect(description.className).toContain("break-words");
    expect(description.className).toContain("text-start");
    expect(getComputedStyle(description).overflowWrap).toBe("anywhere");
    expect(description.textContent).toBe(longDescription);
    expect(source).not.toMatch(/text-left|text-right|(?:^|\s)pl-|(?:^|\s)pr-/m);
  });

  it("introduces no animation that could ignore reduced-motion preferences", () => {
    const phaseSevenPresentation = `${readFileSync(shellPath, "utf8")}\n${fontsCssSource}`;

    expect(phaseSevenPresentation).not.toMatch(/animate-|transition-|animation\s*:|motion\//);
  });
});
