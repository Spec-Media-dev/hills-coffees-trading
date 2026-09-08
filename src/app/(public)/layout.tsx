import type { ReactNode } from "react";

import { PublicShell } from "@/components/public/public-shell";

/**
 * Layout for the `(public)` route group (Feature 002, T003 — FR-001, FR-002, FR-023).
 *
 * `(public)` is a **route group**, not a path segment: the parentheses tell the App Router to use
 * this directory for shared layout only. It never appears in a URL — `src/app/(public)/coffee/` is
 * served at `/coffee/`, not `/(public)/coffee/`.
 *
 * IMPORTANT — this layout does NOT cover the homepage. `src/app/page.tsx` sits outside the group and
 * therefore does not inherit this file. That is exactly why the chrome lives in `PublicShell`: the
 * root page composes the same component in place (T013), so header and footer stay identical across
 * every public route.
 *
 * The three Constitution-locked root files — `src/app/page.tsx`, `src/app/layout.tsx` and
 * `src/app/globals.css` — stay exactly where they are. Adding this route group beside them relocates
 * nothing (Constitution IV).
 *
 * The routes that live inside this group (coffee, origins, sourcing, contact, portal entry) are
 * created in later phases. An empty group is intentional right now: a layout with no child route
 * simply never renders.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
