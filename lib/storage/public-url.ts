/**
 * Feature 010 RUN F010-ACCOUNT-MEDIA — constructs a public Storage URL for an object in the
 * `public-assets` bucket (avatars, platform branding). Safe in any context (client or server): reads
 * only `NEXT_PUBLIC_SUPABASE_URL`, never a secret. `public-assets` is a genuinely PUBLIC bucket
 * (`public: true` in the migration), so this URL needs no signature and no authenticated request —
 * exactly like every other public Storage URL Supabase itself serves.
 */
export function publicAssetUrl(objectPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/public-assets/${objectPath}`;
}
