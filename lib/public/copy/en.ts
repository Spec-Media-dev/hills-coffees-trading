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

  /**
   * Sourcing page (T017). Content-driven, not data-driven: every claim here is 002-owned reviewed
   * copy, never derived from a database row — and in particular never from the private storage-
   * location table denylisted in the public DTO allowlist contract (SEO-APP-02). Wording is
   * deliberately consistent with the homepage credibility section rather than introducing new
   * unverified claims.
   */
  sourcing: {
    eyebrow: "Sourcing",
    title: "How we source and hold coffee",
    lead:
      "Green coffee sourcing is a chain of decisions made months before a bag reaches a roaster. This is how Hills makes them.",
    relationships: {
      title: "Origin relationships",
      body:
        "We work directly with the producing regions we source from, so the coffee we publish carries a real, traceable link back to where it grew.",
    },
    custody: {
      title: "Custody",
      body:
        "Coffee Hills sources moves into Hills-approved custody and stays there until title transfers to the buyer. Responsibility for the coffee is never split or left ambiguous.",
    },
    logistics: {
      title: "Logistics",
      body:
        "Delivery moves through logistics arrangements Hills has approved, keeping supply accounted for between origin and the buyer's chosen delivery point.",
    },
    quality: {
      title: "Quality documentation",
      body:
        "Certifications and quality evidence are collected and reviewed before a coffee is published, and shared with approved buyers as part of the commercial conversation.",
    },
    cta: {
      title: "Talk to us about a coffee",
      lead:
        "If you want to go further into any of this for a specific coffee, we are glad to have that conversation.",
    },
    images: {
      harvestAlt: "Ripe coffee cherries on the branch at origin.",
      qualityAlt: "Green coffee being inspected by hand for quality.",
    },
    metaTitle: "Sourcing",
    metaDescription:
      "How Hills Coffee sources green coffee at origin and holds it under approved custody for professional buyers across the Arab region.",
  },

  /** Trading Portal entry placeholder (T018) — honest until Feature 003 owns the real destination. */
  portalEntry: {
    eyebrow: "Trading Portal",
    title: "Membership is not open here yet",
    lead:
      "The Hills Trading Portal is where approved members buy, hold and resell green coffee. Sign-in and membership applications are not open on the public site yet.",
    body:
      "That capability is being built as its own feature. Until it is ready, if you want to talk through sourcing or start a commercial conversation, reach out directly and a member of the team will pick it up from there.",
    action: "Request an offer",
    metaTitle: "Trading Portal",
    metaDescription:
      "The Hills Trading Portal entry point. Membership and sign-in are not yet open on the public site.",
  },

  /**
   * Reference-price presentation (T023). Feature 002 implements only the unavailable state — see
   * `contracts/reference-price-presentation.md`. The disclosure line is the mandatory wording that
   * distinguishes reference information from a Hills offer or member listing price (SRS §9).
   */
  referencePrice: {
    unavailableTitle: "Reference pricing is not published yet",
    unavailableBody:
      "This section will show a reference benchmark price once Hills publishes one for this coffee.",
    disclosure: "Reference information, not an offer.",
  },
} as const;
