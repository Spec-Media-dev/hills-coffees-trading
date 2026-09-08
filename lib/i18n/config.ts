"use client";

import { createElement, type ReactNode } from "react";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";

/**
 * Minimal i18next/react-i18next initialization (research.md §10).
 *
 * Single `en` resource namespace. No i18next-browser-languagedetector activation, no locale
 * switcher, no Arabic resource file, no locale routing — this only wires the mechanism so later
 * features route new copy through translation keys instead of inline hardcoded strings. RTL/
 * translation readiness (logical CSS, externalized copy) is a foundation convention; actual
 * localization content is a later decision.
 */
const resources = {
  en: {
    translation: {},
  },
} as const;

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export { i18next };

/**
 * Narrow provider used by the root layout (T009) to make the i18next instance available to any
 * component that later calls useTranslation(). Uses createElement (not JSX) so this file can stay
 * a plain .ts module per plan.md's project structure.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  return createElement(I18nextProvider, { i18n: i18next }, children);
}
