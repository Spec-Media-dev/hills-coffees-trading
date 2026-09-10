import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";

/**
 * Auth route-group shell (Feature 003, T004 — spec FR-018, FR-019).
 *
 * Public and reachable (no `getRequestIdentity()` guard here — these routes exist precisely for an
 * anonymous visitor), but explicitly NON-INDEXABLE: `robots: { index: false, follow: false }`, since
 * a search result linking straight to a sign-in form serves no one (FR-018).
 *
 * DELIBERATELY NOT the full `PublicShell`/`SiteHeader` (mega-menus, search, primary nav, the
 * "Request an offer" CTA) — an authentication flow is a focused task, and the full marketing chrome
 * around it would be noise a visitor has to route around, not help. What IS reused: the same Hills
 * logo lockup, the same `ThemeToggle`/`LanguageSwitcher` islands (so appearance/language control
 * isn't lost here), the same design tokens, and the same bilingual-span technique every public page
 * uses — this is restraint, not a second design system.
 *
 * Server Component; the only client islands are the pre-existing `ThemeToggle`/`LanguageSwitcher`.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const LOGO_WIDTH = 2624;
const LOGO_HEIGHT = 996;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
