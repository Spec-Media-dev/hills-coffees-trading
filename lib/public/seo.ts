import type { PublicCoffeeDetail } from "@/lib/public/coffees";
import type { PublicOriginDetail } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Structured-data (JSON-LD) builders and safe serialization (Feature 002 T024 —
 * `contracts/rfq-contract.md` is unrelated; governed by FR-007, FR-025, SEC-004, SEC-005).
 *
 * ============================================================================
 * SECURITY — THIS IS AN XSS SINK, TREATED AS ONE
 * ============================================================================
 *
 * Every value below can originate from catalogue text an editor typed (`coffee.name`,
 * `coffee.description`, …) and is about to be written into an inline `<script>` tag via
 * `dangerouslySetInnerHTML` (`components/public/json-ld.tsx`). A naive `JSON.stringify()` does NOT
 * make that safe: a description containing `</script><script>alert(1)</script>` would close the
 * JSON-LD script element and open a new, executable one. `serializeJsonLd` below escapes every `<`
 * (which covers `</script>`, `<!--` and any other tag-opening sequence) to its Unicode escape before
 * the string is ever written to markup, so the payload can only ever be inert JSON string data —
 * never markup. **Never replace this with a bare `JSON.stringify()` call.**
 *
 * ============================================================================
 * DATA TRUTH — SAME SOURCE AS THE VISIBLE PAGE, NO HIDDEN CLAIMS
 * ============================================================================
 *
 * Every builder below takes the SAME `PublicCoffeeDetail`/`PublicOriginDetail` DTOs the page itself
 * renders (`lib/public/coffees.ts`, `lib/public/origins.ts`) — no separate/hidden SEO query. It
 * therefore inherits that DTO boundary's guarantees for free: no grade, cup score, crop year,
 * quantity, MOQ, availability, seller/owner identity, warehouse location, price or offer field ever
 * reaches this module, because none of those fields exists on the DTO to read.
 *
 * **Deliberately NOT emitted, even though the historical aspirational SEO reference material
 * describes them**: `Product.offers` (no public price/offer exists — emitting `Offer` without one
 * would be exactly the public/private offer leakage Feature 002 exists to prevent), `aggregateRating`
 * / `review` (no review system exists), `sku`/`gtin`/`brand` (no product-identity data exists; "Hills
 * Coffee" is the source, not a manufacturer brand claim), and per-record `image` (MEDIA-01 — no
 * approved media asset exists to reference). A schema type or property with no truthful, currently
 * implemented data behind it is never emitted merely to make the structured data look richer.
 */

export type BreadcrumbItem = { name: string; url: string };

type JsonLdNode = Record<string, unknown>;

/** The Hills Coffee organisation entity — name, description and URL only (contract §2 site copy). */
export function buildOrganizationJsonLd(siteName: string, tagline: string): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": `${canonicalUrl("/")}#organization`,
    name: siteName,
    description: tagline,
    url: canonicalUrl("/"),
  };
}

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** A generic indexable page entity (homepage, sourcing, contact, …). */
export function buildWebPageJsonLd(params: {
  name: string;
  description: string;
  url: string;
  isCollection?: boolean;
}): JsonLdNode {
  return {
    "@type": params.isCollection ? "CollectionPage" : "WebPage",
    name: params.name,
    description: params.description,
    url: params.url,
  };
}

/**
 * A published coffee, described as a `Product` with no commercial claim: no `offers`, no
 * `aggregateRating`, no `sku`/`gtin`/`brand` — only the discovery facts the public DTO carries.
 */
export function buildCoffeeJsonLd(coffee: PublicCoffeeDetail, url: string): JsonLdNode {
  const additionalProperty: JsonLdNode[] = [];
  if (coffee.variety) {
    additionalProperty.push({ "@type": "PropertyValue", name: "Variety", value: coffee.variety.name });
  }
  if (coffee.processingMethod) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Processing method",
      value: coffee.processingMethod.name,
    });
  }
  if (coffee.packagingType) {
    additionalProperty.push({
      "@type": "PropertyValue",
      name: "Packaging",
      value: coffee.packagingType.name,
    });
  }

  return {
    "@type": "Product",
    name: coffee.name,
    description: coffee.description ?? undefined,
    url,
    category: coffee.coffeeType?.name,
    countryOfOrigin: coffee.origin?.countryCode
      ? { "@type": "Country", name: coffee.origin.countryCode }
      : undefined,
    additionalProperty: additionalProperty.length > 0 ? additionalProperty : undefined,
  };
}

/** An active origin, described as a `Place` — purely geographic/editorial, no commercial claim. */
export function buildOriginJsonLd(origin: PublicOriginDetail, url: string): JsonLdNode {
  return {
    "@type": "Place",
    name: origin.name,
    description: origin.description ?? undefined,
    url,
    address: origin.countryCode ? { "@type": "PostalAddress", addressCountry: origin.countryCode } : undefined,
    containedInPlace: origin.region
      ? { "@type": "AdministrativeArea", name: origin.region.name }
      : origin.parent
        ? { "@type": "Place", name: origin.parent.name }
        : undefined,
  };
}

/**
 * Assembles a `@graph` document from one or more nodes, dropping every `undefined` value (Product/
 * Place fields above are conditionally present, and JSON-LD consumers should never see a literal
 * `"key": null`/`"key": undefined`).
 */
export function buildJsonLdGraph(nodes: readonly JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes.map(stripUndefined) };
}

function stripUndefined(node: JsonLdNode): JsonLdNode {
  const result: JsonLdNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined) continue;
    result[key] =
      Array.isArray(value)
        ? value.map((item) => (item && typeof item === "object" ? stripUndefined(item as JsonLdNode) : item))
        : value && typeof value === "object" && !Array.isArray(value)
          ? stripUndefined(value as JsonLdNode)
          : value;
  }
  return result;
}

/**
 * Serializes a JSON-LD document for safe inline placement inside `<script type="application/ld+json">`
 * via `dangerouslySetInnerHTML`. Escapes every `<` to its Unicode form — this alone is sufficient to
 * neutralise `</script>`, `<script>`, `<!--` and any other tag-opening sequence a catalogue value
 * might contain, because none of them can begin without a literal `<`.
 */
export function serializeJsonLd(document: JsonLdNode): string {
  return JSON.stringify(document).replace(/</g, "\\u003c");
}
