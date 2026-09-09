/**
 * The single English public copy dictionary (Feature 002, T000).
 *
 * SERVER-SAFE BY CONSTRUCTION — see `specs/002-public-website/contracts/public-copy-architecture.md`:
 *
 *   - no `"use client"` directive
 *   - no `react` import
 *   - no `i18next` import
 *
 * That neutrality is the whole point. A Server Component can import this module without being pulled
 * across the client boundary (which would defeat FR-020), and a Client Component imports the *same*
 * module — so there is exactly one copy source and no possibility of drift.
 *
 * Feature 001's i18next initialisation (`lib/i18n/config.ts`) stays exactly where it is: client-side,
 * provided once from the root layout. This feature adds NO second initialisation, NO second i18n
 * library, and NO duplicate dictionary. When a later feature introduces locale switching it feeds
 * i18next's `en.translation` namespace *from this module* rather than retyping the strings.
 *
 * English-first. RTL-ready: no value contains a directional word or baked-in punctuation direction —
 * direction is a CSS concern handled with logical properties (FR-018). No locale routing, no locale
 * switcher.
 *
 * WHAT BELONGS HERE: headings, body copy, CTA labels, navigation labels, form labels, error and
 * state messages, empty-state text, the skip-link label, accessible names.
 *
 * WHAT DOES NOT: route paths, cache tags, HTML ids, `data-*` attributes, test ids, class names,
 * header names and enum-like keys. The test is *"would a translator or a content owner ever change
 * this string?"* If no, it is a technical constant and stays in code (contract §3.7).
 */
export const en = {
  site: {
    name: "Hills Coffee",
    tagline: "Dubai-born green coffee sourcing for the Arab region.",
  },

  /** Accessible names and landmark labels — copy, not technical constants (contract §3.6). */
  a11y: {
    skipToContent: "Skip to main content",
    primaryNavigation: "Primary",
    footerNavigation: "Footer",
    homeLink: "Hills Coffee — home",
  },

  nav: {
    coffee: "Coffee",
    origins: "Origins",
    sourcing: "Sourcing",
    contact: "Contact",
    portalEntry: "Trading Portal",
  },

  cta: {
    requestAnOffer: "Request an offer",
  },

  footer: {
    rights: "All rights reserved.",
  },

  /**
   * Media placeholder copy (T006 / FR-028). No public file-delivery path exists (MEDIA-01), so every
   * media slot renders a labelled placeholder. The wording states the absence honestly rather than
   * implying a failed load.
   */
  media: {
    placeholderLabel: "Photography coming soon",
    placeholderDescription: "Imagery for this item has not been published yet.",
  },

  /**
   * Homepage sections (T012, T013). Every claim here describes the approved Hills operating model —
   * origin sourcing, Hills-approved custody, evidenced quality, reviewed membership. Nothing asserts
   * a figure, a location or a certification the business has not evidenced (design-guidance rule #4).
   * B2B throughout: no retail-cafe or roasted-coffee language.
   */
  home: {
    hero: {
      eyebrow: "Green coffee sourcing and trading",
      headline: "Green coffee, sourced at origin and held in Dubai.",
      lead:
        "Hills Coffee sources green coffee from producing regions and holds it under Hills-approved custody. Roasters, importers and distributors across the Arab region contract with us for supply they can trace back to where it grew.",
      exploreAction: "Explore coffee",
    },
    intents: {
      eyebrow: "Start here",
      title: "Three ways to work with us",
      source: {
        title: "Source coffee",
        body:
          "Tell us the profile, volume and delivery point you need. We go to the producing regions and come back with what we can supply.",
        action: "Send a sourcing request",
      },
      explore: {
        title: "Explore available coffee",
        body:
          "Browse the coffees Hills publishes, each with its origin, processing method, packaging and certifications.",
        action: "See the coffee",
      },
      trade: {
        title: "Trade with Hills",
        body:
          "Approved members buy, hold and resell through the Hills Trading Portal. Membership is reviewed before any trading is enabled.",
        action: "About membership",
      },
    },
    credibility: {
      eyebrow: "How we work",
      title: "Supply you can account for",
      lead:
        "Green coffee is a commitment of capital months before it reaches a roaster. These are the parts of that commitment we take responsibility for.",
      origin: {
        title: "Direct origin relationships",
        body:
          "We buy from producing regions we know and keep the link between a coffee and where it grew.",
      },
      quality: {
        title: "Documented quality",
        body:
          "Certifications and quality evidence travel with the coffee. We publish only what we can evidence and are authorised to disclose.",
      },
      custody: {
        title: "Custody through to transfer",
        body:
          "Coffee stays under Hills-approved custody until title transfers to the buyer, so responsibility is never ambiguous.",
      },
      membership: {
        title: "Reviewed membership",
        body:
          "Every trading account is reviewed and approved before it can transact. Registration alone never authorises trading.",
      },
    },
    featuredCoffee: {
      eyebrow: "Coffee",
      title: "What we are carrying",
      lead: "A selection of the coffees Hills currently publishes.",
      action: "See all coffee",
      empty: "No coffees are published right now.",
    },
    featuredOrigins: {
      eyebrow: "Origins",
      title: "Where it comes from",
      lead: "The producing regions behind the coffees we carry.",
      action: "See all origins",
      empty: "No origins are published right now.",
    },
    rfq: {
      title: "Tell us what you need",
      lead:
        "Send the coffee, volume, timing and delivery point you are working with. A member of the commercial team picks it up from there.",
    },
  },

  /** Public coffee catalogue (T014, T015). */
  coffee: {
    index: {
      eyebrow: "Catalogue",
      title: "Coffee",
      lead:
        "Every coffee Hills currently publishes, with its origin, processing method and packaging. This is a sourcing catalogue, not a live order book.",
      empty:
        "No coffees are published right now. Send us a sourcing request and we will tell you what we can supply.",
      metaTitle: "Coffee",
      metaDescription:
        "Green coffees published by Hills Coffee, with origin, processing method, packaging and certifications for professional buyers.",
    },
    detail: {
      originHeading: "Origin",
      specHeading: "Specification",
      coffeeType: "Coffee type",
      variety: "Variety",
      processingMethod: "Processing method",
      packaging: "Packaging",
      region: "Region",
      country: "Country",
      tagsHeading: "Characteristics",
      certificationsHeading: "Certifications",
      certificationValidUntil: "Valid until",
      traceabilityHeading: "Traceability",
      traceabilityBody:
        "Hills keeps the link between this coffee and the region it grew in. Quality documents and certifications are shared with approved buyers during the commercial conversation, and we publish only what we can evidence.",
      rfqHeading: "Interested in this coffee?",
      rfqLead:
        "Send us the volume, timing and delivery point you need and we will come back with what we can supply.",
      notSpecified: "Not specified",
      backToIndex: "All coffee",
    },
  },

  /** Public origins presentation (T016). */
  origins: {
    index: {
      eyebrow: "Origins",
      title: "Origins",
      lead:
        "The producing regions Hills sources from. Each profile links to the coffees we currently publish from that origin.",
      empty: "No origins are published right now.",
      metaTitle: "Origins",
      metaDescription:
        "Producing regions Hills Coffee sources green coffee from, and the published coffees from each origin.",
    },
    detail: {
      regionLabel: "Region",
      partOfLabel: "Part of",
      coffeesHeading: "Coffee from this origin",
      coffeesEmpty:
        "No coffees from this origin are published right now. Send us a sourcing request and we will tell you what we can supply.",
      backToIndex: "All origins",
    },
  },
} as const;
