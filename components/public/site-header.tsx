import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/account/account-menu";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { Bilingual } from "@/components/locale/bilingual";
import { MobileNav } from "@/components/public/mobile-nav";
import { MEGA_MENU, PRIMARY_NAV, PUBLIC_ROUTES, type MegaMenuKey } from "@/components/public/routes";
import { SearchControl } from "@/components/public/search-control";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import { copy } from "@/lib/public/copy";

export { PUBLIC_ROUTES };

/**
 * Public site header — production build (Phase 5.5, UIF-020; rebuilt by the public design
 * convergence pass — contract §5, §11, §12, §16; plan §6.2).
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 *   logo · Coffee · Origins · Sourcing · About us · Contact · [search field] · theme · language ·
 *   Trading Portal · Request an offer
 *
 * The lockup is larger than the 150px floor (176px, 200px at `xl`) inside an 84px bar, so the mark
 * reads with confidence without the bar becoming oversized. "Request an offer" is still the only
 * filled button.
 *
 * ── AUTH-AWARE ACCOUNT SLOT (Feature 003) ────────────────────────────────────────────────────────
 *
 * The quiet text link beside the CTA is now the REAL sign-in/account control, replacing the
 * "Trading Portal" placeholder that pointed at `/portal-entry/` while Feature 003 did not exist yet
 * (that page's own copy said sign-in wasn't open — now that it is, this Header no longer routes
 * there). Resolved server-side via `getRequestIdentity()` — the SAME per-request resolver every
 * protected surface uses, called once here — so the correct state renders in the initial HTML with
 * no client-side auth flash. This is presentation only (contract: showing/hiding a link grants
 * nothing); every destination it links to re-verifies authorization itself.
 *
 * Making this Server Component call `getRequestIdentity()` means every page that renders
 * `PublicShell`/`SiteHeader` is no longer eligible for static/ISR prerendering (a dynamic API is now
 * in the render tree) — a deliberate, accepted trade-off of wiring real per-request auth state into
 * a Header that previously rendered identically for every visitor. The underlying `lib/public/*`
 * catalogue reads keep their own `unstable_cache` entries regardless, so per-request cost stays a
 * cache lookup for that data; only the page shell itself now renders fresh per request.
 *
 * ── INTEGRATED WITH THE HERO, WITHOUT A SCROLL LISTENER ──────────────────────────────────────────
 *
 * Over a page that opens on a dark photographic band (`[data-page-opener="dark"]` on the opening
 * section) the header starts as dark glass — transparent tint, cream ink, cream lockup — and settles
 * into the Hills surface with the theme-correct lockup as the page scrolls under it. The whole
 * transition is one CSS scroll-driven animation on a registered custom property (`--hdr-p`, see
 * `globals.css`); every colour in the bar is derived from it with `color-mix`. There is no scroll
 * listener, no client island and no state, so the header stays a **Server Component** and never
 * changes height. Browsers without scroll timelines, and viewers who prefer reduced motion, get the
 * settled state from the first frame. Pages that open on a light surface are never transparent.
 *
 * Three lockups are stacked in one cell: the cream mark for the over-photo state, and the green /
 * cream pair the theme swaps between for the settled state. They cross-fade on `--hdr-p`, so the
 * correct variant is always the one with contrast.
 *
 * ── FLYOUT PANELS ARE CSS ────────────────────────────────────────────────────────────────────────
 *
 * Coffee, Origins, Sourcing and About open a panel on hover and on keyboard focus (`:focus-within`),
 * with a short intent delay so brushing past a link does not flash it open. Each panel carries the
 * primary destination, one sentence, two related routes that already exist, and one small editorial
 * crop. Contact is a plain link — a quick-contact panel with no approved contact details in it would
 * be an empty box. Because the panels are `:hover`/`:focus-within` state rather than script, the
 * contract §16 island list is unchanged; on touch and below `lg` the mobile drawer is the navigation.
 *
 * ── SERVER COMPONENT, WITH FOUR NARROW ISLANDS ───────────────────────────────────────────────────
 *
 * Search, theme, language and the mobile drawer remain the only client islands here, exactly as
 * UIF-B shipped them. Labels are bilingual through `<Bilingual>` (both languages in the server HTML,
 * CSS picks from `<html lang>`), which is what lets the chrome switch language with zero JavaScript.
 *
 * ── CURRENT-PAGE MARKING: A RECORDED LIMITATION ──────────────────────────────────────────────────
 *
 * Unchanged from UIF-020: a Server Component cannot read the pathname, and the alternatives (a new
 * island, or a request header that would make every public route dynamic) are worse than the gap.
 * The mobile drawer marks the current route.
 */

