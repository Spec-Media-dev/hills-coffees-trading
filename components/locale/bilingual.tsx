import type * as React from "react";

import { getCopy, type PublicCopy } from "@/lib/public/copy";

/**
 * Server-rendered bilingual chrome text (Phase 5.5, UIF-017 — contract §12, §16).
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────────────────────────
 *
 * The language preference lives in `localStorage`, because Phase 5.5 introduces no locale routing
 * and must not read a cookie on the server — either would make every public route dynamic and damage
 * the verified Feature-001 cache architecture (plan §9, `I18N-ROUTE-01`).
 *
 * But the public header and footer are **Server Components** and must stay that way: turning the
 * chrome into a client island to translate a handful of navigation labels would hydrate the whole
 * shell for no benefit and break contract §16's island list.
 *
 * ── THE SOLUTION ─────────────────────────────────────────────────────────────────────────────────
 *
 * Render **both** languages into the server HTML and let CSS pick, keyed off the `lang` attribute
 * that `preferenceScript()` has already placed on `<html>` before first paint. This is the exact
 * technique the header logo already uses for Light/Dark (`dark:hidden`), applied to language.
 *
 * The result: correct at first paint, zero client JavaScript, zero hydration risk, no dynamic
 * rendering, and the shell stays a Server Component. The cost is a few short duplicated strings in
 * the chrome — a trade worth making exactly once, here.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────────────────────────────
 *
 * The inactive language is hidden with `display: none`, which removes it from the accessibility tree
 * as well as from view. A screen reader therefore announces one label, not two — and
 * `aria-labelledby` pointing at a wrapper containing both spans resolves to the visible one only.
 * Each span carries its own `lang`, so a screen reader switches voice correctly.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────────────────────────
 *
 * INTERFACE CHROME ONLY — navigation labels, control names, landmark names, section headings in the
 * shell. Page bodies are not bilingual: approved Arabic marketing, commercial and legal content does
 * not exist and must not be invented (`CONTENT-AR-01`). Where a key has no approved Arabic, `ar.ts`
 * omits it and `getCopy("ar")` resolves it to the reviewed English, so this component renders the
 * same English twice rather than an invented translation — which is the honest outcome.
 */

const EN = getCopy("en");
const AR = getCopy("ar");

/** Selects one leaf string from the dictionary. Both languages are read through the same selector, */
/** so an English label and its Arabic counterpart can never be paired up wrongly at a call site. */
export type CopySelector = (dictionary: PublicCopy) => string;

export function Bilingual({ pick }: { pick: CopySelector }) {
  const en = pick(EN);
  const ar = pick(AR);

  // Identical strings mean this key has no approved Arabic and fell back to English. Render it once,
  // through the same marking `EnglishCopy` applies — two identical spans would be pure markup weight.
  if (en === ar) {
    return <EnglishCopy>{en}</EnglishCopy>;
  }

  return (
    <>
      <span lang="en" className="hc-lang-en">
        {en}
      </span>
      <span lang="ar" className="hc-lang-ar">
        {ar}
      </span>
    </>
  );
}

/**
 * English text that has **no** approved Arabic and is therefore shown to Arabic viewers as a
 * reviewed English fallback (`CONTENT-AR-01`).
 *
 * WHY THIS EXISTS RATHER THAN JUST PRINTING THE STRING: inside `dir="rtl"`, the Unicode bidirectional
 * algorithm resolves a Latin sentence's trailing punctuation against the *paragraph* direction, so
 * "…held in Dubai." renders as ".in Dubai…" — the full stop jumps to the wrong end. Marking the run
 * `dir="ltr"` scopes bidi resolution to the English text itself, so it reads correctly, while the
 * surrounding block stays mirrored and right-aligned as the RTL layout requires.
 *
 * `lang="en"` additionally keeps a screen reader in an English voice for the passage rather than
 * attempting to pronounce it as Arabic.
 *
 * Use this for any user-facing English prose that is a translation fallback. It is a no-op in LTR.
 */
export function EnglishCopy({ children }: { children: React.ReactNode }) {
  return (
    <span lang="en" dir="ltr">
      {children}
    </span>
  );
}
