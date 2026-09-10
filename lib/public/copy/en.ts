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

  /**
   * Names and labels for the shell's interactive controls (Phase 5.5, UIF-016/017/019/021).
   *
   * These are accessible names and visible control labels — copy, not technical constants
   * (contract §3.6). They are the one category of string that also carries approved Arabic in
   * `ar.ts`, because naming a part of the interface asserts nothing about the business.
   */
  controls: {
    themeToggle: "Switch theme",
    switchToDark: "Switch to dark theme",
    switchToLight: "Switch to light theme",
    /** The switcher shows the language you will GET, not the one you are in (design system). */
    languageSwitcher: "التبديل إلى العربية",
    languageSwitcherShort: "AR",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menuTitle: "Menu",
    openSearch: "Search",
    searchTitle: "Search Hills coffee",
    /** States exactly what submitting does today, and stays true once UIF-030 adds filtering. */
    searchHint: "Your search opens the published coffee catalogue.",
    searchPlaceholder: "Search by coffee or origin",
    searchSubmit: "Browse the coffee catalogue",
    close: "Close",
  },

  footer: {
    rights: "All rights reserved.",
    exploreHeading: "Explore",
    accountHeading: "Account",
    commercialHeading: "Trade with Hills",
    brandStatement:
      "Traceable green coffee for roasters, importers and distributors across the Arab region.",
    commercialBody:
      "Share the coffee, volume, timing and delivery point you are working with. Our commercial team will continue the conversation directly.",
    locationLine: "Dubai · Egypt",
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
      imageAlt: "A coffee grower working across raised drying beds at origin.",
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
      imageAlt: "Fresh coffee cherries gathered at origin after harvest.",
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
    /**
     * Framing for the interactive story section (Phase 5.5, UIF-054).
     *
     * The four STORY ITEMS themselves are not defined here — they are the already-approved
     * `home.credibility.{origin,quality,custody,membership}` pillars, rendered image-led and timed
     * instead of as a flat definition list. Only the section's own framing, the per-item alt text and
     * the control labels live here, so the section introduces **no new business claim**.
     */
    story: {
      eyebrow: "How we work",
      title: "Four commitments behind every lot",
      lead:
        "Green coffee is a commitment of capital months before it reaches a roaster. These are the parts of that commitment Hills takes responsibility for.",
      /** Accessible names for the timed selector. Copy, not technical constants (contract §3.6). */
      listLabel: "Our commitments",
      previous: "Previous commitment",
      next: "Next commitment",
      /** `01 / 04` position counter, filled at render. */
      positionLabel: "Item {current} of {total}",
      alt: {
        origin: "A coffee grower selecting ripe cherries by hand at origin.",
        quality: "Green coffee beans being inspected by hand inside a jute sack.",
        custody: "Coffee drying on raised beds under a covered processing area.",
        membership: "Green coffee beans resting in an open jute sack.",
      },
    },

    /**
     * Traceability band (Phase 5.5, UIF-025). The claim is the reviewed one already used on the
     * coffee detail page — it is not restated more strongly here.
     */
    traceability: {
      eyebrow: "Traceability",
      title: "The link back to where it grew",
      imageAlt: "Coffee drying beds spread across a hillside at origin.",
    },

    /**
     * Process / journey section (Phase 5.5, UIF-056). Step BODIES come from the approved
     * `copy.sourcing.*` pillars; only the section framing and the step numerals' label live here.
     * The numerals are rendered as text so they mirror under RTL and translate under `ar`.
     */
    journey: {
      eyebrow: "How Hills works",
      title: "From the producing region to your delivery point",
      lead:
        "Four stages, each one accounted for. Nothing here describes a capability Hills does not operate.",
      stepLabel: "Stage",
    },

    /** Reference information band (Phase 5.5, UIF-025). PRICE-011 governs the value itself. */
    reference: {
      eyebrow: "Reference information",
      title: "Benchmark pricing, kept separate",
      lead:
        "Reference benchmarks are published separately from Hills commercial quotes and from member resale prices. They are never the same number.",
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
    imageAlt: "Green coffee bags held in a warm warehouse setting.",
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
    label: "Reference price",
    unavailableTitle: "Reference pricing is not published yet",
    unavailableBody:
      "This section will show a reference benchmark price once Hills publishes one for this coffee.",
    disclosure: "Reference information, not an offer.",
  },
} as const;
