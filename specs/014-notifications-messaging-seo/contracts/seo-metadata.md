# Interface Contracts: SEO & Structured Data

**Feature**: `014-notifications-messaging-seo` (Sprint 2)  
**Spec**: [spec.md](../spec.md)

---

## 1. Root Metadata Contract (`src/app/layout.tsx`)

```typescript
import type { Metadata } from "next";

export const rootMetadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://hillscoffee.com"),
  title: {
    default: "Hills Coffee — Dubai B2B Green Coffee Sourcing & Custody",
    template: "%s | Hills Coffee",
  },
  description: "Premier B2B green coffee sourcing, physical custody, storage, and private authorized trading platform based in Dubai, serving the Arab region.",
  applicationName: "Hills Coffee",
  authors: [{ name: "Hills Coffee Trading LLC", url: "https://hillscoffee.com" }],
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
    description: "Premier B2B green coffee sourcing, physical custody, and trading platform based in Dubai.",
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
    description: "Premier B2B green coffee sourcing, physical custody, and trading platform based in Dubai.",
    images: ["/images/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

---

## 2. Private Boundary Defense Contract

Every authenticated, internal, or auth layout (`/dashboard/layout.tsx`, `/dashboard-admin/layout.tsx`, `/(auth)/layout.tsx`) must export:

```typescript
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};
```

---

## 3. JSON-LD Structured Data Contracts

### A. Organization Schema (`src/components/seo/json-ld-organization.tsx`)

Rendered on homepage (`/`):

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Hills Coffee Trading",
  "url": "https://hillscoffee.com",
  "logo": "https://hillscoffee.com/images/hills-logo.png",
  "description": "Dubai-born B2B green coffee sourcing, custody, and private trading platform.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Dubai",
    "addressCountry": "AE"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "availableLanguage": ["English", "Arabic"]
  }
}
```

### B. Product Schema (`src/components/seo/json-ld-coffee.tsx`)

Rendered on public coffee detail page (`/coffee/[slug]/`):

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Ethiopia Yirgacheffe G1 Washed",
  "description": "Grade 1 washed heirloom Arabica coffee from Yirgacheffe, Ethiopia.",
  "category": "Green Coffee",
  "brand": {
    "@type": "Brand",
    "name": "Hills Coffee"
  },
  "offers": {
    "@type": "Offer",
    "availability": "https://schema.org/InStock",
    "priceCurrency": "USD",
    "url": "https://hillscoffee.com/coffee/ethiopia-yirgacheffe/"
  }
}
```
*Note: Public unauthenticated product schemas provide descriptive specification details without exposing member-executable prices or confidential seller settlement splits.*