/** Intrinsic dimensions of the approved horizontal lockups (2624×996, 2.63:1). */
const LOGO_WIDTH = 2624;
const LOGO_HEIGHT = 996;

const LOGO_CLASS = "block h-auto w-[150px] lg:w-[176px] xl:w-[200px]";

const NAV_LINK =
  "hc-nav-link relative inline-flex h-[var(--header-h)] shrink-0 items-center gap-1 whitespace-nowrap text-[length:var(--text-small)] font-medium transition-colors duration-[var(--dur-fast)] after:absolute after:inset-x-0 after:bottom-[calc(50%-1.35rem)] after:h-[2px] after:origin-center after:scale-x-0 after:bg-[var(--gold-on-dark)] after:transition-transform after:duration-[var(--dur-fast)] hover:after:scale-x-100 focus-visible:rounded-[var(--radius-xs)] focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-[var(--focus-ring)]";

const PANEL_LINK =
  "group/panel inline-flex min-h-11 items-center gap-2 text-[length:var(--text-small)] font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-[var(--radius-xs)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

function MegaPanel({ menuKey }: { menuKey: MegaMenuKey }) {
  const panel = MEGA_MENU[menuKey];
  return (
    <div className="hc-mega absolute start-0 top-full z-50 w-[min(44rem,calc(100vw-2*var(--gutter-page)))] pt-2">
      <div className="grid gap-8 rounded-[var(--radius-xl)] border border-border bg-[var(--surface-raised)] p-7 text-foreground shadow-[var(--shadow-xl)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.75fr)_auto]">
        <div className="flex flex-col gap-3">
          <p className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)]">
            <Bilingual pick={(c) => c.megaMenu[menuKey].title} />
          </p>
          <p className="max-w-[40ch] text-[length:var(--text-small)] leading-[1.65] text-muted-foreground">
            <Bilingual pick={(c) => c.megaMenu[menuKey].body} />
          </p>
          <Link href={panel.primaryHref} className={`${PANEL_LINK} mt-1 self-start`}>
            <Bilingual pick={(c) => c.megaMenu[menuKey].primary} />
            <Icon
              name="arrow-right"
              data-directional-icon="true"
              className="size-4 transition-transform duration-[var(--dur-fast)] group-hover/panel:translate-x-0.5 rtl:group-hover/panel:-translate-x-0.5"
            />
          </Link>
        </div>

        <div className="flex flex-col gap-1 border-s border-border ps-6">
          <p className="hc-eyebrow mb-2 text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.megaMenu.relatedHeading} />
          </p>
          {panel.related.map((item) => (
            <Link key={item.href} href={item.href} className={PANEL_LINK}>
              <Bilingual pick={(c) => c.nav[item.key]} />
            </Link>
          ))}
        </div>

        {/* A small editorial crop, never a record's media (MEDIA-01). Decorative: the panel's meaning
            is carried by its text. */}
        <div className="relative hidden aspect-[4/5] w-[8.5rem] overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted lg:block">
          <Image src={panel.image} alt="" fill sizes="8.5rem" className="object-cover object-center" />
        </div>
      </div>
    </div>
  );
}

