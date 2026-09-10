/**
 * Typed accessor for the Member/Admin application shell copy dictionary (Phase 5.5, UIF-035).
 *
 * Mirrors `lib/public/copy/index.ts`'s exact pattern (overlay merge, `getAppCopy(locale)` always
 * returns a complete `AppCopy` with untranslated keys resolved to reviewed English) — deliberately
 * so there is exactly one PATTERN for "a locale dictionary in this product", even though there are
 * now two content roots for the one documented, tested reason recorded in `en.ts`'s header comment.
 */
import type { DeepPartial } from "@/lib/public/copy/types";

import { ar } from "./ar";
import { en } from "./en";
import type { AppCopy } from "./types";

export type { AppCopy };

/**
 * The English app-shell copy, for Server Components that render one fixed language server-side —
 * exactly `lib/public/copy`'s `copy` export, mirrored. Visible text should prefer `<AppBilingual>`
 * (both languages, CSS-picked) or, in a Client Component, `useLocale().tApp`; this default is for
 * attribute values (`aria-label`, etc.) that cannot carry two languages at once.
 */
export const appCopy: AppCopy = en;

/** Recursively overlays a partial translation onto the English source. */
function overlay<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] =
      typeof value === "object" && value !== null && typeof current === "object" && current !== null
        ? overlay(current, value as DeepPartial<unknown>)
        : value;
  }
  return merged as T;
}

const dictionaries: Record<"en" | "ar", AppCopy> = {
  en,
  ar: overlay(en, ar),
};

/** The full app-shell dictionary for a locale, every key already resolved. */
export function getAppCopy(locale: "en" | "ar"): AppCopy {
  return dictionaries[locale];
}
