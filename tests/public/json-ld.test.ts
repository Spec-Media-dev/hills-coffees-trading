import { describe, expect, it } from "vitest";

import {
  buildBreadcrumbJsonLd,
  buildCoffeeJsonLd,
  buildJsonLdGraph,
  buildOriginJsonLd,
  buildOrganizationJsonLd,
  serializeJsonLd,
} from "@/lib/public/seo";
import type { PublicCoffeeDetail } from "@/lib/public/coffees";
import type { PublicOriginDetail } from "@/lib/public/origins";

const XSS_PAYLOAD = '</script><script>alert(1)</script>';

const COFFEE: PublicCoffeeDetail = {
  name: `Yirgacheffe Reserve ${XSS_PAYLOAD}`,
  slug: "yirgacheffe-reserve",
  description: `A washed lot from the highlands. ${XSS_PAYLOAD}`,
  origin: {
    name: "Yirgacheffe",
    slug: "yirgacheffe",
    countryCode: "ET",
    region: { name: "Gedeo", slug: "gedeo", countryCode: "ET" },
  },
  coffeeType: { name: "Arabica", slug: "arabica" },
  processingMethod: { name: "Washed", slug: "washed" },
  variety: { name: "Heirloom", slug: "heirloom" },
  packagingType: { name: "GrainPro", slug: "grainpro" },
  tags: [{ name: "Specialty", slug: "specialty" }],
  certifications: [{ name: "Organic", expiresAt: "2027-01-01" }],
};

const ORIGIN: PublicOriginDetail = {
  name: `Yirgacheffe ${XSS_PAYLOAD}`,
  slug: "yirgacheffe",
  description: "A renowned coffee-growing district.",
  countryCode: "ET",
  region: { name: "Gedeo", slug: "gedeo", countryCode: "ET" },
  parent: null,
};

/**
 * Feature 002 T024/T025 verification (`FR-007, FR-025, SEC-004, SEC-005`). Narrow, exact-Verify
 * proof: the XSS-breakout case, private-field absence, and one deterministic coffee/origin result —
 * not the full T041 suite (Phase 11).
 */
describe("T024 — JSON-LD safe serialization", () => {
  it("neutralises a </script><script> breakout payload inside catalogue text", () => {
    const graph = buildJsonLdGraph([buildCoffeeJsonLd(COFFEE, "https://example.com/coffee/yirgacheffe-reserve/")]);
    const serialized = serializeJsonLd(graph);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("<"); // every literal `<` is escaped, none survives raw
    expect(serialized).toContain("\\u003c/script>");
    // The payload text itself is preserved as inert data, not discarded.
    expect(serialized).toContain("alert(1)");
  });

  it("neutralises a breakout payload inside an origin name", () => {
    const graph = buildJsonLdGraph([buildOriginJsonLd(ORIGIN, "https://example.com/origins/yirgacheffe/")]);
    const serialized = serializeJsonLd(graph);

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c");
  });

  it("a naive JSON.stringify of the same content WOULD be exploitable — proving the escape is load-bearing", () => {
    const naive = JSON.stringify(buildJsonLdGraph([buildCoffeeJsonLd(COFFEE, "https://example.com/")]));
    expect(naive).toContain("</script>");
  });
});

describe("T024 — JSON-LD data truth", () => {
  it("emits no offer, rating, sku, gtin or brand field", () => {
    const graph = buildJsonLdGraph([buildCoffeeJsonLd(COFFEE, "https://example.com/coffee/yirgacheffe-reserve/")]);
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toMatch(/"offers"|"aggregateRating"|"review"|"sku"|"gtin"|"brand"|"price"/i);
  });

  it("emits no grade, cup score, crop year, quantity, MOQ, availability or seller identity", () => {
    const graph = buildJsonLdGraph([buildCoffeeJsonLd(COFFEE, "https://example.com/coffee/yirgacheffe-reserve/")]);
    const serialized = JSON.stringify(graph).toLowerCase();
    for (const forbidden of ["grade", "cupscore", "cropyear", "quantity", "moq", "availability", "seller"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("T024/T025 — one deterministic coffee result, one deterministic origin result", () => {
  it("builds a valid coffee Product node from the public DTO", () => {
    const node = buildCoffeeJsonLd(COFFEE, "https://example.com/coffee/yirgacheffe-reserve/");
    expect(node["@type"]).toBe("Product");
    expect(node.name).toBe(COFFEE.name);
    expect(node.category).toBe("Arabica");
    expect((node.countryOfOrigin as { name: string }).name).toBe("ET");
  });

  it("builds a valid origin Place node from the public DTO", () => {
    const node = buildOriginJsonLd(ORIGIN, "https://example.com/origins/yirgacheffe/");
    expect(node["@type"]).toBe("Place");
    expect(node.name).toBe(ORIGIN.name);
    expect((node.address as { addressCountry: string }).addressCountry).toBe("ET");
  });

  it("the graph is a valid @graph document with an Organization and a BreadcrumbList", () => {
    const graph = buildJsonLdGraph([
      buildOrganizationJsonLd("Hills Coffee", "Dubai-born green coffee sourcing."),
      buildBreadcrumbJsonLd([{ name: "Home", url: "https://example.com/" }]),
    ]);
    expect(graph["@context"]).toBe("https://schema.org");
    const nodes = graph["@graph"] as Array<Record<string, unknown>>;
    expect(nodes[0]["@type"]).toBe("Organization");
    expect(nodes[1]["@type"]).toBe("BreadcrumbList");
  });

  it("drops undefined fields rather than emitting null/undefined literals", () => {
    const bareCoffee: PublicCoffeeDetail = {
      ...COFFEE,
      description: null,
      variety: null,
      processingMethod: null,
      packagingType: null,
      origin: null,
    };
    const node = buildCoffeeJsonLd(bareCoffee, "https://example.com/coffee/x/");
    const graph = buildJsonLdGraph([node]);
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("undefined");
    expect(serialized).not.toContain('"additionalProperty":null');
  });
});
