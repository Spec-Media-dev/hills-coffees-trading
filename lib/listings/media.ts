import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 approved scope addition (Part 6, 2026-09-22) — seller-owned listing image reads.
 * RLS-scoped (`coffee_offer_media_owner_or_admin_read`/`coffee_offer_media_member_read`) — genuinely
 * blocked on the unapplied migration this run (the table does not exist in the live database yet);
 * `getOfferMedia` degrades to an empty list rather than throwing, matching this file's own honest
 * "not yet available" discipline elsewhere in the codebase.
 *
 * `listing-media` is a PRIVATE bucket (unlike `public-assets`) — its objects have no public URL, by
 * design (a draft listing's images must never leak; see the migration's own header). Every item's
 * `signedUrl` is generated SERVER-SIDE, here, using the caller's own RLS-respecting session (the same
 * `listing_media_select` policy that gates a direct authenticated read also gates who this function
 * can successfully sign a URL for) — never a raw path the client would have to construct its own
 * (unreachable) public URL from.
 */
export type OfferMediaItem = {
  id: string;
  signedUrl: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  isPrimary: boolean;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — regenerated fresh on every render, never cached.

export async function getOfferMedia(offerId: string): Promise<readonly OfferMediaItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coffee_offer_media")
      .select("id, sort_order, is_primary, file_assets(object_path, original_name, mime_type, size_bytes)")
      .eq("offer_id", offerId)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];

    const rows = data
      .map((row) => {
        const file = Array.isArray(row.file_assets) ? row.file_assets[0] : row.file_assets;
        if (!file) return null;
        return {
          id: row.id as string,
          objectPath: file.object_path as string,
          originalName: file.original_name as string,
          mimeType: file.mime_type as string,
          sizeBytes: Number(file.size_bytes),
          sortOrder: row.sort_order as number,
          isPrimary: row.is_primary as boolean,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return await Promise.all(
      rows.map(async ({ objectPath, ...rest }) => {
        const { data: signed } = await supabase.storage.from("listing-media").createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
        return { ...rest, signedUrl: signed?.signedUrl ?? null };
      })
    );
  } catch {
    return [];
  }
}
