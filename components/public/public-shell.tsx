import type { ReactNode } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";

/**
 * The single shared public chrome (Feature 002, T001 — FR-023, FR-020, FR-030).
 *
 * WHY THIS IS A COMPONENT AND NOT JUST A LAYOUT:
 *
 * `src/app/page.tsx` is the root homepage and does **not** inherit `src/app/(public)/layout.tsx` — a
 * route group's layout applies only to routes *inside* the group, and the root page sits outside it.
 * Putting the header/footer in the group layout alone would leave the homepage with no public
 * chrome. So the chrome lives here, in one component, consumed by **both** the locked root page
 * (T013) and the route-group layout (T003). Header and footer are therefore identical on every
 * public route by construction rather than by convention.
 *
 * Server Component on purpose: it adds zero client JavaScript, its copy is inlined into the
 * server-rendered HTML, and the navigation still works with JavaScript disabled (FR-020, PS1).
 *
 * It defines no token and no font system — colour, radius and typography all come from Feature 001's
 * existing Hills token layer in `src/app/globals.css` and the font variables wired in
 * `src/app/layout.tsx` (FR-030).
 *
 * Layout uses logical CSS properties only, so the same markup renders correctly under `dir="rtl"`
 * (FR-018).
 */

/** Target of the skip link and of the `<main>` landmark. A technical constant, not copy (§3.7). */
const MAIN_CONTENT_ID = "main-content";

export type PublicShellProps = {
  children: ReactNode;
};

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      {/*
        Skip link: visually hidden until focused, then pinned to the top of the viewport. It is the
        first focusable element on every public page, so a keyboard or screen-reader visitor can jump
        past the navigation straight to the content (FR-017, WCAG 2.2 AA).
      */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:inline-flex focus:h-[var(--control-h)] focus:items-center focus:rounded-[var(--radius-sm)] focus:bg-primary focus:px-5 focus:text-[length:var(--text-small)] focus:font-semibold focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]"
      >
        <Bilingual pick={(c) => c.a11y.skipToContent} />
      </a>

      <SiteHeader />

      <main id={MAIN_CONTENT_ID} className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
