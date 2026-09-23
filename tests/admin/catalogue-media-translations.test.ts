import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hardening run — catalogue coffee images (`uploadCoffeeImage` / `removeCoffeeImage`) and Arabic
 * catalogue content (`saveArabicTranslation`). Unit-level with a mocked Supabase client: the
 * migration that backs these RPCs (`20260923120000_catalogue_media_and_translations`) is NOT applied
 * this run, so the live proof is deferred to after the human review/apply; these tests prove the
 * application-side ordering, refusals and orphan cleanup, and pin the migration's own guards.
 */

const access = vi.hoisted(() => ({ current: { ok: true, identity: { userId: "admin-1" } } as Record<string, unknown> }));
const db = vi.hoisted(() => ({
  coffee: { id: "11111111-1111-4111-8111-111111111111", slug: "yirgacheffe" } as Record<string, string> | null,
  mediaTarget: { id: "22222222-2222-4222-8222-222222222222" } as Record<string, string> | null,
  mediaCount: 0,
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  storageBuckets: [] as string[],
}));
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/guards", () => ({ checkRoleFunctionAccess: async () => access.current }));
vi.mock("next/cache", () => ({ revalidateTag, revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      let head = false;
      for (const method of ["eq", "neq", "order", "limit", "in", "range"]) builder[method] = () => builder;
      builder.select = (_columns: string, options?: { head?: boolean }) => {
        head = Boolean(options?.head);
        return builder;
      };
      builder.maybeSingle = async () => ({ data: table === "coffees" ? db.coffee : table === "origins" ? { slug: "sidamo" } : table === "coffee_media" ? db.mediaTarget : null, error: null });
      builder.then = (resolve: (value: unknown) => unknown) => resolve(head ? { count: db.mediaCount, error: null } : { data: [], error: null });
      return builder;
    },
    rpc: db.rpc,
    storage: {
      from(bucket: string) {
        db.storageBuckets.push(bucket);
        return { upload: db.upload, remove: db.remove };
      },
    },
  }),
}));

const COFFEE_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";

