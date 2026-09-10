// @vitest-environment node

import { existsSync } from "node:fs";

import type { Metadata } from "next";
import { beforeAll, describe, expect, it, vi } from "vitest";

const metadataReads = vi.hoisted(() => ({
  coffee: vi.fn(),
  origin: vi.fn(),
}));

vi.mock("@/lib/public/coffees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public/coffees")>()),
  getPublicCoffeeBySlug: metadataReads.coffee,
}));

vi.mock("@/lib/public/origins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public/origins")>()),
  getPublicOriginBySlug: metadataReads.origin,
}));

import { metadata as homeMetadata } from "@/src/app/page";
import { generateMetadata as coffeeIndexMetadata } from "@/src/app/(public)/coffee/page";
import { generateMetadata as coffeeDetailMetadata } from "@/src/app/(public)/coffee/[slug]/page";
import { generateMetadata as originsIndexMetadata } from "@/src/app/(public)/origins/page";
import { generateMetadata as originDetailMetadata } from "@/src/app/(public)/origins/[slug]/page";
import { generateMetadata as sourcingMetadata } from "@/src/app/(public)/sourcing/page";
import { generateMetadata as contactMetadata } from "@/src/app/(public)/contact/page";
import { generateMetadata as portalEntryMetadata } from "@/src/app/(public)/portal-entry/page";
import { CATALOGUE_SLUGS, loadPublicTestEnvironment } from "@/tests/public/fixture-catalogue";

beforeAll(async () => {
  loadPublicTestEnvironment();
  const coffees = await vi.importActual<typeof import("@/lib/public/coffees")>("@/lib/public/coffees");
  const origins = await vi.importActual<typeof import("@/lib/public/origins")>("@/lib/public/origins");
  metadataReads.coffee.mockResolvedValue(await coffees.__fetchCoffeeDetailUncached(CATALOGUE_SLUGS.coffeePublished));
  metadataReads.origin.mockResolvedValue(await origins.__fetchOriginDetailUncached(CATALOGUE_SLUGS.originActive));
});

function titleText(title: unknown): string {
  return typeof title === "string" ? title : "";
}

function canonicalText(metadata: Metadata): string {
  return String(metadata.alternates?.canonical ?? "");
}

function assertOwnedRouteMetadata(route: string, metadata: Metadata) {
  const title = titleText(metadata.title);
  const description = String(metadata.description ?? "");
  const canonical = canonicalText(metadata);
  expect(title, `${route} title`).not.toBe("");
  expect(description, `${route} description`).not.toBe("");
  expect(canonical, `${route} canonical`).toMatch(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  expect(String(metadata.openGraph?.title ?? ""), `${route} Open Graph title`).toBe(title);
  expect(String(metadata.openGraph?.description ?? ""), `${route} Open Graph description`).toBe(description);
  expect(String(metadata.openGraph?.url ?? ""), `${route} Open Graph URL`).toBe(canonical);
}

describe("T038 — metadata coverage for every owned public route", () => {
  it("emits title, description, trailing-slash canonical, and matching Open Graph metadata on all eight routes", async () => {
    const routes = [
      ["/", homeMetadata],
      ["/coffee/", await coffeeIndexMetadata()],
      ["/coffee/public-test-coffee-published/", await coffeeDetailMetadata({ params: Promise.resolve({ slug: CATALOGUE_SLUGS.coffeePublished }) })],
      ["/origins/", await originsIndexMetadata()],
      ["/origins/public-test-origin-active/", await originDetailMetadata({ params: Promise.resolve({ slug: CATALOGUE_SLUGS.originActive }) })],
      ["/sourcing/", await sourcingMetadata()],
      ["/contact/", await contactMetadata()],
      ["/portal-entry/", await portalEntryMetadata()],
    ] as const;

    for (const [route, metadata] of routes) assertOwnedRouteMetadata(route, metadata);
  });

  it("documents knowledge and legal routes as intentionally unavailable rather than creating placeholders", () => {
    for (const unavailablePath of ["src/app/(public)/knowledge/page.tsx", "src/app/(public)/legal/page.tsx"]) {
      expect(existsSync(unavailablePath), `${unavailablePath} must remain unavailable until its owning feature`).toBe(false);
    }
  });
});
