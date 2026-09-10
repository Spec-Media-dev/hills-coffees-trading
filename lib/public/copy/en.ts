/**
 * The single English public copy dictionary (Feature 002, T000).
 *
 * SERVER-SAFE BY CONSTRUCTION — see `specs/002-public-website/contracts/public-copy-architecture.md`:
 *
 *   - no client-boundary directive
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
    about: "About us",
    contact: "Contact",
    portalEntry: "Trading Portal",
  },

  /**
   * Desktop flyout panels (public convergence pass). Each panel names its primary destination,
   * describes it in one sentence and lists related public routes that already exist. No panel
   * introduces a destination, a capability or a claim that is not already on the site.
   */
  megaMenu: {
    coffee: {
      title: "Published coffee",
      body: "Every coffee Hills currently publishes, with its origin, processing method and packaging.",
      primary: "Browse the catalogue",
    },
    origins: {
      title: "Producing regions",
      body: "The regions Hills sources from, each linked to the coffees published from it.",
      primary: "See the origins",
    },
    sourcing: {
      title: "How we source and hold coffee",
      body: "Origin relationships, custody, logistics and quality documentation, in plain terms.",
      primary: "Read how we work",
    },
    about: {
      title: "Hills Coffee",
      body: "A Dubai-born green coffee sourcing and trading business serving the Arab region.",
      primary: "About Hills",
    },
    relatedHeading: "Also see",
  },

  cta: {
    requestAnOffer: "Request an offer",
    exploreAllCoffee: "Explore all coffee",
  },

  /**
   * Names and labels for the shell's interactive controls (Phase 5.5, UIF-016/017/019/021).
   *
   * These are accessible names and visible control labels — copy, not technical constants
   * (contract §3.6). They are the one category of string that also carries approved Arabic in
   * `ar.ts`, because naming a part of the interface asserts nothing about the business.
   */
  controls: {
    switchToDark: "Switch to dark theme",
    switchToLight: "Switch to light theme",
    /** The switcher shows the language you will GET, not the one you are in (design system). */
    languageSwitcher: "التبديل إلى العربية",
    languageSwitcherShort: "AR",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menuTitle: "Menu",
    openSearch: "Search",
    /** Visible label inside the desktop search field trigger. */
    searchFieldLabel: "Search coffee or origin",
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
    companyHeading: "Company",
    accountHeading: "Account",
    commercialHeading: "Trade with Hills",
    /** The closing brand line — sentence, not slogan; it restates the positioning already approved. */
    closingLine: "Green coffee, sourced at origin and held in Dubai.",
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
      /** The landscape hero photograph (desktop). Documentary alt, no origin or farm is named. */
      landscapeAlt: "A grower picking ripe coffee cherries on a hillside above a mountain valley.",
      scrollCue: "Scroll",
    },
    intents: {
      eyebrow: "Start here",
      title: "Three ways to work with us",
      lead: "Each path leads somewhere different. Pick the one that matches what you need today.",
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
     * The interactive story section (Phase 5.5, UIF-054; re-authored by the public convergence pass).
     *
     * The four items now follow the coffee's own lifecycle — cherry, drying, inspection, green coffee —
     * so that every title and body describes exactly what its photograph shows. Each body is grounded
     * in a claim already approved elsewhere in this dictionary (origin link, published processing
     * method, reviewed quality evidence, Hills-approved custody) and adds nothing beyond it. No
     * variety, origin, farm or grade is named: the images are documentary, not record media.
     */
    story: {
      eyebrow: "From cherry to green coffee",
      title: "What happens before a lot is published",
      lead:
        "Four moments on the way from the tree to a coffee Hills can publish. Each one is where a piece of the coffee's record is made.",
      /** Accessible names for the timed selector. Copy, not technical constants (contract §3.6). */
      listLabel: "Stages of the coffee",
      previous: "Previous stage",
      next: "Next stage",
      /** `01 / 04` position counter, filled at render. */
      positionLabel: "Stage {current} of {total}",
      items: {
        cherry: {
          title: "Cherries picked at origin",
          body:
            "Ripe cherries are selected by hand in the producing regions Hills buys from. The link between a coffee and where it grew starts here.",
          alt: "A grower selecting ripe red coffee cherries by hand on the branch.",
        },
        drying: {
          title: "Drying and processing",
          body:
            "Cherries are processed and dried at origin. The processing method travels with the coffee into its published profile.",
          alt: "Coffee drying on long raised beds under a covered processing area at origin.",
        },
        inspection: {
          title: "Sorting and inspection",
          body:
            "Green coffee is inspected before it is published. Certifications and quality evidence are reviewed, and shared with approved buyers.",
          alt: "A hand inspecting green coffee beans inside an open jute sack.",
        },
        green: {
          title: "Green coffee, ready to source",
          body:
            "Prepared green coffee moves into Hills-approved custody and stays there until title transfers to the buyer.",
          alt: "Green coffee beans spilling from an open jute sack onto a wooden surface.",
        },
      },
    },

    /**
     * Static coffee showcase (public convergence pass). The homepage does NOT preview live catalogue
     * rows here — until record photography exists (MEDIA-01) a database fixture would read as a
     * placeholder, not a product. Instead this section shows the three things every published coffee
     * carries, which is exactly the approved `intents.explore.body` sentence made visual. Editorial
     * photography only; nothing here is presented as inventory, availability or a specific record.
     */
    showcase: {
      eyebrow: "Coffee",
      title: "What every published coffee carries",
      lead:
        "Hills publishes a coffee only with the record behind it. The catalogue is a sourcing reference, not a live order book.",
      origin: {
        title: "Origin and region",
        body: "Where the coffee grew, linked to a published origin profile.",
      },
      process: {
        title: "Processing method and variety",
        body: "How the cherry became green coffee, and what was planted.",
      },
      packaging: {
        title: "Packaging and certifications",
        body: "How it ships, and the documents that travel with it.",
      },
      action: "See all coffee",
      alt: {
        origin: "A harvest basket of coffee cherries with misty hills behind it.",
        process: "Green and dried coffee laid out in rows on a wooden bench, with fields beyond.",
        packaging: "A jute sack, green coffee and fresh cherries on a stone ledge in warm light.",
      },
    },

    /**
     * Continuous coffee strip (public convergence pass). Captions name only what each documentary
     * photograph shows; no coffee, origin, farm, grade or availability is implied.
     */
    marquee: {
      eyebrow: "At origin",
      title: "Coffee, the way we see it before it is a lot",
      trackLabel: "Photographs from origin",
      captions: {
        cherries: "Cherries on the branch",
        basket: "The harvest basket",
        ripening: "Ripening cherries",
        sorting: "Sorting green coffee",
        sackCherries: "Green coffee and cherries",
        beds: "Raised drying beds",
        grower: "A grower at origin",
        hands: "Picking by hand",
      },
    },

    /**
     * Traceability band (Phase 5.5, UIF-025). The claim is the reviewed one already used on the
     * coffee detail page — it is not restated more strongly here.
     */
    /**
     * Traceability chain (Phase 5.5, UIF-025; rebuilt as a grid by the public convergence pass).
     * The four links are the already-approved `home.credibility.*` pillars, re-framed as the chain of
     * responsibility a lot passes through. The short titles are the only new strings; every body is
     * the reviewed pillar text.
     */
    traceability: {
      eyebrow: "Traceability",
      title: "The link back to where it grew",
      lead:
        "Hills keeps the link between a coffee and its origin unbroken, from the producing region to the buyer who takes title.",
      imageAlt: "Coffee drying on raised beds in warm evening light at origin.",
      chainLabel: "The chain of responsibility",
      links: {
        origin: "Where it grew",
        quality: "What travels with it",
        custody: "Who holds it",
        membership: "Who can trade it",
      },
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
      alt: {
        relationships: "A grower standing among coffee plants with mountains behind.",
        custody: "Stacked jute sacks of green coffee resting on pallets under a high roof.",
        logistics: "Green coffee sacks lined up beneath tall arched windows.",
        quality: "Green coffee spread across a sorting table for inspection.",
      },
    },

    /** Reference information band (Phase 5.5, UIF-025). PRICE-011 governs the value itself. */
    reference: {
      eyebrow: "Reference information",
      title: "Benchmark pricing, kept separate",
      lead:
        "Reference benchmarks are published separately from Hills commercial quotes and from member resale prices. They are never the same number.",
      /** Labels of the static data stage. No figure, source or date exists to show (PRICE-011). */
      stageLabel: "Reference benchmark",
      stageState: "Not published yet",
      stageNote:
        "When Hills publishes a benchmark it will appear here with its source and observation date, and it will still not be an offer.",
    },

    rfq: {
      title: "Tell us what you need",
      lead:
        "Send the coffee, volume, timing and delivery point you are working with. A member of the commercial team picks it up from there.",
      imageAlt: "Ripe coffee cherries on a branch resting beside green coffee on a jute sack.",
    },
  },

  /**
   * About page (public convergence pass). Every sentence restates positioning that is already
   * approved in the SRS and design guidance: Dubai-born, B2B, the Arab region, origin sourcing,
   * Hills-approved custody, reviewed membership. No founding date, headcount, volume, client,
   * certification or partner count is stated, because none is evidenced for this surface.
   */
  about: {
    eyebrow: "About Hills",
    title: "A green coffee business built for the Arab region",
    lead:
      "Hills Coffee sources green coffee from producing regions and holds it under Hills-approved custody in Dubai, for roasters, importers and distributors who want supply they can account for.",
    identity: {
      title: "Dubai-born, origin-focused",
      body:
        "Hills is a Dubai-born business with an operational office in Egypt. We buy from producing regions we know and keep the link between a coffee and where it grew.",
    },
    model: {
      title: "A sourcing partner, not an exchange",
      body:
        "The public website is where the sourcing conversation starts. Trading happens inside the Hills Trading Portal, between members whose accounts have been reviewed and approved.",
    },
    custody: {
      title: "Custody you can point to",
      body:
        "Coffee Hills sources stays under Hills-approved custody until title transfers to the buyer, so responsibility for it is never split or left ambiguous.",
    },
    evidence: {
      title: "Only what we can evidence",
      body:
        "Certifications, quality evidence and origin information are published only when Hills can evidence them and is authorised to disclose them.",
    },
    ctaTitle: "Start a conversation with us",
    ctaLead: "Tell us what you are sourcing and where it needs to arrive.",
    imageAlt: "A grower standing in a hillside coffee plantation beneath cloud-covered mountains.",
    metaTitle: "About Hills",
    metaDescription:
      "Hills Coffee is a Dubai-born green coffee sourcing and trading business serving roasters, importers and distributors across the Arab region.",
  },

  /**
   * Contact page (public convergence pass). An honest static page: it explains what a conversation
   * with Hills covers and where each intent leads. There is NO form here — the request-for-quote
   * form, its validation and its server action are owned by Feature 002 Phase 6 (T019–T022) and are
   * blocked on DB-BLOCK-02 / CRM-DEST-01. No address, phone, email or social handle is invented.
   */
  contact: {
    eyebrow: "Contact",
    title: "Tell us what you need",
    lead:
      "Share the coffee, volume, timing and delivery point you are working with. Our commercial team continues the conversation directly.",
    intentsHeading: "What a conversation covers",
    intents: {
      sourcing: {
        title: "A sourcing request",
        body: "The profile, volume and delivery point you need. We go to the producing regions and come back with what we can supply.",
      },
      coffee: {
        title: "A specific published coffee",
        body: "Any coffee in the catalogue. We share its quality documents and certifications with approved buyers during the conversation.",
        action: "Browse the catalogue",
      },
      membership: {
        title: "Trading membership",
        body: "How reviewed membership works and what the Hills Trading Portal is for.",
        action: "About the Trading Portal",
      },
    },
    rfq: {
      heading: "Send a request",
      lead:
        "Tell us about your business and what you're sourcing. A member of our commercial team reviews every request.",
      fields: {
        companyName: "Company name",
        buyerType: "What best describes your business",
        buyerTypeOptions: {
          roaster: "Roaster",
          importer: "Importer",
          distributor: "Distributor",
          other: "Other",
        },
        selectPlaceholder: "Select an option",
        countryCode: "Country",
        countryPlaceholder: "Select your country",
        estimatedVolumeKg: "Estimated volume (kg)",
        coffeePreference: "Coffee or origin preference",
        timing: "Timing",
        deliveryLocation: "Delivery location",
        incoterm: "Incoterm",
        contactName: "Your name",
        contactEmail: "Email",
        contactPhone: "Phone",
        message: "Anything else we should know?",
        consent: "I agree to be contacted about this request.",
        optional: "optional",
      },
      submit: "Send request",
      submitting: "Sending…",
      unavailable: {
        title: "Online submission isn't live yet",
        body:
          "We couldn't send this automatically. Nothing you entered was lost — please reach us using the details below and we'll pick up the conversation directly.",
      },
      genericError: "Something went wrong. Please try again shortly.",
    },
    detailsHeading: "Where we operate",
    detailsBody:
      "Hills Coffee is a Dubai-born business with an operational office in Egypt. Contact details for this surface are published once they are approved for release.",
    imageAlt: "Green coffee sacks stacked on wooden pallets.",
    metaTitle: "Contact",
    metaDescription:
      "Start a sourcing conversation with Hills Coffee: share the coffee, volume, timing and delivery point you are working with.",
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
      /**
       * In-catalogue filter (Phase 5.5, UIF-030). Every control here operates on the
       * already-fetched public index — there is no warehouse, availability, quantity, grade or
       * seller facet, and none of those fields exists on the DTO to filter by.
       */
      filter: {
        searchLabel: "Search published coffees",
        searchPlaceholder: "Coffee or origin",
        originFacet: "Origin",
        processFacet: "Processing method",
        typeFacet: "Coffee type",
        all: "All",
        clear: "Clear filters",
        /** `{shown}` and `{total}` are filled at render — never a fabricated figure. */
        resultCount: "Showing {shown} of {total} published coffees",
        noResults:
          "No published coffee matches those filters. Clear them to see the full catalogue.",
      },
    },
    detail: {
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
      /** Section framing for the sourcing dossier (Phase 5.5, UIF-028). */
      identityEyebrow: "Published coffee",
      originLinkAction: "See the origin",
      originConnectionHeading: "Where it comes from",
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
      /** Section framing for the place-led origin narrative (Phase 5.5, UIF-029). */
      identityEyebrow: "Producing region",
      countryLabel: "Country",
      exploreCoffee: "Browse all coffee",
    },
    /** Homepage origins showcase (Phase 5.5, UIF-055). */
    showcase: {
      previous: "Previous origins",
      next: "Next origins",
      trackLabel: "Origins",
      progressLabel: "Showcase position",
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

  /** Public route-level not-found state (Phase 5.5, UIF-034). */
  notFound: {
    eyebrow: "Page not found",
    title: "This page is not available.",
    body:
      "The address may be incorrect, or the page may no longer be published. You can return to the homepage or explore the published coffee catalogue.",
    homeAction: "Return home",
    coffeeAction: "Explore coffee",
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
    stageLabel: "Reference information",
    stageState: "Not published",
    stageNote: "Reference information is not available to view yet.",
    disclosure: "Reference information, not an offer.",
  },

  /**
   * Authentication experience (Feature 003, T004–T010). Public, non-indexable routes under
   * `src/app/(auth)/`. No account-existence disclosure lives in this copy — every failure path uses
   * the SAME generic strings regardless of cause (spec FR-002, SC-005).
   */
  auth: {
    signIn: {
      eyebrow: "Trading Portal",
      title: "Sign in",
      lead: "Sign in with your Hills account to continue to your organization's workspace.",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      submitting: "Signing in…",
      forgotPassword: "Forgot your password?",
      genericError: "That email and password combination isn't recognised. Please try again.",
      metaTitle: "Sign in",
    },
    signOutConfirm: {
      title: "Sign out?",
      description: "You'll need to sign in again to access your workspace.",
      cancel: "Cancel",
      confirm: "Sign out",
      confirming: "Signing out…",
    },
    verifyEmail: {
      eyebrow: "One step left",
      title: "Verify your email",
      lead: "We sent a verification link to your email address. Open it to confirm your account before continuing.",
      resend: "Resend verification email",
      resending: "Sending…",
      resent: "Verification email sent — check your inbox.",
      metaTitle: "Verify your email",
      gatedTitle: "Verify your email to continue",
      gatedDescription: "This area requires a verified email address. Check your inbox for the verification link, or request a new one.",
    },
    resetPassword: {
      eyebrow: "Account recovery",
      title: "Reset your password",
      lead: "Enter your account email and we'll send you a link to reset your password.",
      email: "Email",
      submit: "Send reset link",
      submitting: "Sending…",
      acknowledgement:
        "If an account exists for that email address, a password reset link has been sent to it.",
      metaTitle: "Reset password",
      confirmTitle: "Choose a new password",
      confirmLead: "Enter a new password for your account.",
      newPassword: "New password",
      confirmNewPassword: "Confirm new password",
      confirmSubmit: "Save new password",
      confirmSubmitting: "Saving…",
      confirmSuccess: "Your password has been updated. You can sign in with it now.",
      passwordMismatch: "Those passwords don't match.",
      invalidLink: "This reset link is invalid or has expired. Request a new one.",
      metaTitleConfirm: "Choose a new password",
    },
    mfa: {
      challengeEyebrow: "Extra verification",
      challengeTitle: "Enter your authentication code",
      challengeLead: "Open your authenticator app and enter the 6-digit code to finish signing in.",
      code: "Authentication code",
      verify: "Verify",
      verifying: "Verifying…",
      invalidCode: "That code isn't correct. Please try again.",
      metaTitleChallenge: "Verify your identity",
      enrollEyebrow: "Account security",
      enrollTitle: "Set up two-factor authentication",
      enrollLead: "Scan this code with your authenticator app, then enter the 6-digit code it generates to finish enrolling.",
      enrollConfirm: "Confirm and enable",
      enrollConfirming: "Confirming…",
      enrollSuccess: "Two-factor authentication is now enabled on your account.",
      alreadyEnrolled: "Two-factor authentication is already enabled on your account.",
      metaTitleEnroll: "Set up two-factor authentication",
    },
    layout: {
      backToSite: "Back to Hills Coffee",
    },
  },

  /** Public Header account state (Feature 003 — anonymous sign-in link, authenticated account menu). */
  account: {
    signIn: "Sign in",
    menuLabel: "Account menu",
    dashboard: "Dashboard",
    adminConsole: "Operations console",
    signOut: "Log out",
    chooseOrganization: "Choose organization",
  },
} as const;
