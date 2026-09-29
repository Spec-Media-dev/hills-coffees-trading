import { serializeJsonLd } from "@/lib/public/seo";
import { siteOrigin } from "@/lib/public/site";

/**
 * Valid schema.org Organization and WebSite structured data for Hills Coffee Trading.
 * Safe against XSS through Unicode-escaped serializeJsonLd.
 */
export function JsonLdOrganization() {
  const origin = siteOrigin();
  const orgData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Hills Coffee Trading",
    url: origin,
    logo: `${origin}/images/hills-logo-dark.png`,
    description: "Dubai-born B2B green coffee sourcing, custody, and private trading platform.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Dubai",
      addressCountry: "AE",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      availableLanguage: ["English", "Arabic"],
    },
  };

  const webSiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Hills Coffee Trading",
    url: origin,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(webSiteData) }}
      />
    </>
  );
}
