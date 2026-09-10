/**
 * Renders one safely-serialized JSON-LD `@graph` document into an inline `<script>` tag
 * (Feature 002 T025). Server Component — structured data is emitted server-side, never hydrated,
 * and this component performs no query of its own: callers pass an already-built graph from
 * `lib/public/seo.ts`'s builders, fed by the SAME DTO the visible page renders.
 *
 * The `<script>` content comes ONLY from `serializeJsonLd`'s escaped output — never a raw
 * `JSON.stringify()` call — so a value containing `</script>` cannot break out of this tag.
 */
export function JsonLd({ json }: { json: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
