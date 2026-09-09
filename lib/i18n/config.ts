"use client";

import { createElement, type ReactNode } from "react";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";

import { getCopy } from "@/lib/public/copy";

/**
 * The single i18next/react-i18next initialization (Feature 001, research.md §10; extended by
 * Phase 5.5 UIF-017).
 *
 * THIS REMAINS THE ONLY i18n SYSTEM (FR-030). Phase 5.5 adds no second library and no second
 * initialisation — it adds the `ar` language and the *control path* over this instance
 * (`components/locale/`), exactly as `ThemeProvider` adds the control path over the `.dark` palette
 * that already existed in `globals.css`.
 *
 * THE RESOURCES ARE FED FROM `lib/public/copy`, never retyped. `getCopy()` resolves each locale
 * against the English source, so an untranslated Arabic key arrives here already filled with the
 * reviewed English string — there is exactly one dictionary and no possibility of drift
 * (contract §12; `CONTENT-AR-01`).
 *
 * Still no locale routing and no `i18next-browser-languagedetector`: the active language is chosen
 * by the viewer's stored preference and applied pre-paint (plan §9, `I18N-ROUTE-01`).
 */
const resources = {
  en: { translation: getCopy("en") },
  ar: { translation: getCopy("ar") },
} as const;

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    interpolation: { escapeValue: false },
  });
}

export { i18next };

/**
 * Narrow provider used by the root layout (T009) to make the i18next instance available to any
 * component that calls useTranslation(). Uses createElement (not JSX) so this file can stay a plain
 * .ts module per plan.md's project structure.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  return createElement(I18nextProvider, { i18n: i18next }, children);
}
