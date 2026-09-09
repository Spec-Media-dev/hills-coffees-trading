"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  DEFAULT_LOCALE,
  directionOf,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "@/components/theme/preferences";
import { getCopy, type PublicCopy } from "@/lib/public/copy";
import { i18next } from "@/lib/i18n/config";

/**
 * Locale and direction control path (Phase 5.5, UIF-017 — contract §12; plan §8, §9).
 *
 * NO SECOND i18n SYSTEM. Feature 001's i18next initialisation in `lib/i18n/config.ts` stays the only
 * one, and it is fed from `lib/public/copy` rather than retyping any string (FR-030). This provider
 * is the *control path* over that existing system — the same relationship `ThemeProvider` has to the
 * `.dark` palette that already existed in `globals.css`, and it uses the same
 * `useSyncExternalStore` approach for the same reasons (see that file).
 *
 * NO LOCALE ROUTING. `/ar/...` would change the canonical URL contract, the sitemap and the metadata
 * architecture that Feature 002 has already verified, and reading the preference from a cookie on the
 * server would make every public route dynamic and damage the Feature-001 cache architecture. The
 * preference therefore lives in `localStorage` and is applied to `<html>` — pre-paint by
 * `preferenceScript()`, and thereafter by this provider. The recorded consequence is that Arabic is
 * not separately indexable: `I18N-ROUTE-01`, an acknowledged trade-off, not an oversight.
 *
 * WHAT THE VIEWER ACTUALLY GETS when they choose العربية:
 *   - `dir="rtl"` and `lang="ar"` on `<html>`, so the whole product mirrors through logical CSS;
 *   - the Arabic type stack (Readex Pro / Cairo) with its opened line-height and reduced tracking,
 *     already wired in `globals.css` under `[dir="rtl"], [lang="ar"]`;
 *   - Arabic interface chrome — server-rendered through `<Bilingual>` for the shell, and read from
 *     `t` here for the interactive controls;
 *   - reviewed **English** for every business, marketing and legal claim, because approved Arabic
 *     content does not exist and inventing it is prohibited (`CONTENT-AR-01`).
 */

const LOCALE_EVENT = "hills:locale";

type LocaleContextValue = {
  locale: Locale;
  direction: "ltr" | "rtl";
  /** The resolved dictionary for the active locale, English-filled where Arabic is unapproved. */
  t: PublicCopy;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LOCALE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LOCALE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Reads the applied locale back off the document, exactly as the theme snapshot does. */
function getSnapshot(): Locale {
  return document.documentElement.lang === "ar" ? "ar" : "en";
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

/** Single place that writes the locale to the document, mirroring `preferenceScript()` exactly. */
function applyLocale(locale: Locale): void {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = directionOf(locale);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep i18next — an external system — in step with the active locale. Syncing an external system
  // is precisely what an effect is for; nothing here sets React state.
  useEffect(() => {
    if (i18next.language !== locale) {
      void i18next.changeLanguage(locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    applyLocale(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Choice held for this page view only.
    }
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(getSnapshot() === "ar" ? "en" : "ar");
  }, [setLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: directionOf(locale),
      t: getCopy(locale),
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside <LocaleProvider>.");
  }
  return context;
}

/** Kept for the `isLocale` guard used by the pre-paint script contract. */
export { isLocale };