export async function SiteHeader() {
  const identity = await getRequestIdentity();

  return (
    <header className="hc-header sticky top-0 z-40 border-b supports-[backdrop-filter]:[backdrop-filter:var(--blur-panel)]">
      <div className="hc-container flex h-[var(--header-h)] items-center gap-3 lg:gap-5">
        <Link
          href={PUBLIC_ROUTES.home}
          aria-label={copy.a11y.homeLink}
          className="grid shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] [&>img]:[grid-area:1/1]"
        >
          {/* Over-photo state: always the cream mark. */}
          <Image
            src="/images/hills-logo-light.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className={`hc-header-logo-over ${LOGO_CLASS}`}
          />
          {/* Settled state: green on light surfaces, cream on dark — swapped by the theme. */}
          <Image
            src="/images/hills-logo-dark.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className={`hc-header-logo-rest ${LOGO_CLASS} dark:hidden`}
          />
          <Image
            src="/images/hills-logo-light.png"
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            className={`hc-header-logo-rest ${LOGO_CLASS} hidden dark:block`}
          />
        </Link>

        <nav
          aria-label={copy.a11y.primaryNavigation}
          className="relative ms-2 hidden min-w-0 lg:block xl:ms-6"
        >
          <ul className="flex items-center gap-6 xl:gap-7">
            {PRIMARY_NAV.map((item) => {
              const hasPanel = item.key in MEGA_MENU;
              return (
                <li key={item.href} className={hasPanel ? "hc-nav-item" : undefined}>
                  <Link href={item.href} className={NAV_LINK}>
                    <Bilingual pick={(c) => c.nav[item.key]} />
                    {hasPanel ? (
                      <Icon
                        name="chevron-down"
                        className="size-3.5 opacity-70 transition-transform duration-[var(--dur-fast)] [.hc-nav-item:hover_&]:rotate-180 [.hc-nav-item:focus-within_&]:rotate-180"
                      />
                    ) : null}
                  </Link>
                  {hasPanel ? <MegaPanel menuKey={item.key as MegaMenuKey} /> : null}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logical margin keeps the action cluster at the trailing edge in both directions. */}
        <div className="hc-header-tools ms-auto flex shrink-0 items-center gap-2 lg:gap-3">
          <SearchControl />

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>

          {/* Secondary by design (FR-016): a quiet text link (anonymous) or the account trigger
              (authenticated) beside the filled CTA — see the Feature 003 header comment above. */}
          {identity.kind === "authenticated" ? (
            <AccountMenu
              displayName={identity.profile.fullName ?? identity.profile.companyName ?? "Account"}
              organizationName={identity.organization?.displayName ?? null}
              showMemberDashboard={
                identity.organizations.length > 0 ||
                identity.requiresOrganizationSelection ||
                identity.operationalRoles.length === 0
              }
              showAdminConsole={identity.operationalRoles.length > 0}
            />
          ) : (
            <Link
              href="/sign-in/"
              className="hidden h-[var(--control-h)] items-center rounded-[var(--radius-sm)] px-2 text-[length:var(--text-small)] font-medium underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:inline-flex"
            >
              <Bilingual pick={(c) => c.account.signIn} />
            </Link>
          )}

          {/* The one filled button. Over the hero it is cream-on-photo; settled, it is the primary
              forest button — both derived from `--hdr-p` in `globals.css` (never gold, contract §3). */}
          <Link
            href={PUBLIC_ROUTES.contact}
            className="hc-header-cta hidden h-[var(--control-h)] items-center justify-center rounded-[var(--radius-sm)] border px-5 text-sm font-semibold tracking-[0.005em] transition-[color,background-color,border-color,transform] duration-[var(--dur-fast)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transform-none sm:inline-flex"
          >
            <Bilingual pick={(c) => c.cta.requestAnOffer} />
          </Link>

          <MobileNav
            auth={
              identity.kind === "authenticated"
                ? {
                    signedIn: true,
                    displayName: identity.profile.fullName ?? identity.profile.companyName ?? "Account",
                    showMemberDashboard:
                      identity.organizations.length > 0 ||
                      identity.requiresOrganizationSelection ||
                      identity.operationalRoles.length === 0,
                    showAdminConsole: identity.operationalRoles.length > 0,
                  }
                : { signedIn: false }
            }
          />
        </div>
      </div>
    </header>
  );
}
