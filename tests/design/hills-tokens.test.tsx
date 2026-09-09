import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DataTable } from "@/components/app/data-table";
import { StateScreen } from "@/components/layout/state-screen";
import { useGsapTimeline } from "@/components/motion/gsap-timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { STATUS_VALUES, StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { gsap } from "gsap";
import { useRef } from "react";

const projectRoot = process.cwd();
const globalsSource = readFileSync(path.join(projectRoot, "src/app/globals.css"), "utf8");
const layoutSource = readFileSync(path.join(projectRoot, "src/app/layout.tsx"), "utf8");

type AssetMapEntry = { class: string; decision?: string };

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : /\.(?:ts|tsx|css)$/.test(entry.name) ? [entryPath] : [];
  });
}

function sourcesUnder(...directories: string[]) {
  return directories.flatMap((directory) => sourceFiles(path.join(projectRoot, directory))).map((file) => readFileSync(file, "utf8")).join("\n");
}

afterEach(cleanup);

describe("Phase 5.5 UIF-A foundation", () => {
  it("self-hosts only the approved local faces and maps Arabic faces globally", () => {
    const fonts = [
      "Benito-Thin.ttf", "Benito-Light.ttf", "Benito-Regular.ttf", "Benito-Medium.ttf", "Benito-Bold.ttf", "Benito-Black.ttf",
      "Manrope-ExtraLight.ttf", "Manrope-Light.ttf", "Manrope-Regular.ttf", "Manrope-Medium.ttf", "Manrope-SemiBold.ttf", "Manrope-Bold.ttf", "Manrope-ExtraBold.ttf",
    ];
    for (const font of fonts) expect(statSync(path.join(projectRoot, "public/fonts", font)).size).toBeGreaterThan(0);
    expect(readdirSync(path.join(projectRoot, "public/fonts"))).toHaveLength(13);
    expect(layoutSource).toContain("localFont");
    expect(layoutSource).toContain("Readex_Pro");
    expect(layoutSource).toContain("Cairo");
    expect(layoutSource).not.toContain("BigBang");
    expect(sourcesUnder("src", "components")).not.toMatch(/hills-fonts|Hills Benito|Hills Manrope|docs\/claude-design/);
  });

  it("defines the complete type, colour, radius, elevation, motion and layout contracts", () => {
    for (const token of [
      "--text-hero", "--text-h1", "--text-h2", "--text-h3", "--text-dash-title", "--text-body-lg", "--text-body", "--text-small", "--text-meta", "--text-micro",
      "--surface-raised", "--surface-subtle", "--surface-inverse", "--gold-on-light: #75450d", "--gold-on-dark: #e8a84e", "--primary-hover", "--primary-active", "--border-strong", "--border-subtle", "--overlay",
      "--radius-xs: 6px", "--radius-sm: 8px", "--radius-md: 12px", "--radius-lg: 14px", "--radius-xl: 20px", "--radius-2xl: 28px", "--radius-pill", "--radius-arch",
      "--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl", "--shadow-inset", "--shadow-focus",
      "--dur-instant: 100ms", "--dur-fast: 160ms", "--dur-base: 220ms", "--dur-slow: 320ms", "--dur-slowest: 420ms", "--ease-standard", "--ease-out",
      "--container-product: 96rem", "--container-editorial: 80rem", "--container-article: 47.5rem",
    ]) expect(globalsSource.toLowerCase()).toContain(token);
    expect(globalsSource).toMatch(/\[dir="rtl"\][\s\S]*--tracking-display:\s*-0\.005em/);
    expect(globalsSource).toMatch(/\[dir="rtl"\][\s\S]*--lh-body:\s*1\.8/);
    expect(globalsSource).toMatch(/prefers-reduced-motion[\s\S]*--dur-slowest:\s*1ms/);
    expect(globalsSource).toContain("max-inline-size: var(--container-product)");
  });

  it("references every typography scale token from a reusable primitive", () => {
    const productSource = sourcesUnder("src", "components");
    for (const token of [
      "--text-hero", "--text-h1", "--text-h2", "--text-h3", "--text-dash-title",
      "--text-body-lg", "--text-body", "--text-small", "--text-meta", "--text-micro",
    ]) {
      expect(productSource.split(token).length - 1).toBeGreaterThan(1);
    }
  });

  it("uses one product container and removes local CTA forks", () => {
    const productSource = sourcesUnder("src", "components");
    expect(productSource).not.toMatch(/max-w-(?:5xl|6xl|7xl|screen-xl)/);
    expect(productSource).not.toMatch(/CTA_PRIMARY|CTA_SECONDARY|CTA_ON_FOREST|CTA_OUTLINE_ON_FOREST/);
  });

  it("renders the 44px-default button and all six variants", () => {
    const variants = ["primary", "secondary", "outline", "text", "accent", "destructive"] as const;
    for (const variant of variants) {
      const mounted = render(<Button variant={variant}>{variant}</Button>);
      const button = screen.getByRole("button", { name: variant });
      expect(button.className).toContain("h-11");
      expect(button.className).toContain("font-semibold");
      expect(button.className).toContain("tracking-[0.005em]");
      mounted.unmount();
    }
  });

  it("keeps the 36/44/52px visual size scale with a 44px minimum hit target", () => {
    const small = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button", { name: "Small" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Small" }).className).toContain("after:-inset-y-1");
    small.unmount();
    const medium = render(<Button>Medium</Button>);
    expect(screen.getByRole("button", { name: "Medium" }).className).toContain("h-11");
    medium.unmount();
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button", { name: "Large" }).className).toContain("h-[3.25rem]");
  });

  it("wires Field hint and error accessibility to its control", () => {
    render(<Field label="Lot reference" hint="Use the document reference" error="Reference is required" control={<Input />} />);
    const input = screen.getByLabelText("Lot reference");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => document.getElementById(id))).toBe(true);
  });

  it("keeps the status vocabulary closed and renders dot plus label", () => {
    expect(STATUS_VALUES).toHaveLength(23);
    expect(STATUS_VALUES).toContain("Quoted / Awaiting confirmation");
    expect(STATUS_VALUES).toContain("Suspended / Expired");
    render(<StatusBadge status="Paid" />);
    expect(screen.getByText("Paid").previousElementSibling?.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks only directional icons for RTL mirroring", () => {
    const mounted = render(<Icon name="chevron-right" data-testid="icon" />);
    expect(screen.getByTestId("icon").getAttribute("data-directional-icon")).toBe("true");
    mounted.rerender(<Icon name="clock" data-testid="icon" />);
    expect(screen.getByTestId("icon").hasAttribute("data-directional-icon")).toBe(false);
    const iconModule = path.join(projectRoot, "components", "ui", "icon.tsx");
    expect(sourceFiles(path.join(projectRoot, "components")).filter((file) => file !== iconModule).filter((file) => readFileSync(file, "utf8").includes("lucide-react"))).toEqual([]);
  });

  it("contains no physical inline-direction utilities or emoji in product code", () => {
    const productSource = sourcesUnder("src", "components");
    expect(productSource).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-(?:\d|px|auto)\b/);
    expect(productSource).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("supports tab arrow, Home and End keyboard navigation", async () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const overview = screen.getByRole("tab", { name: "Overview" });
    const documents = screen.getByRole("tab", { name: "Documents" });
    const history = screen.getByRole("tab", { name: "History" });
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(documents));
    fireEvent.keyDown(documents, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(history));
    fireEvent.keyDown(history, { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(overview));
  });

  it("renders table rows from props and honest empty state", () => {
    const columns = [{ id: "name", header: "Name", cell: (row: { id: string; name: string }) => row.name }];
    const mounted = render(<DataTable rows={[]} columns={columns} getRowKey={(row) => row.id} emptyState={<p>No records</p>} />);
    expect(screen.getByText("No records")).toBeTruthy();
    expect(screen.queryByRole("row")).toBeNull();
    mounted.rerender(<DataTable rows={[{ id: "1", name: "Verified row" }]} columns={columns} getRowKey={(row) => row.id} emptyState={<p>No records</p>} />);
    expect(screen.getAllByText("Verified row")).toHaveLength(2);
    const dataTableSource = readFileSync(path.join(projectRoot, "components/app/data-table.tsx"), "utf8");
    expect(dataTableSource).toContain("md:hidden");
    expect(dataTableSource).toContain("hidden overflow-hidden");
    expect(dataTableSource).not.toContain("overflow-x-auto");
  });

  it("renders every foundation state without fabricated records", () => {
    for (const kind of ["loading", "empty", "error", "unavailable", "retry", "not-found", "blocked", "unauthorized", "suspended"] as const) {
      const mounted = render(<StateScreen kind={kind} />);
      expect(document.querySelector(`[data-state-screen="${kind}"]`)).not.toBeNull();
      mounted.unmount();
    }
  });

  it("closes a trapped dialog with Escape and restores trigger focus", async () => {
    render(
      <Dialog>
        <DialogTrigger render={<Button />}>Open dialog</DialogTrigger>
        <DialogContent><DialogTitle>Proof dialog</DialogTitle><Input aria-label="Inside dialog" /></DialogContent>
      </Dialog>
    );
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("uses an inline-end drawer contract", async () => {
    document.documentElement.dir = "rtl";
    render(
      <Sheet>
        <SheetTrigger render={<Button />}>Open drawer</SheetTrigger>
        <SheetContent><SheetTitle>Proof drawer</SheetTitle></SheetContent>
      </Sheet>
    );
    const trigger = screen.getByRole("button", { name: "Open drawer" });
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog");
    expect(drawer.getAttribute("data-side")).toBe("inline-end");
    expect(drawer.className).toContain("data-[side=inline-end]:end-0");
    expect(drawer.className).toContain("rtl:data-[side=inline-end]:data-starting-style:-translate-x-10");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    document.documentElement.removeAttribute("dir");
  });

  it("keeps behavioural T033 and T034 unchecked with reconciliation", () => {
    const tasks = readFileSync(path.join(projectRoot, "specs/002-public-website/tasks.md"), "utf8");
    expect(tasks).toMatch(/- \[ \] T033 /);
    expect(tasks).toMatch(/- \[ \] T034 /);
    expect(tasks).toContain("Reconciliation with tasks in this file");
  });

  it("maps every root and feature asset with no unclassified entry", () => {
    const map = JSON.parse(readFileSync(path.join(projectRoot, "specs/002-public-website/ASSET-MAP.json"), "utf8"));
    expect(map.rootAssets).toHaveLength(26);
    expect(map.featureAssets).toHaveLength(34);
    expect([...map.rootAssets, ...map.featureAssets].every((asset: AssetMapEntry) => asset.class && asset.class !== "unclassified")).toBe(true);
    expect(map.featureAssets.filter((asset: AssetMapEntry) => asset.class === "re-crop-required").every((asset: AssetMapEntry) => asset.decision === "unused")).toBe(true);
  });

  it("scopes GSAP timelines and restores global count on unmount", () => {
    function Proof() {
      const scope = useRef<HTMLDivElement>(null);
      useGsapTimeline(scope, (timeline, element) => timeline.to(element, { clipPath: "inset(0%)" }));
      return <div ref={scope}>Timeline proof</div>;
    }
    const before = gsap.globalTimeline.getChildren().length;
    const mounted = render(<Proof />);
    expect(gsap.globalTimeline.getChildren().length).toBeGreaterThanOrEqual(before);
    mounted.unmount();
    expect(gsap.globalTimeline.getChildren().length).toBe(before);
    expect(sourcesUnder("src", "components")).not.toMatch(/\blenis\b/i);
  });
});
