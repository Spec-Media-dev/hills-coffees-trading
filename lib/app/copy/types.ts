/**
 * Types for the Member/Admin application shell copy dictionary (Phase 5.5, UIF-035).
 *
 * Server-safe: no client directive, no `react`, no `i18next`. Mirrors `lib/public/copy/types.ts`
 * exactly — the shape is derived from `en`, never re-declared, so a missing or misspelled key is a
 * compile error rather than a runtime `undefined`.
 */
import type { en } from "./en";

export type AppCopy = typeof en;
