import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional OPTIMISTIC request shaping (Next 16 Proxy — formerly Middleware).
 *
 * File location: `src/proxy.ts`, BESIDE `src/app/`, never inside it. Next 16 resolves `proxy.ts` at
 * the same level as `app/` (research.md §2).
 *
 * THIS IS NOT AN AUTHORIZATION LAYER. Next.js's own documentation is explicit that Proxy
 * "should not be used as a full session management or authorization solution". Accordingly this
 * file:
 *
 *   - performs NO database call
 *   - performs NO `getUser()` / session verification
 *   - performs NO RPC
 *   - uses NO Supabase client and NO service-role key
 *   - reads NOTHING except whether an auth cookie is present
 *
 * A present-but-invalid, expired, forged or revoked cookie passes straight through here by design.
 * The authoritative decision is always made server-side afterwards by `getRequestIdentity()` in the
 * `/dashboard` and `/dashboard-admin` layout guards, backed by RLS. Removing this file entirely
 * would change UX only — never the security boundary.
 *
 * Its sole purpose: spare an obviously-anonymous visitor a pointless render of a protected shell.
 */

/**
 * Where an obviously-anonymous visitor is sent.
 *
 * 001 (platform foundation) ships no sign-in route — the authentication experience is
 * 003-auth-membership-kyb's scope. Pointing at a route that does not exist would produce a 404, so
 * this deliberately targets the public home route for now. 003 updates this single constant to its
 * real sign-in route.
 */
const SIGN_IN_PATH = "/";

/** Supabase (`@supabase/ssr`) writes its auth token to `sb-<project-ref>-auth-token`, which may be
 * split into chunked cookies (`...auth-token.0`, `...auth-token.1`). Presence of any chunk counts. */
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")
    );
}

export function proxy(request: NextRequest) {
  // Optimistic only: no cookie at all => almost certainly anonymous => skip rendering the shell.
  if (!hasSupabaseAuthCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Cookie present. Validity is NOT checked here on purpose — the layout guards decide.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard-admin/:path*"],
};
