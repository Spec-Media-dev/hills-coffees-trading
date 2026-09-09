import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { Bilingual } from "@/components/locale/bilingual";
import { MobileNav } from "@/components/public/mobile-nav";
import { PRIMARY_NAV, PUBLIC_ROUTES } from "@/components/public/routes";
import { SearchControl } from "@/components/public/search-control";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/public/copy";

export { PUBLIC_ROUTES };

/**
 * Public site header — production build (Phase 5.5, UIF-020 — contract §5, §11, §12; plan §6.2).
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * Slot order follows the approved reference board and the live Hills site alike:
 *
 *   logo · primary navigation · search · theme · language · portal entry · commercial CTA
 *
 * NAVIGATION PRIORITY follows the design guidance: Coffee, Origins and Sourcing lead. "Request an
 * offer" is the primary conversion action and is the only filled button in the header; the Trading
 * Portal entry sits beside it as a quiet text link, because the guidance is explicit that visitors
 * must not all be funnelled into the portal (FR-016). The live site has no header CTA at all — this
 * is a deliberate improvement on it, not a copy of it.
 *
 * `/knowledge` and `/legal` are absent by design (CONTENT-01). See `routes.ts`.
 *
 * ── SERVER COMPONENT, WITH FOUR NARROW ISLANDS ───────────────────────────────────────────────────
 *
 * The header itself ships **zero** client JavaScript: the logo, the navigation and both actions are
 * real crawlable anchors that work with JavaScript disabled (FR-006, FR-020). Only the four genuinely
 * interactive controls are client islands — search, theme, language and the mobile drawer — each of
 * which is on the contract §16 list. The header was not turned into a Client Component to host them.
 *
 * Navigation labels are bilingual through `<Bilingual>`, which renders both languages server-side and
 * lets CSS pick from `<html lang>`. That is what allows the chrome to switch language while staying a
 * Server Component (contract §12, §16).
 *
 * ── CURRENT-PAGE MARKING: A RECORDED LIMITATION ──────────────────────────────────────────────────
 *
 * The desktop navigation does not mark the current route. Doing so needs the pathname, which a Server
 * Component cannot read, and the only fixes are a new client island — contract §16 fixes the island
 * list, and `UIF-047` audits against it — or reading a request header, which would make every public
 * route dynamic and damage the verified Feature-001 cache architecture. Neither is worth it here. The
 * mobile drawer, already a client island, does mark the current route with `aria-current="page"`.
 * Hover, focus-visible and pressed states are present throughout in both.
 *
 * ── STICKY AND SCROLLED TREATMENT ────────────────────────────────────────────────────────────────
 *
 * The header is sticky at a fixed `--header-h` (76px) and never changes height, so no scroll state
 * can cause a layout jump. The scrolled treatment — the shadow deepening as the page moves under it —
 * is a pure CSS scroll-driven animation defined in `globals.css`; it needs no scroll listener, no
 * client island and no JavaScript at all. Where the browser does not support scroll timelines, the
 * header simply keeps its resting treatment, which is fully legible on its own.
 */

/** Height and variant of the horizontal lockup. Never below the approved 150px digital minimum. */
const LOGO_WIDTH = 168;
const LOGO_HEIGHT = 64;

export function SiteHeader() {
  return (
    <header className="hc-header sticky top-0 z-40 border-b border-border/70 bg-[color-mix(in_srgb,var(--surface-page)_88%,transparent)] supports-[backdrop-filter]:[backdrop-filter:var(--blur-panel)]">
      <div className="hc-container flex h-[var(--header-h)] items-center gap-3 sm:gap-5">
        {/*
          Two approved horizontal lockups swapped by the `dark:` variant — green on light surfaces,
          cream on dark — so the mark stays legible in either theme with no client JavaScript. Both
          share identical intrinsic dimensions, so the swap causes no layout shift. `priority` because
          the logo is above the fold on every public route. The accessible name lives on the Link, so
          both images carry an empty alt to avoid a duplicate announcement.
        */}
        <Link
          href={PUBLIC_ROUTES.home}
          aria-label={copy.a11y.homeLink}
          className="shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
        >
          <Image
            src="/images/hills-logo-dark.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className="block h-auto w-[150px] dark:hidden xl:w-[168px]"
          />
          <Image
            src="/images/hills-logo-light.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className="hidden h-auto w-[150px] dark:block xl:w-[168px]"
          />
        </Link>

        <nav
          aria-label={copy.a11y.primaryNavigation}
          className="ms-4 hidden min-w-0 items-center gap-7 lg:flex xl:ms-8"
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative inline-flex h-[var(--header-h)] shrink-0 items-center text-[var(--text-small)] font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:origin-center after:scale-x-0 after:bg-[var(--gold-on-light)] after:transition-transform after:duration-[var(--dur-fast)] hover:text-foreground hover:after:scale-x-100 focus-visible:rounded-[var(--radius-xs)] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--focus-ring)] dark:after:bg-[var(--gold-on-dark)]"
            >
              <Bilingual pick={(c) => c.nav[item.key]} />
            </Link>
          ))}
        </nav>

        {/* Logical margin keeps the action cluster at the trailing edge in both directions. */}
        <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <SearchControl />

          {/* Theme and language are secondary chrome: present at tablet and up, and carried into the
              drawer footer below that, so nothing is lost at 390px. */}
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>

          {/*
            Secondary by design (FR-016): a quiet text link beside the filled primary CTA, never a
            second button. Until Feature 003 owns the real destination it resolves to an explicit,
            honest entry page — never a fake sign-in form and never a silent redirect to `/`.
          */}
          <Link
            href={PUBLIC_ROUTES.portalEntry}
            className="hidden h-[var(--control-h)] items-center rounded-[var(--radius-sm)] px-2 text-[var(--text-small)] font-medium text-muted-foreground underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] lg:inline-flex"
          >
            <Bilingual pick={(c) => c.nav.portalEntry} />
          </Link>

          {/* The primary commercial CTA — the one filled button in the header. Never gold: gold is
              selective accent only and is explicitly not the default CTA colour (contract §3). */}
          <Button
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={<Link href={PUBLIC_ROUTES.contact} />}
          >
            <Bilingual pick={(c) => c.cta.requestAnOffer} />
          </Button>

          <MobileNav />
        </div>
      </div>
    </header>
  );
}
