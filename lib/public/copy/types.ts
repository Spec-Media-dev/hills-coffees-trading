/**
 * Types shared by the English source dictionary and its Arabic sibling (Phase 5.5, UIF-017).
 *
 * Server-safe: no client directive, no `react`, no `i18next`.
 */
import type { en } from "./en";

/** The shape of the public copy dictionary, DERIVED from the English source, never re-declared. */
export type PublicCopy = typeof en;

/**
 * A translation may cover any subset of the dictionary and nothing outside it.
 *
 * The recursion is what enforces the honesty rule structurally rather than by review: a translator
 * can omit a key (it falls back to reviewed English) but cannot invent one, and cannot change a
 * key's type. `readonly` is stripped because `en` is `as const`.
 */
export type DeepPartial<T> = {
  -readonly [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]>;
};
