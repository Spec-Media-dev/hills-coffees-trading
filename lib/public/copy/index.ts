/**
 * Typed accessor for the single English public copy dictionary (Feature 002, T000).
 *
 * Like `en.ts`, this module is deliberately neutral: no `"use client"`, no `react` import, no
 * `i18next` import. It is importable from a Server Component, a Client Component, a Route Handler,
 * `generateMetadata`, `sitemap.ts` or a test with identical results and no boundary change.
 *
 * The type is *derived* from the dictionary rather than declared separately, so a missing or
 * misspelled key is a compile error at `npm run typecheck` — never a runtime `undefined` that would
 * ship an empty string to a visitor.
 */
import { en } from "./en";

/** The shape of the public copy dictionary, derived from the English source. */
export type PublicCopy = typeof en;

/**
 * The public copy. Import this — never re-declare a local copy object in a component, page, layout
 * or route handler (contract §3.1).
 */
export const copy: PublicCopy = en;
