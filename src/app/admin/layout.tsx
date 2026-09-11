import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Admin auth route shell (admin-auth correction pass, RUN B follow-up).
 *
 * Deliberately the SAME visual shell `(auth)/layout.tsx` already established for the member auth
 * routes — same logo lockup, same `ThemeToggle`/`LanguageSwitcher` islands, same centered-card
 * layout, same "Back to Hills Coffee" footer link — this is restraint (one design system, two
 * sign-in EXPERIENCES), not a second design system. Kept as its own small file rather than
 * refactoring the shared `(auth)/layout.tsx` into a common component: the member auth surface is
 * explicitly out of scope for this pass ("Do NOT break /sign-in/ /sign-up/"), and this shell is
 * static, header/footer-only chrome with no logic to diverge — duplicating ~40 lines of markup here
 * is lower risk than touching already-verified shared infrastructure for zero behavior change.
 *
 * Public and reachable (no `getRequestIdentity()` guard here — `/admin/sign-in/` exists precisely
 * for an anonymous visitor), but explicitly NON-INDEXABLE (FR-013/SEO-APP-01 — an operations
 * sign-in page has no reason to appear in search results).
 *
 * Server Component; the only client islands are the pre-existing `ThemeToggle`/`LanguageSwitcher`.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const LOGO_WIDTH = 2624;
const LOGO_HEIGHT = 996;

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-secondary text-foreground">
      <header className="hc-container flex h-20 shrink-0 items-center justify-between">
        <Link
          href="/"
          aria-label={copy.a11y.homeLink}
          className="grid shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] [&>img]:[grid-area:1/1]"
        >
          <Image
            src="/images/hills-logo-dark.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className="block h-auto w-[150px] dark:hidden"
          />
          <Image
            src="/images/hills-logo-light.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className="hidden h-auto w-[150px] dark:block"
          />
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-[var(--gutter-page)] py-12">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>

      <footer className="hc-container flex justify-center py-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-[length:var(--text-small)] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Icon name="chevron-left" className="size-4 rtl:rotate-180" />
          <Bilingual pick={(c) => c.auth.layout.backToSite} />
        </Link>
      </footer>
    </div>
  );
}
