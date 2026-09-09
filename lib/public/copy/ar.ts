/**
 * The Arabic sibling of the public copy dictionary (Phase 5.5, UIF-017 — plan §8; `CONTENT-AR-01`).
 *
 * SERVER-SAFE BY CONSTRUCTION, exactly like `en.ts`: no client directive, no `react` import, no
 * `i18next` import. This is a *sibling of the same module*, not a second dictionary system — the
 * shape is derived from `en` and checked by the compiler, so a key that does not exist in English
 * cannot be invented here.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE HONESTY RULE THAT GOVERNS THIS FILE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Phase 5.5 owns the EN/العربية **infrastructure**. It does NOT own approved Arabic **content**.
 * Marketing, commercial, legal and compliance copy is owned by Content/Legal and has not been
 * supplied (`CONTENT-AR-01`).
 *
 * So this file translates exactly one category of string:
 *
 *   ✔ INTERFACE CHROME — navigation labels, control names, landmark names, generic actions, menu and
 *     search labels. These name a part of the interface. Translating "Coffee" as the label of the
 *     coffee catalogue link asserts nothing about the business.
 *
 * and deliberately omits every other category:
 *
 *   ✘ BUSINESS AND MARKETING CLAIMS — headlines, leads, credibility copy, sourcing and custody
 *     descriptions, traceability wording, portal-entry explanations, price disclosures, page
 *     descriptions. Translating these would be *writing new Arabic commercial claims* that no
 *     reviewer has approved. Every one of these keys is therefore ABSENT here and resolves to the
 *     reviewed English through `getCopy()`.
 *
 * Untranslated is a **content** gap, never a **layout** gap: an Arabic viewer still gets a correct
 * RTL layout with Arabic typography, which is precisely what stops a future Arabic redesign.
 *
 * TO ADD APPROVED ARABIC LATER: add the key here once Content/Legal has approved the wording, and
 * remove the namespace from `UNTRANSLATED_NAMESPACES` in `./index.ts`. Never add a key by
 * translating the English yourself.
 */
import type { DeepPartial, PublicCopy } from "./types";

export const ar: DeepPartial<PublicCopy> = {
  site: {
    // A brand name, not a claim — the business already trades under this name in Arabic markets.
    name: "هيلز كوفي",
  },

  a11y: {
    skipToContent: "تخطَّ إلى المحتوى الرئيسي",
    primaryNavigation: "التنقل الرئيسي",
    footerNavigation: "روابط التذييل",
    homeLink: "هيلز كوفي — الصفحة الرئيسية",
  },

  nav: {
    coffee: "البن",
    origins: "المناشئ",
    sourcing: "التوريد",
    contact: "تواصل معنا",
    portalEntry: "بوابة التداول",
  },

  cta: {
    requestAnOffer: "اطلب عرض سعر",
  },

  controls: {
    themeToggle: "تغيير المظهر",
    switchToDark: "التبديل إلى المظهر الداكن",
    switchToLight: "التبديل إلى المظهر الفاتح",
    languageSwitcher: "Switch to English",
    languageSwitcherShort: "EN",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
    menuTitle: "القائمة",
    openSearch: "بحث",
    searchTitle: "ابحث في بن هيلز",
    searchHint: "سيفتح بحثك دليل البن المنشور.",
    searchPlaceholder: "ابحث حسب البن أو المنشأ",
    searchSubmit: "تصفح البن",
    close: "إغلاق",
  },

  footer: {
    exploreHeading: "استكشف",
    accountHeading: "الحساب",
    commercialHeading: "تواصل تجاري",
    rights: "جميع الحقوق محفوظة.",
    locationLine: "دبي · مصر",
    // brandStatement and commercialBody are business claims — English fallback (CONTENT-AR-01).
  },

  // Every remaining namespace (home, coffee, origins, sourcing, portalEntry, referencePrice, media)
  // is intentionally absent. See UNTRANSLATED_NAMESPACES in ./index.ts.
};
