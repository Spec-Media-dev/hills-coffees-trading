import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 T047 — platform branding (logo). Genuinely blocked on the unapplied migration this run
 * (`platform_settings` does not exist in the live database yet — `20260922130000_feature_010_
 * branding_avatar_listing_media.sql`); `getPlatformLogoPath()` returns `null` (the honest "no custom
 * logo configured" state) until it is applied, exactly matching the fallback-to-default behavior the
 * public site header already needs regardless.
 *
 * `getPlatformLogoPath()` is called from the PUBLIC site header — it deliberately never throws: a
 * missing table, an RLS refusal, or any other read failure all degrade to the SAME `null` (fall back
 * to the static default logo), never a broken public page.
 */
export async function getPlatformLogoPath(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("platform_settings").select("logo_object_path").eq("id", true).maybeSingle();
    if (error || !data) return null;
    return data.logo_object_path ?? null;
  } catch {
    return null;
  }
}
