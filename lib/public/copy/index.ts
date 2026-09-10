/**
 * Typed accessor for the single public copy dictionary (Feature 002 T000; extended by Phase 5.5
 * UIF-017 with the Arabic sibling).
 *
 * Like `en.ts` and `ar.ts`, this module is deliberately neutral: no `"use client"`, no `react`
 * import, no `i18next` import. It is importable from a Server Component, a Client Component, a Route
 * Handler, `generateMetadata`, `sitemap.ts` or a test with identical results and no boundary change.
 *
 * The type is *derived* from the dictionary rather than declared separately, so a missing or
 * misspelled key is a compile error at `npm run typecheck` — never a runtime `undefined` that would
 * ship an empty string to a visitor.
 *
 * There is exactly ONE dictionary and ONE i18n system (FR-030). `ar.ts` is a partial overlay on this
 * same module, not a parallel dictionary, and `lib/i18n/config.ts` is fed *from here* rather than
 * retyping the strings.
 */
import { ar } from "./ar";
import { en } from "./en";
import type { DeepPartial, PublicCopy } from "./types";

export type { PublicCopy };

/**
 * The English public copy. Import this — never re-declare a local copy object in a component, page,
 * layout or route handler (contract §3.1).
 *
 * It remains the default export path and the server-rendered default, because Phase 5.5 introduces
 * no locale routing: the server cannot know a viewer's stored language without making every public
 * route dynamic, which would damage the Feature-001 cache architecture (plan §9, `I18N-ROUTE-01`).
 */
export const copy: PublicCopy = en;

/**
 * Namespaces that carry **no** Arabic and therefore resolve to the reviewed English.
 *
 * Empty since the public design convergence pass (2026-09-10): every namespace now carries a
 * faithful Arabic rendering of its approved English value. The list is kept — rather than deleted —
 * because it is the mechanism UIF-017 specified for declaring a gap, and because the remaining
 * obligation of `CONTENT-AR-01` is unchanged in kind: Content/Legal sign-off of the Arabic wording
 * before production. Should a namespace be withdrawn from Arabic during that review, it is listed
 * here again and falls back to English automatically.
 */
export const UNTRANSLATED_NAMESPACES = [] as const satisfies readonly (keyof PublicCopy)[];

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

const dictionaries: Record<"en" | "ar", PublicCopy> = {
  en,
  ar: overlay(en, ar),
};

/**
 * The full dictionary for a locale, with every untranslated key already resolved to its reviewed
 * English value. Always returns a complete `PublicCopy`, so no caller can render an empty string.
 */
export function getCopy(locale: "en" | "ar"): PublicCopy {
  return dictionaries[locale];
}
