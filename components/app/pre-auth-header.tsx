import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { copy } from "@/lib/public/copy";

const LOGO_WIDTH = 2624;
const LOGO_HEIGHT = 996;

/**
 * Minimal header for `/dashboard/*` states rendered BEFORE the business `AppShell` (unverified
 * email, organization selection, onboarding, and every not-yet-authorized KYB status/workspace
 * screen) — none of those states get `AppShell`'s `Topbar`, so without this they had no theme
 * toggle, no language switcher, and no way back to the public site. Mirrors `(auth)/layout.tsx`'s
 * own header exactly (same logo lockup, same `ThemeToggle`/`LanguageSwitcher` islands) — restraint,
 * not a second design system. Server Component; the only client islands are the pre-existing
 * `ThemeToggle`/`LanguageSwitcher`.
 */
export function PreAuthHeader() {
  return (
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
  );
}
