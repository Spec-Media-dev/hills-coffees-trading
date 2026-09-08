import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client. Uses only the browser-safe NEXT_PUBLIC_* values — never the
 * service-role key. Use this exclusively from Client Components that need genuine interactive
 * Supabase Auth UI. Server Components, Server Actions, and Route Handlers must use
 * lib/supabase/server.ts instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
