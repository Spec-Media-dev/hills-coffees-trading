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

/**
 * Pre-Stripe hardening run — MEDIA DISPLAY RULE for listing CARDS ("primary outside"): ONE image per
 * offer — the seller's primary, or (defensively) the first image in sort order — signed in a single
 * batch under the caller's own session. Offers without images are simply absent from the map (the
 * card keeps its placeholder). Never throws: any failure yields an empty map.
 */
export function pickPrimaryOfferMedia<T extends { sortOrder: number; isPrimary: boolean }>(items: readonly T[]): T | null {
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  return ordered.find((item) => item.isPrimary) ?? ordered[0] ?? null;
}

export async function getPrimaryOfferImages(offerIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(offerIds)].filter(Boolean);
  if (ids.length === 0) return out;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coffee_offer_media")
      .select("offer_id, sort_order, is_primary, file_assets(object_path)")
      .in("offer_id", ids);
    if (error || !data) return out;

    const byOffer = new Map<string, { sortOrder: number; isPrimary: boolean; objectPath: string }[]>();
    for (const row of data) {
      const file = Array.isArray(row.file_assets) ? row.file_assets[0] : row.file_assets;
      if (!file?.object_path) continue;
      const list = byOffer.get(row.offer_id as string) ?? [];
      list.push({ sortOrder: row.sort_order as number, isPrimary: row.is_primary as boolean, objectPath: file.object_path as string });
      byOffer.set(row.offer_id as string, list);
    }
    const primaries = [...byOffer.entries()].map(([offerId, items]) => [offerId, pickPrimaryOfferMedia(items)] as const).filter((entry): entry is readonly [string, { sortOrder: number; isPrimary: boolean; objectPath: string }] => entry[1] !== null);
    if (primaries.length === 0) return out;

    const { data: signed } = await supabase.storage.from("listing-media").createSignedUrls(primaries.map(([, item]) => item.objectPath), SIGNED_URL_TTL_SECONDS);
    const urlByPath = new Map((signed ?? []).filter((entry) => entry.signedUrl && entry.path).map((entry) => [entry.path as string, entry.signedUrl]));
    for (const [offerId, item] of primaries) {
      const url = urlByPath.get(item.objectPath);
      if (url) out.set(offerId, url);
    }
    return out;
  } catch {
    return out;
  }
}
