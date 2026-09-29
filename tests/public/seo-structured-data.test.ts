import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { rootMetadata } from "@/lib/public/metadata";
import { JsonLdOrganization } from "@/components/seo/json-ld-organization";
import { buildCoffeeJsonLd } from "@/lib/public/seo";
import { STATIC_ROUTES } from "@/src/app/sitemap";
import { canonicalUrl, siteOrigin } from "@/lib/public/site";
import type { PublicCoffeeDetail } from "@/lib/public/coffees";

describe("T021 — Root Metadata Verification", () => {
  it("layout.tsx wires rootMetadata to metadata export", () => {
    const layoutSrc = readFileSync("src/app/layout.tsx", "utf8");
    expect(layoutSrc).toContain("rootMetadata");
    expect(layoutSrc).toMatch(/export\s+const\s+metadata:\s*Metadata\s*=\s*rootMetadata/);
  });

  it("exports metadataBase pointing to valid site origin", () => {
    expect(rootMetadata.metadataBase).toBeDefined();
    expect(rootMetadata.metadataBase?.toString()).toBe(`${siteOrigin()}/`);
  });

  it("configures brand title template and truthful description", () => {
    expect(rootMetadata.title).toEqual({
      default: "Hills Coffee — Dubai B2B Green Coffee Sourcing & Custody",
      template: "%s | Hills Coffee",
    });
    expect(rootMetadata.description).toContain("Dubai");
    expect(rootMetadata.description).toContain("green coffee");
  });

  it("configures OpenGraph and Twitter cards with og-default.jpg", () => {
    const og = rootMetadata.openGraph as Record<string, unknown> | undefined;
    expect(og).toBeDefined();
    expect(og?.type).toBe("website");
    expect(og?.images).toEqual([
      expect.objectContaining({
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
      }),
    ]);

    const twitter = rootMetadata.twitter as Record<string, unknown> | undefined;
    expect(twitter).toBeDefined();
    expect(twitter?.card).toBe("summary_large_image");
    expect(twitter?.images).toEqual(["/images/og-default.jpg"]);
  });

  it("allows indexing on root layout", () => {
    expect(rootMetadata.robots).toEqual(
      expect.objectContaining({
        index: true,
        follow: true,
      })
    );
  });
});

describe("T021 — JSON-LD Structured Data Schema Validation", () => {
  it("renders valid schema.org Organization and WebSite for homepage", () => {
    const rendered = JsonLdOrganization();
    expect(rendered).toBeDefined();
    const scripts = rendered.props.children;
    expect(scripts).toBeDefined();
    
    // Validate each script tag contains valid JSON-LD
    for (const script of Array.isArray(scripts) ? scripts : [scripts]) {
      const jsonString = script.props.dangerouslySetInnerHTML.__html;
      const parsed = JSON.parse(jsonString);
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(["Organization", "WebSite"]).toContain(parsed["@type"]);

      if (parsed["@type"] === "Organization") {
        expect(parsed.name).toBe("Hills Coffee Trading");
        expect(parsed.address).toBeDefined();
        expect(parsed.address["@type"]).toBe("PostalAddress");
        expect(parsed.address.addressLocality).toBe("Dubai");
        expect(parsed.address.addressCountry).toBe("AE");
        expect(parsed.contactPoint).toBeDefined();
        expect(parsed.contactPoint["@type"]).toBe("ContactPoint");
      }

      if (parsed["@type"] === "WebSite") {
        expect(parsed.name).toBe("Hills Coffee Trading");
        expect(parsed.url).toBe(siteOrigin());
      }
    }
  });

  it("renders valid schema.org Product for coffee detail without leaking private pricing", () => {
    const mockCoffee: PublicCoffeeDetail = {
      slug: "ethiopia-yirgacheffe",
      name: "Ethiopia Yirgacheffe G1 Washed",
      nameAr: null,
      description: "Grade 1 washed heirloom Arabica coffee from Yirgacheffe, Ethiopia.",
      descriptionAr: null,
      origin: { name: "Ethiopia", nameAr: null, slug: "ethiopia", countryCode: "ET", region: { name: "Yirgacheffe", nameAr: null, slug: "yirgacheffe", countryCode: "ET" } },
      variety: { name: "Heirloom", nameAr: null, slug: "heirloom" },
      processingMethod: { name: "Washed", nameAr: null, slug: "washed" },
      packagingType: { name: "GrainPro 60kg", nameAr: null, slug: "grainpro" },
      coffeeType: { name: "Arabica", nameAr: null, slug: "arabica" },
      image: null,
      images: [],
      tags: [],
      certifications: [],
    };

    const parsed = buildCoffeeJsonLd(mockCoffee, canonicalUrl(`/coffee/${mockCoffee.slug}/`));
    expect(parsed["@type"]).toBe("Product");
    expect(parsed.name).toBe("Ethiopia Yirgacheffe G1 Washed");
    expect(parsed.countryOfOrigin).toEqual({ "@type": "Country", name: "ET" });
    expect(parsed.additionalProperty).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Variety", value: "Heirloom" }),
      expect.objectContaining({ name: "Processing method", value: "Washed" }),
    ]));

    // Public catalogue has no executable offer, availability, or seller data.
    expect(parsed.offers).toBeUndefined();
    expect(parsed.availability).toBeUndefined();
    expect(parsed.seller).toBeUndefined();
    expect(parsed.price).toBeUndefined();
  });
});

describe("T021 — Canonical & Hreflang Boundary Validation", () => {
  it("guarantees no invented /en/ or /ar/ paths exist in sitemap or static routes", () => {
    for (const route of STATIC_ROUTES) {
      expect(route).not.toMatch(/^\/(en|ar)(\/|$)/);
      expect(route).not.toMatch(/\/(en|ar)\//);
    }
  });

  it("guarantees all canonical URLs use trailing slash format", () => {
    for (const route of STATIC_ROUTES) {
      const canonical = canonicalUrl(route);
      expect(canonical.endsWith("/")).toBe(true);
      expect(canonical).not.toMatch(/\/(en|ar)\//);
    }
  });

  it("verifies all private and internal layouts enforce noindex and nofollow", () => {
    const privateFiles = [
      "src/app/dashboard/layout.tsx",
      "src/app/dashboard-admin/layout.tsx",
      "src/app/(auth)/layout.tsx",
      "src/app/admin/layout.tsx",
      "src/app/foundation-status/page.tsx",
    ];

    for (const file of privateFiles) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must enforce noindex and nofollow`).toMatch(
        /robots:\s*{\s*index:\s*false,\s*follow:\s*false\s*}/
      );
    }
  });
});
