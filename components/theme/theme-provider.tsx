"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

import {
  DEFAULT_THEME,
  isThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/components/theme/preferences";

/**
 * Theme control path (Phase 5.5, UIF-016 — contract §11; plan §9).
 *
 * DEPENDENCY-FREE ON PURPOSE. `src/app/globals.css` already carries the complete, correct Hills dark
 * palette under `.dark` with `@custom-variant dark (&:is(.dark *))`. The capability existed and was
 * simply unreachable — nothing ever set the class. This provider is the missing *control path* and
 * nothing more. It adds **no** theme library, defines **no** token, and changes **no** existing token
 * value or selector (UIF-016 MUST NOT).
 *
 * ── WHY `useSyncExternalStore` AND NOT `useState` + `useEffect` ───────────────────────────────────
 *
 * The theme is not React state — it is state owned by an **external system**: the `<html>` element,
 * written before React ever runs by the blocking `preferenceScript()` in the root layout. React's job
 * is only to *read* it and stay subscribed.
 *
 * `useSyncExternalStore` is the primitive built for exactly that, and it removes the classic failure
 * mode by construction rather than by care:
 *
 *   - `getServerSnapshot()` is what the server rendered, so the first client render is guaranteed to
 *     match the server. There is no hydration mismatch to suppress.
 *   - React then re-reads `getSnapshot()` and re-renders with the true value, with no `setState` in an
 *     effect and therefore no cascading render.
 *   - There is no flash, because the paint already happened with the correct theme: the pre-paint
 *     script applied it before `<body>` existed. React is catching up to the DOM, not driving it.
 *
 * The DOM is deliberately the single source of truth here. The script and `applyTheme()` both write
 * `.dark`, and `getSnapshot()` reads it back — so the script, the provider and the CSS can never hold
 * three different opinions about the current theme.
 */

/** Broadcast so every subscribed component re-reads after a same-tab change. */
const THEME_EVENT = "hills:theme";

type ThemeContextValue = {
  /** The theme actually painted right now, with `system` already resolved. */
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
  /** Flip between the two concrete themes. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => {
    // Only a `system` preference follows the OS; an explicit choice must win over it.
    if (readPreference() === "system") {
      applyTheme(media.matches ? "dark" : "light");
      onChange();
    }
  };
  window.addEventListener(THEME_EVENT, onChange);
  // `storage` fires in *other* tabs, so a choice made in one tab follows the viewer into the rest.
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onMediaChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onMediaChange);
  };
}

/** Reads the painted theme back off the document — a stable primitive, safe to compare by identity. */
function getSnapshot(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** What the server rendered: the neutral default, since it cannot know a stored preference. */
function getServerSnapshot(): ResolvedTheme {
  return "light";
}

function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_THEME;
  } catch {
    // Storage unavailable (private mode, blocked cookies). The default is a correct page, not an
    // error state — the toggle still works for the current page view.
    return DEFAULT_THEME;
  }
}

/** Single place that writes the theme to the document, mirroring `preferenceScript()` exactly. */
function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolvedTheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: ThemePreference) => {
    const resolved =
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next;
    applyTheme(resolved);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A viewer with storage disabled keeps the choice for this page view only. That is the honest
      // outcome; it is not worth failing the interaction over.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, setTheme, toggleTheme }),
    [resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>.");
  }
  return context;
}
