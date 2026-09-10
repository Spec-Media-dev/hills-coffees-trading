import { getAppCopy, type AppCopy } from "@/lib/app/copy";

/**
 * Server-rendered bilingual Member/Admin shell chrome (Phase 5.5, UIF-035 — mirrors
 * `components/locale/bilingual.tsx`'s exact technique for `lib/app/copy` instead of
 * `lib/public/copy`).
 *
 * Renders BOTH languages into the server HTML; CSS shows the one matching `<html lang>`
 * (`.hc-lang-en`/`.hc-lang-ar`, already defined globally). This is what lets `Sidebar`, `Topbar`
 * and `PageHeader` stay Server Components while still switching language with zero client
 * JavaScript — the same relationship the public shell's `Bilingual` has to `lib/public/copy`.
 */
const EN = getAppCopy("en");
const AR = getAppCopy("ar");

export type AppCopySelector = (dictionary: AppCopy) => string;

export function AppBilingual({ pick }: { pick: AppCopySelector }) {
  const en = pick(EN);
  const ar = pick(AR);

  if (en === ar) {
    return (
      <span lang="en" dir="ltr">
        {en}
      </span>
    );
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
