/**
 * The two viewer preferences the product shell applies before first paint (Phase 5.5, UIF-016 and
 * UIF-017 — contract §11, §12; plan §9).
 *
 * SERVER-SAFE BY CONSTRUCTION: no client directive, no `react` import. The pre-paint `<script>` in the
 * root layout, the client providers and any test all read these same constants, so the storage key,
 * the accepted values and the DOM effect can never drift between them.
 *
 * WHY BOTH PREFERENCES SHARE ONE MODULE AND ONE SCRIPT: theme and locale are applied by the *same*
 * blocking script for the same reason — a preference read from `localStorage` after hydration would
 * paint the wrong theme or the wrong direction first, then visibly correct itself. One script, run
 * before the body paints, removes both flashes at once (plan §9).
 *
 * WHY `.dark` AND NOT `data-theme`: the Claude Design system documents `data-theme="dark"`, while the
 * implementation established by Feature 001 uses the `.dark` class with
 * `@custom-variant dark (&:is(.dark *))` in `globals.css`. The **token values are identical** — the
 * selector is an implementation detail. It is deliberately NOT churned here: doing so would risk the
 * verified Feature-001 surfaces for zero product benefit. Recorded in plan §9 so no later agent
 * "fixes" one to match the other.
 */

/** Theme preference. `system` follows the OS `prefers-color-scheme` and is the initial default. */
export type ThemePreference = "light" | "dark" | "system";

/** The concrete theme actually painted once `system` has been resolved. */
export type ResolvedTheme = "light" | "dark";

/** Supported locales. No locale routing — see plan §9 and `I18N-ROUTE-01`. */
export type Locale = "en" | "ar";

/** `localStorage` keys. Technical constants, never copy. */
export const THEME_STORAGE_KEY = "hills-theme";
export const LOCALE_STORAGE_KEY = "hills-locale";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_LOCALE: Locale = "en";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

/** Every locale's document direction. Arabic is the only RTL locale today. */
export function directionOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The blocking script executed in `<head>` before the body paints.
 *
 * It is written as a single self-invoking string rather than imported code because it must run
 * *before* any bundle is fetched or parsed — that is the whole point. It is wrapped in try/catch
 * because `localStorage` throws outright in some privacy modes; a viewer with storage disabled must
 * still get a correctly-rendered page on the defaults, never a blank one.
 *
 * It touches only `documentElement`: the `.dark` class, `lang`, `dir` and `color-scheme`. It sets no
 * cookie and performs no network call, so it cannot make a public route dynamic and cannot disturb
 * the Feature-001 cache architecture (Constitution XI).
 */
export function preferenceScript(): string {
  return `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t!=="light"&&t!=="dark"&&t!=="system")t=${JSON.stringify(DEFAULT_THEME)};
var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;
d.classList.toggle("dark",r==="dark");
d.style.colorScheme=r;
var l=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});
if(l!=="en"&&l!=="ar")l=${JSON.stringify(DEFAULT_LOCALE)};
d.lang=l;
d.dir=l==="ar"?"rtl":"ltr";
}catch(e){}})();`;
}
