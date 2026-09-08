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
} as const;
