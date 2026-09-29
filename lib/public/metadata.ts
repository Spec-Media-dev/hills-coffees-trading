import type { Metadata } from "next";
import { siteOrigin } from "@/lib/public/site";

/**
 * Root metadata contract (Feature 014 Sprint 2 / contracts/seo-metadata.md §1).
 * Exported separately from layout.tsx so it can be verified in Vitest without
 * triggering Next.js localFont loader transforms.
 */
export const rootMetadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "Hills Coffee — Dubai B2B Green Coffee Sourcing & Custody",
    template: "%s | Hills Coffee",
  },
  description:
    "Premier B2B green coffee sourcing, physical custody, storage, and private authorized trading platform based in Dubai, serving the Arab region.",
  applicationName: "Hills Coffee",
  authors: [{ name: "Hills Coffee Trading LLC", url: siteOrigin() }],
  creator: "Hills Coffee Trading LLC",
  publisher: "Hills Coffee Trading LLC",
  keywords: [
    "green coffee Dubai",
    "specialty coffee sourcing",
    "B2B green coffee",
    "coffee custody UAE",
    "coffee trading Dubai",
  ],
  openGraph: {
    type: "website",
    locale: "en_AE",
    url: "/",
    siteName: "Hills Coffee",
    title: "Hills Coffee — Dubai B2B Green Coffee Sourcing & Custody",
    description:
      "Premier B2B green coffee sourcing, physical custody, and trading platform based in Dubai.",
    images: [
      {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Hills Coffee Trading — Dubai",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hills Coffee — Dubai B2B Green Coffee Sourcing & Custody",
    description:
      "Premier B2B green coffee sourcing, physical custody, and trading platform based in Dubai.",
    images: ["/images/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};