function image(type = "image/webp", size = 1024): File {
  return new File([new Uint8Array(size)], "bean.webp", { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  access.current = { ok: true, identity: { userId: "admin-1" } };
  db.coffee = { id: COFFEE_ID, slug: "yirgacheffe" };
  db.mediaTarget = { id: MEDIA_ID };
  db.mediaCount = 0;
  db.storageBuckets = [];
  db.upload.mockResolvedValue({ data: {}, error: null });
  db.remove.mockResolvedValue({ data: [], error: null });
  db.rpc.mockResolvedValue({ data: MEDIA_ID, error: null });
});

async function catalogue() {
  return import("@/lib/admin/catalogue");
}

describe("uploadCoffeeImage", () => {
  it("refuses a non-catalogue role and an anonymous caller before any Storage or RPC call", async () => {
    access.current = { ok: false, denial: "forbidden" };
    expect(await (await catalogue()).uploadCoffeeImage(COFFEE_ID, image())).toMatchObject({ ok: false, code: "catalogue_not_capable" });
    access.current = { ok: false, denial: "anonymous" };
    expect(await (await catalogue()).uploadCoffeeImage(COFFEE_ID, image())).toMatchObject({ ok: false, code: "profile_auth_required" });
    expect(db.upload).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("refuses a non-image MIME type and an oversize file", async () => {
    const { uploadCoffeeImage } = await catalogue();
    expect(await uploadCoffeeImage(COFFEE_ID, image("image/svg+xml"))).toMatchObject({ ok: false, code: "catalogue_media_invalid_file" });
    expect(await uploadCoffeeImage(COFFEE_ID, image("image/png", 5 * 1024 * 1024 + 1))).toMatchObject({ ok: false, code: "catalogue_media_invalid_file" });
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("refuses at the image limit", async () => {
    db.mediaCount = 12;
    expect(await (await catalogue()).uploadCoffeeImage(COFFEE_ID, image())).toMatchObject({ ok: false, code: "catalogue_media_limit_reached" });
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("uploads to public-assets under catalogue/{coffeeId}/ with a MIME-derived extension, then attaches via RPC and revalidates the coffee's public tags", async () => {
    const result = await (await catalogue()).uploadCoffeeImage(COFFEE_ID, image("image/webp"));
    expect(result).toMatchObject({ ok: true, code: "catalogue_media_uploaded" });
    expect(db.storageBuckets.every((bucket) => bucket === "public-assets")).toBe(true);
    const [path, , options] = db.upload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^catalogue/${COFFEE_ID}/\\d+-[0-9a-f]{8}\\.webp$`));
    expect(options).toMatchObject({ contentType: "image/webp", upsert: false });
    expect(db.rpc).toHaveBeenCalledWith("attach_coffee_media", expect.objectContaining({ p_coffee_id: COFFEE_ID, p_object_path: path, p_mime_type: "image/webp" }));
    expect(revalidateTag).toHaveBeenCalledWith("public-coffee:yirgacheffe", { expire: 0 });
  });

  it("removes the just-uploaded object when the DB link fails (no orphan), and maps the DB limit", async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "coffee_media_limit_reached" } });
    const result = await (await catalogue()).uploadCoffeeImage(COFFEE_ID, image());
    expect(result).toMatchObject({ ok: false, code: "catalogue_media_limit_reached" });
    const [uploadedPath] = db.upload.mock.calls[0]!;
    expect(db.remove).toHaveBeenCalledWith([uploadedPath]);
  });
});

describe("removeCoffeeImage", () => {
  it("removes through the RPC, then deletes only an object under this coffee's own prefix", async () => {
    db.rpc.mockResolvedValue({ data: `catalogue/${COFFEE_ID}/1.webp`, error: null });
    const result = await (await catalogue()).removeCoffeeImage({ coffeeId: COFFEE_ID, mediaId: MEDIA_ID });
    expect(result).toMatchObject({ ok: true, code: "catalogue_media_removed" });
    expect(db.rpc).toHaveBeenCalledWith("remove_coffee_media", { p_media_id: MEDIA_ID });
    expect(db.remove).toHaveBeenCalledWith([`catalogue/${COFFEE_ID}/1.webp`]);
  });

  it("never deletes a Storage object outside the coffee's prefix (legacy/foreign path)", async () => {
    db.rpc.mockResolvedValue({ data: "avatars/someone/1.webp", error: null });
    await (await catalogue()).removeCoffeeImage({ coffeeId: COFFEE_ID, mediaId: MEDIA_ID });
    expect(db.remove).not.toHaveBeenCalled();
  });

  it("refuses a media id that does not belong to the coffee", async () => {
    db.mediaTarget = null;
    expect(await (await catalogue()).removeCoffeeImage({ coffeeId: COFFEE_ID, mediaId: MEDIA_ID })).toMatchObject({ ok: false, code: "catalogue_not_found" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("saveArabicTranslation — Arabic is its own row; English is never touched", () => {
  it("writes ONLY the ar locale through set_catalogue_translation and revalidates the coffee", async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    const result = await (await catalogue()).saveArabicTranslation({ kind: "coffee", entityId: COFFEE_ID, name: "يرغاتشيفي", description: "قهوة مغسولة" });
    expect(result).toMatchObject({ ok: true });
    expect(db.rpc).toHaveBeenCalledWith("set_catalogue_translation", { p_kind: "coffee", p_entity_id: COFFEE_ID, p_locale: "ar", p_name: "يرغاتشيفي", p_description: "قهوة مغسولة" });
    expect(revalidateTag).toHaveBeenCalledWith("public-coffee:yirgacheffe", { expire: 0 });
  });

  it("taxonomy kinds send no description; a description on them is a validation error", async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    const { saveArabicTranslation } = await catalogue();
    await saveArabicTranslation({ kind: "processing", entityId: COFFEE_ID, name: "مغسولة" });
    expect(db.rpc).toHaveBeenCalledWith("set_catalogue_translation", expect.objectContaining({ p_kind: "processing", p_locale: "ar", p_description: null }));
    expect(await saveArabicTranslation({ kind: "region", entityId: COFFEE_ID, name: "سيدامو", description: "x" })).toMatchObject({ ok: false, code: "validation_error" });
  });

  it("refuses a non-admin before the RPC", async () => {
    access.current = { ok: false, denial: "forbidden" };
    expect(await (await catalogue()).saveArabicTranslation({ kind: "coffee", entityId: COFFEE_ID, name: "اسم" })).toMatchObject({ ok: false, code: "catalogue_not_capable" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("migration 20260923120000 — guards pinned at the source (not applied this run)", () => {
  const sql = readFileSync("supabase/migrations/20260923120000_catalogue_media_and_translations.sql", "utf8");
  const rollback = readFileSync("supabase/rollback/20260923120000_catalogue_media_and_translations.rollback.sql", "utf8");

  it("every new RPC is SECURITY DEFINER, pins search_path, re-checks is_platform_admin() and is not executable by anon", () => {
    for (const fn of ["attach_coffee_media", "remove_coffee_media", "set_catalogue_translation"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}(`));
      expect(body.slice(0, 1200), fn).toMatch(/security definer/i);
      expect(body.slice(0, 1200), fn).toMatch(/set search_path = pg_catalog, public, auth/);
      expect(body.slice(0, 2200), fn).toMatch(/not public\.is_platform_admin\(\)/);
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`, "i"));
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`, "i"));
      expect(sql, fn).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to [^;]*anon`, "i"));
    }
  });

  it("attach_coffee_media validates path prefix, MIME, size and count; storage writes under catalogue/ need is_platform_admin()", () => {
    expect(sql).toContain("coffee_media_object_path_invalid");
    expect(sql).toContain("coffee_media_type_invalid");
    expect(sql).toContain("coffee_media_size_invalid");
    expect(sql).toContain("coffee_media_limit_reached");
    expect(sql).toMatch(/if v_parts\[1\] = 'catalogue' then\s+return array_length\(v_parts, 1\) >= 3 and public\.is_platform_admin\(\);/);
  });

  it("the public image view is a security_barrier view of PUBLISHED, non-private public-assets rows only", () => {
    expect(sql).toMatch(/create view public\.public_coffee_images\s+with \(security_barrier\s*=\s*true\)/i);
    expect(sql).toMatch(/c\.status = 'PUBLISHED'/);
    expect(sql).toMatch(/fa\.bucket_name = 'public-assets'/);
    expect(sql).toMatch(/fa\.is_private = false/);
  });

  it("no DELETE grant to authenticated anywhere; the rollback reverses every object", () => {
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*to authenticated/i);
    for (const object of ["set_catalogue_translation", "remove_coffee_media", "attach_coffee_media", "public_coffee_images", "coffee_media_one_primary_per_coffee_idx", "region_translations", "packaging_type_translations"]) {
      expect(rollback, object).toContain(object);
    }
  });
});
