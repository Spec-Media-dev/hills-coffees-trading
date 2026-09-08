import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * MUST be constructed fresh on every call (never memoized at module scope) — it reads the
 * current request's cookies via next/headers, so a module-level singleton would leak one
 * request's session into another. Uses only the browser-safe NEXT_PUBLIC_* values; this client
 * is scoped to the calling user's own session and is subject to RLS. It never uses the
 * service-role key.
 *
 * `setAll` may be called from a Server Component (where cookie writes are not permitted); the
 * try/catch below follows the documented @supabase/ssr pattern of ignoring that failure, since
 * session refresh is instead handled by middleware/proxy on the next navigation.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie writes are not permitted there.
            // Safe to ignore: session refresh happens elsewhere (see research.md §2, §4).
          }
        },
      },
    }
  );
}
