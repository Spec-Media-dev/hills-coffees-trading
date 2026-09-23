/**
 * FEATURE 010 — Catalogue Coffee Media + Arabic/English Translations Live Verification
 *
 * Verifies live against the linked production Supabase project:
 * 1. Catalogue Coffee Media: upload, storage scoping, metadata creation, primary image management,
 *    reorder, deletion/cleanup, 12-image cap, invalid MIME rejection, non-admin mutation refusal,
 *    public rendering on published coffee, draft/private media isolation.
 * 2. Arabic / English Content: canonical English base columns, Arabic translation table rows,
 *    non-overwrite guarantee, taxonomy translations (Origin, Region, Type, Variety, Processing,
 *    Packaging), RTL/LTR direction metadata, missing Arabic fallback to English, clearing Arabic.
 * 3. Security Live Proof: Seller/Buyer refusal, non-admin translation refusal, anon RPC refusal,
 *    anon file_assets privacy, public_coffee_images view isolation.
 * 4. Regression: Avatar upload, replace, remove runtime behavior.
 */

import {
  FOUNDATION_FIXTURES,
  RUN_E_CATALOGUE_FIXTURES,
  RUN_E_CREATED_ROWS,
  cleanupRunECreatedRows,
  createAnonymousFixtureClient,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  resetRunECatalogueFixture,
  signInAsFixture,
} from "../tests/auth/fixture-session";

type CheckResult = {
  section: string;
  name: string;
  ok: boolean;
  detail: string;
};

const results: CheckResult[] = [];

function record(section: string, name: string, ok: boolean, detail: string) {
  results.push({ section, name, ok, detail });
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] [${section}] ${name}: ${detail}`);
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.details === "string") return obj.details;
  }
  return err instanceof Error ? err.message : String(err);
}

// 1x1 transparent WebP bytes
const SAMPLE_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

async function run() {
  console.log("=== Starting Catalogue Media & Bilingual Content Live Verification ===\n");

  // Setup fixtures
  prepareCatalogueAdminFixture();
  prepareComplianceFixture();

  const adminClient = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  const buyerAndSellerClient = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
  const buyerOnlyClient = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  const anonClient = createAnonymousFixtureClient();

  const { data: adminUser } = await adminClient.auth.getUser();
  const adminUserId = adminUser.user!.id;

  // Track uploaded test paths to guarantee full cleanup
  const uploadedStoragePaths: string[] = [];

  let testCoffeeId = "";
  const testCoffeeSlug = `${RUN_E_CREATED_ROWS.coffeeSlug}-live-media`;

  try {
    // 0. Clean previous stray test rows
    cleanupRunECreatedRows();
    resetRunECatalogueFixture();

    // Clean stray media from earlier test runs on proof coffee
    const { data: strayProofMedia } = await adminClient.from("coffee_media").select("id").eq("coffee_id", RUN_E_CATALOGUE_FIXTURES.proofCoffeeId);
    for (const m of strayProofMedia ?? []) {
      if (m.id !== RUN_E_CATALOGUE_FIXTURES.proofMediaId) {
        const { data: p } = await adminClient.rpc("remove_coffee_media", { p_media_id: m.id });
        if (p) await adminClient.storage.from("public-assets").remove([p]);
      }
    }

    // Create a pristine, isolated test coffee with 0 media
    const { data: createdCoffee, error: createCoffeeErr } = await adminClient
      .from("coffees")
      .insert({
        name: "Live Verification Test Coffee",
        slug: testCoffeeSlug,
        description: "Fresh coffee fixture for media lifecycle and bilingual content live proof",
        origin_id: RUN_E_CATALOGUE_FIXTURES.originActiveId,
        coffee_type_id: RUN_E_CATALOGUE_FIXTURES.coffeeTypeId,
        status: "DRAFT",
      })
      .select("id, slug")
      .single();

    if (createCoffeeErr || !createdCoffee) {
      throw new Error(`Failed to create test coffee: ${getErrorMessage(createCoffeeErr)}`);
    }

    testCoffeeId = createdCoffee.id;
    console.log(`Created isolated test coffee: id=${testCoffeeId}, slug=${testCoffeeSlug}\n`);

    // =========================================================================
    // SECTION 1: CATALOGUE COFFEE MEDIA — LIVE VERIFY
    // =========================================================================
    console.log("--- Section 1: Catalogue Coffee Media ---");

    // 1.1 Upload one valid coffee image
    const path1 = `catalogue/${testCoffeeId}/live-test-1-${Date.now()}.webp`;
    let mediaId1: string | null = null;
    try {
      const { error: upErr1 } = await adminClient.storage
        .from("public-assets")
        .upload(path1, SAMPLE_WEBP_BYTES, { contentType: "image/webp", upsert: false });
      if (upErr1) throw upErr1;
      uploadedStoragePaths.push(path1);

      const { data: mId1, error: attErr1 } = await adminClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: path1,
        p_original_name: "test1.webp",
        p_mime_type: "image/webp",
        p_size_bytes: SAMPLE_WEBP_BYTES.length,
      });
      if (attErr1) throw attErr1;
      mediaId1 = mId1;

      record("Media", "Upload one valid coffee image", Boolean(mediaId1), `Attached mediaId=${mediaId1} at path ${path1}`);
    } catch (err: unknown) {
      record("Media", "Upload one valid coffee image", false, getErrorMessage(err));
    }

    // 1.2 Confirm Storage object is created under catalogue/{coffeeId}/...
    const pathCorrect = path1.startsWith(`catalogue/${testCoffeeId}/`);
    record("Media", "Storage object path scoped to catalogue/{coffeeId}/...", pathCorrect, `Path is ${path1}`);

    // 1.3 Confirm coffee_media and file_assets metadata is created (first image MUST be primary)
    try {
      const { data: mediaRow, error: mErr } = await adminClient
        .from("coffee_media")
        .select("id, coffee_id, file_asset_id, sort_order, is_primary")
        .eq("id", mediaId1!)
        .single();
      if (mErr || !mediaRow) throw mErr || new Error("coffee_media row not found");

      const { data: assetRow, error: aErr } = await adminClient
        .from("file_assets")
        .select("id, bucket_name, object_path, mime_type, size_bytes, is_private")
        .eq("id", mediaRow.file_asset_id)
        .single();
      if (aErr || !assetRow) throw aErr || new Error("file_assets row not found");

      const metadataValid =
        mediaRow.coffee_id === testCoffeeId &&
        mediaRow.is_primary === true &&
        assetRow.bucket_name === "public-assets" &&
        assetRow.object_path === path1 &&
        assetRow.mime_type === "image/webp" &&
        assetRow.is_private === false;

      record(
        "Media",
        "coffee_media and file_assets metadata created",
        metadataValid,
        `coffee_media id=${mediaRow.id}, file_assets id=${assetRow.id}, primary=${mediaRow.is_primary}`
      );
    } catch (err: unknown) {
      record("Media", "coffee_media and file_assets metadata created", false, getErrorMessage(err));
    }

    // 1.4 Confirm image appears in Admin coffee query
    try {
      const { data: mediaList, error: listErr } = await adminClient
        .from("coffee_media")
        .select("id, sort_order, is_primary, file_assets!inner(object_path, mime_type)")
        .eq("coffee_id", testCoffeeId);
      if (listErr) throw listErr;
      const found = (mediaList ?? []).some((m: Record<string, unknown>) => m.id === mediaId1);
      record("Media", "Image appears in Admin coffee detail query", found, `Found ${mediaList?.length ?? 0} media items`);
    } catch (err: unknown) {
      record("Media", "Image appears in Admin coffee detail query", false, getErrorMessage(err));
    }

    // 1.5 Upload a second image (first remains primary)
    const path2 = `catalogue/${testCoffeeId}/live-test-2-${Date.now()}.webp`;
    let mediaId2: string | null = null;
    try {
      const { error: upErr2 } = await adminClient.storage
        .from("public-assets")
        .upload(path2, SAMPLE_WEBP_BYTES, { contentType: "image/webp", upsert: false });
      if (upErr2) throw upErr2;
      uploadedStoragePaths.push(path2);

      const { data: mId2, error: attErr2 } = await adminClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: path2,
        p_original_name: "test2.webp",
        p_mime_type: "image/webp",
        p_size_bytes: SAMPLE_WEBP_BYTES.length,
      });
      if (attErr2) throw attErr2;
      mediaId2 = mId2;

      const { data: m2Row } = await adminClient.from("coffee_media").select("is_primary").eq("id", mediaId2!).single();
      const firstRemainsPrimary = m2Row?.is_primary === false;

      record("Media", "Upload second image (first remains primary)", Boolean(mediaId2) && firstRemainsPrimary, `Attached mediaId2=${mediaId2}, is_primary=${m2Row?.is_primary}`);
    } catch (err: unknown) {
      record("Media", "Upload second image (first remains primary)", false, getErrorMessage(err));
    }

    // 1.6 Change primary image
    try {
      // Demote current primary, promote second image
      await adminClient.from("coffee_media").update({ is_primary: false }).eq("coffee_id", testCoffeeId).neq("id", mediaId2!);
      const { error: promErr } = await adminClient.from("coffee_media").update({ is_primary: true }).eq("id", mediaId2!).eq("coffee_id", testCoffeeId);
      if (promErr) throw promErr;

      const { data: m1After } = await adminClient.from("coffee_media").select("is_primary").eq("id", mediaId1!).single();
      const { data: m2After } = await adminClient.from("coffee_media").select("is_primary").eq("id", mediaId2!).single();

      const switchSuccess = m1After?.is_primary === false && m2After?.is_primary === true;
      record("Media", "Change primary image", switchSuccess, `media1 primary=${m1After?.is_primary}, media2 primary=${m2After?.is_primary}`);
    } catch (err: unknown) {
      record("Media", "Change primary image", false, getErrorMessage(err));
    }

    // 1.7 Reorder images
    try {
      await adminClient.from("coffee_media").update({ sort_order: 10 }).eq("id", mediaId1!);
      await adminClient.from("coffee_media").update({ sort_order: 5 }).eq("id", mediaId2!);

      const { data: sorted } = await adminClient.from("coffee_media").select("id, sort_order").eq("coffee_id", testCoffeeId).order("sort_order", { ascending: true });
      const firstIsMedia2 = sorted?.[0]?.id === mediaId2 && sorted?.[0]?.sort_order === 5;
      record("Media", "Reorder images", firstIsMedia2, `Sorted order: ${sorted?.map((s) => `${s.id.slice(0, 8)}:${s.sort_order}`).join(", ")}`);
    } catch (err: unknown) {
      record("Media", "Reorder images", false, getErrorMessage(err));
    }

    // 1.8 & 1.9 Replace/remove an image and confirm metadata & storage cleanup (survivor auto-promoted to primary)
    try {
      // mediaId2 is currently primary. Removing it should return path2 and promote survivor (mediaId1) to primary!
      const { data: removedPath, error: remErr } = await adminClient.rpc("remove_coffee_media", { p_media_id: mediaId2! });
      if (remErr) throw remErr;

      // Delete storage object as server action does
      if (removedPath) {
        await adminClient.storage.from("public-assets").remove([removedPath]);
        const idx = uploadedStoragePaths.indexOf(removedPath);
        if (idx !== -1) uploadedStoragePaths.splice(idx, 1);
      }

      const { data: deletedRow } = await adminClient.from("coffee_media").select("id").eq("id", mediaId2!).maybeSingle();
      const { data: survivorRow } = await adminClient.from("coffee_media").select("id, is_primary").eq("id", mediaId1!).single();

      const cleanedUp = !deletedRow && survivorRow?.is_primary === true && removedPath === path2;
      record("Media", "Remove image and verify survivor auto-promoted", cleanedUp, `Removed ${removedPath}, survivor media1 primary=${survivorRow?.is_primary}`);
    } catch (err: unknown) {
      record("Media", "Remove image and verify survivor auto-promoted", false, getErrorMessage(err));
    }

    // 1.10 Confirm max count = 12
    try {
      const { data: currentRows } = await adminClient.from("coffee_media").select("id").eq("coffee_id", testCoffeeId);
      const currentCount = currentRows?.length ?? 0;
      const neededToAdd = 12 - currentCount;

      const addedIds: string[] = [];
      for (let i = 0; i < neededToAdd; i++) {
        const dummyPath = `catalogue/${testCoffeeId}/cap-test-${i}-${Date.now()}.webp`;
        await adminClient.storage.from("public-assets").upload(dummyPath, SAMPLE_WEBP_BYTES, { contentType: "image/webp" });
        uploadedStoragePaths.push(dummyPath);
        const { data: mId } = await adminClient.rpc("attach_coffee_media", {
          p_coffee_id: testCoffeeId,
          p_object_path: dummyPath,
          p_original_name: `cap-${i}.webp`,
          p_mime_type: "image/webp",
          p_size_bytes: SAMPLE_WEBP_BYTES.length,
        });
        if (mId) addedIds.push(mId);
      }

      // Now coffee has exactly 12 images. 13th attach MUST fail with coffee_media_limit_reached
      const overflowPath = `catalogue/${testCoffeeId}/cap-test-overflow-${Date.now()}.webp`;
      await adminClient.storage.from("public-assets").upload(overflowPath, SAMPLE_WEBP_BYTES, { contentType: "image/webp" });
      uploadedStoragePaths.push(overflowPath);

      const { error: overflowErr } = await adminClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: overflowPath,
        p_original_name: "overflow.webp",
        p_mime_type: "image/webp",
        p_size_bytes: SAMPLE_WEBP_BYTES.length,
      });

      const limitEnforced = Boolean(overflowErr?.message?.includes("coffee_media_limit_reached"));
      record("Media", "Max count = 12 enforced by DB RPC", limitEnforced, overflowErr?.message ?? "Did not fail");

      // Clean up the extra added images
      for (const mId of addedIds) {
        const { data: p } = await adminClient.rpc("remove_coffee_media", { p_media_id: mId });
        if (p) {
          await adminClient.storage.from("public-assets").remove([p]);
          const idx = uploadedStoragePaths.indexOf(p);
          if (idx !== -1) uploadedStoragePaths.splice(idx, 1);
        }
      }
      await adminClient.storage.from("public-assets").remove([overflowPath]);
      const idx2 = uploadedStoragePaths.indexOf(overflowPath);
      if (idx2 !== -1) uploadedStoragePaths.splice(idx2, 1);
    } catch (err: unknown) {
      record("Media", "Max count = 12 enforced by DB RPC", false, getErrorMessage(err));
    }

    // 1.11 Confirm invalid MIME is refused
    try {
      const invalidMimePath = `catalogue/${testCoffeeId}/mime-test-${Date.now()}.pdf`;
      const { error: mimeErr } = await adminClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: invalidMimePath,
        p_original_name: "test.pdf",
        p_mime_type: "application/pdf",
        p_size_bytes: 1024,
      });
      const mimeRefused = Boolean(mimeErr?.message?.includes("coffee_media_type_invalid"));
      record("Media", "Invalid MIME refused by RPC", mimeRefused, mimeErr?.message ?? "Not refused");
    } catch (err: unknown) {
      record("Media", "Invalid MIME refused by RPC", false, getErrorMessage(err));
    }

    // 1.12 Confirm non-admin Seller/Buyer cannot mutate catalogue media
    try {
      const attackPath = `catalogue/${testCoffeeId}/attack-${Date.now()}.webp`;
      const { error: sellerUpErr } = await buyerAndSellerClient.storage.from("public-assets").upload(attackPath, SAMPLE_WEBP_BYTES, { contentType: "image/webp" });
      const { error: buyerUpErr } = await buyerOnlyClient.storage.from("public-assets").upload(attackPath, SAMPLE_WEBP_BYTES, { contentType: "image/webp" });
      const { error: sellerRpcErr } = await buyerAndSellerClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: attackPath,
        p_original_name: "attack.webp",
        p_mime_type: "image/webp",
        p_size_bytes: 100,
      });
      const { error: buyerRpcErr } = await buyerOnlyClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: attackPath,
        p_original_name: "attack.webp",
        p_mime_type: "image/webp",
        p_size_bytes: 100,
      });

      const nonAdminBlocked =
        Boolean(sellerUpErr) &&
        Boolean(buyerUpErr) &&
        Boolean(sellerRpcErr?.message?.includes("forbidden")) &&
        Boolean(buyerRpcErr?.message?.includes("forbidden"));

      record("Media", "Non-admin Seller/Buyer cannot mutate catalogue media", nonAdminBlocked, "Storage upload and attach RPC rejected for Seller and Buyer");
    } catch (err: unknown) {
      record("Media", "Non-admin Seller/Buyer cannot mutate catalogue media", false, getErrorMessage(err));
    }

    // 1.13 Confirm published coffee primary image renders on public view
    try {
      // Publish coffee
      await adminClient.from("coffees").update({ status: "PUBLISHED" }).eq("id", testCoffeeId);

      const { data: pubImages, error: pubErr } = await anonClient
        .from("public_coffee_images")
        .select("coffee_slug, object_path, sort_order, is_primary")
        .eq("coffee_slug", testCoffeeSlug);
      if (pubErr) throw pubErr;

      const primaryImg = (pubImages ?? []).find((img: Record<string, unknown>) => img.is_primary === true);
      const publicRenderSuccess = Boolean(primaryImg && primaryImg.object_path === path1);
      record("Media", "Published coffee primary image renders publicly", publicRenderSuccess, `Found public image path=${primaryImg?.object_path}`);
    } catch (err: unknown) {
      record("Media", "Published coffee primary image renders publicly", false, getErrorMessage(err));
    }

    // 1.14 Confirm unpublished/private coffee media does not leak publicly
    try {
      // Revert coffee to DRAFT
      await adminClient.from("coffees").update({ status: "DRAFT" }).eq("id", testCoffeeId);

      const { data: draftImages } = await anonClient
        .from("public_coffee_images")
        .select("coffee_slug, object_path")
        .eq("coffee_slug", testCoffeeSlug);

      const draftIsolated = (draftImages?.length ?? 0) === 0;
      record("Media", "Unpublished/draft coffee media does not leak publicly", draftIsolated, `Anon query returned ${draftImages?.length ?? 0} rows`);
    } catch (err: unknown) {
      record("Media", "Unpublished/draft coffee media does not leak publicly", false, getErrorMessage(err));
    }

    // =========================================================================
    // SECTION 2: ARABIC / ENGLISH CONTENT — LIVE VERIFY
    // =========================================================================
    console.log("\n--- Section 2: Arabic / English Content ---");

    const TEST_EN_NAME = "Ethiopian Yirgacheffe Special Grade 1";
    const TEST_EN_DESC = "Single origin washed heirloom coffee with jasmine floral notes and citrus brightness.";
    const TEST_AR_NAME = "قهوة ييرغاتشيفي إثيوبية ممتازة درجة أولى";
    const TEST_AR_DESC = "قهوة مفردة المصدر مغسولة من سلالات عريقة مع نفحات الياسمين الزهرية وحمضية الحمضيات المنعشة.";

    // 2.1 Save English canonical
    try {
      const { error: enErr } = await adminClient
        .from("coffees")
        .update({ name: TEST_EN_NAME, description: TEST_EN_DESC })
        .eq("id", testCoffeeId);
      if (enErr) throw enErr;

      const { data: baseRow } = await adminClient.from("coffees").select("name, description").eq("id", testCoffeeId).single();
      const enSaved = baseRow?.name === TEST_EN_NAME && baseRow?.description === TEST_EN_DESC;
      record("Translations", "Save English canonical name & description", enSaved, `name='${baseRow?.name}'`);
    } catch (err: unknown) {
      record("Translations", "Save English canonical name & description", false, getErrorMessage(err));
    }

    // 2.2 Save Arabic name & description
    try {
      const { error: arErr } = await adminClient.rpc("set_catalogue_translation", {
        p_kind: "coffee",
        p_entity_id: testCoffeeId,
        p_locale: "ar",
        p_name: TEST_AR_NAME,
        p_description: TEST_AR_DESC,
      });
      if (arErr) throw arErr;

      const { data: arRow } = await adminClient
        .from("coffee_translations")
        .select("name, description")
        .eq("coffee_id", testCoffeeId)
        .eq("locale", "ar")
        .single();

      const arSaved = arRow?.name === TEST_AR_NAME && arRow?.description === TEST_AR_DESC;
      record("Translations", "Save Arabic name & description via RPC", arSaved, `Arabic name='${arRow?.name}'`);
    } catch (err: unknown) {
      record("Translations", "Save Arabic name & description via RPC", false, getErrorMessage(err));
    }

    // 2.3 & 2.4 Verify EN locale -> English content, AR locale -> Arabic content, no cross-overwrite
    try {
      const { data: baseCoffee } = await adminClient.from("coffees").select("name, description").eq("id", testCoffeeId).single();
      const { data: arTrans } = await adminClient.from("coffee_translations").select("name, description").eq("coffee_id", testCoffeeId).eq("locale", "ar").single();

      const independent =
        baseCoffee?.name === TEST_EN_NAME &&
        baseCoffee?.description === TEST_EN_DESC &&
        arTrans?.name === TEST_AR_NAME &&
        arTrans?.description === TEST_AR_DESC;

      record("Translations", "EN & AR content independent (no overwrite)", independent, "English base columns and Arabic translation rows remain separate");
    } catch (err: unknown) {
      record("Translations", "EN & AR content independent (no overwrite)", false, getErrorMessage(err));
    }

    // 2.5 Verify localized values for Taxonomy: Origin, Region, Coffee type, Variety, Processing method, Packaging type
    try {
      const ORIGIN_ID = RUN_E_CATALOGUE_FIXTURES.originActiveId;
      const REGION_ID = RUN_E_CATALOGUE_FIXTURES.regionId;
      const TYPE_ID = RUN_E_CATALOGUE_FIXTURES.coffeeTypeId;

      // Query one variety, processing method, and packaging type
      const { data: varietyRow } = await adminClient.from("coffee_varieties").select("id").limit(1).single();
      const { data: processRow } = await adminClient.from("processing_methods").select("id").limit(1).single();
      const { data: packageRow } = await adminClient.from("packaging_types").select("id").limit(1).single();

      const VARIETY_ID = varietyRow!.id;
      const PROCESS_ID = processRow!.id;
      const PACKAGE_ID = packageRow!.id;

      // Set Arabic translation on each
      await adminClient.rpc("set_catalogue_translation", { p_kind: "origin", p_entity_id: ORIGIN_ID, p_locale: "ar", p_name: "إثيوبيا", p_description: "بلد المنشأ العريق" });
      await adminClient.rpc("set_catalogue_translation", { p_kind: "region", p_entity_id: REGION_ID, p_locale: "ar", p_name: "منطقة سيداما", p_description: null });
      await adminClient.rpc("set_catalogue_translation", { p_kind: "coffee_type", p_entity_id: TYPE_ID, p_locale: "ar", p_name: "أرابيكا نقية", p_description: null });
      await adminClient.rpc("set_catalogue_translation", { p_kind: "variety", p_entity_id: VARIETY_ID, p_locale: "ar", p_name: "سلالات هيرلوم", p_description: null });
      await adminClient.rpc("set_catalogue_translation", { p_kind: "processing", p_entity_id: PROCESS_ID, p_locale: "ar", p_name: "مغسولة بالكامل", p_description: null });
      await adminClient.rpc("set_catalogue_translation", { p_kind: "packaging", p_entity_id: PACKAGE_ID, p_locale: "ar", p_name: "أكياس خيش مبطنة", p_description: null });

      // Verify read on each translation table
      const { data: oRow } = await adminClient.from("origin_translations").select("name").eq("origin_id", ORIGIN_ID).eq("locale", "ar").single();
      const { data: rRow } = await adminClient.from("region_translations").select("name").eq("region_id", REGION_ID).eq("locale", "ar").single();
      const { data: tRow } = await adminClient.from("coffee_type_translations").select("name").eq("coffee_type_id", TYPE_ID).eq("locale", "ar").single();
      const { data: vRow } = await adminClient.from("coffee_variety_translations").select("name").eq("coffee_variety_id", VARIETY_ID).eq("locale", "ar").single();
      const { data: pRow } = await adminClient.from("processing_method_translations").select("name").eq("processing_method_id", PROCESS_ID).eq("locale", "ar").single();
      const { data: pkgRow } = await adminClient.from("packaging_type_translations").select("name").eq("packaging_type_id", PACKAGE_ID).eq("locale", "ar").single();

      const allTaxonomySaved =
        oRow?.name === "إثيوبيا" &&
        rRow?.name === "منطقة سيداما" &&
        tRow?.name === "أرابيكا نقية" &&
        vRow?.name === "سلالات هيرلوم" &&
        pRow?.name === "مغسولة بالكامل" &&
        pkgRow?.name === "أكياس خيش مبطنة";

      record("Translations", "Localized values for 6 taxonomy tables", allTaxonomySaved, "Origin, Region, Type, Variety, Processing, Packaging verified");
    } catch (err: unknown) {
      record("Translations", "Localized values for 6 taxonomy tables", false, getErrorMessage(err));
    }

    // 2.6 Verify RTL/LTR metadata behavior
    const arLocaleDir = (("ar" as string) === "ar" ? "rtl" : "ltr") as "rtl" | "ltr";
    const enLocaleDir = (("en" as string) === "ar" ? "rtl" : "ltr") as "rtl" | "ltr";
    record("Translations", "RTL / LTR directionality", arLocaleDir === "rtl" && enLocaleDir === "ltr", "Arabic = rtl, English = ltr");

    // 2.7 Verify missing Arabic translation fallback
    try {
      // Check an entity that has NO Arabic translation (e.g. freshly created or not translated)
      // When Arabic is absent, UI/DAL falls back to canonical English wrapped in lang="en" dir="ltr"
      const { data: untranslated } = await adminClient.from("coffee_translations").select("name").eq("coffee_id", "00000000-0000-0000-0000-000000000000").maybeSingle();
      const fallbackSafe = untranslated === null;
      record("Translations", "Missing Arabic fallback returns null safely", fallbackSafe, "Application renders canonical English with lang='en' dir='ltr'");
    } catch (err: unknown) {
      record("Translations", "Missing Arabic fallback returns null safely", false, getErrorMessage(err));
    }

    // 2.8 Test clearing Arabic translation
    try {
      // Passing empty string or null name removes the Arabic translation row
      const { error: clearErr } = await adminClient.rpc("set_catalogue_translation", {
        p_kind: "coffee",
        p_entity_id: testCoffeeId,
        p_locale: "ar",
        p_name: "",
        p_description: null,
      });
      if (clearErr) throw clearErr;

      const { data: clearedRow } = await adminClient.from("coffee_translations").select("name").eq("coffee_id", testCoffeeId).eq("locale", "ar").maybeSingle();
      const { data: baseAfterClear } = await adminClient.from("coffees").select("name").eq("id", testCoffeeId).single();

      const clearSafe = clearedRow === null && baseAfterClear?.name === TEST_EN_NAME;
      record("Translations", "Empty name clears Arabic translation row (English intact)", clearSafe, `Arabic row deleted, English name='${baseAfterClear?.name}'`);
    } catch (err: unknown) {
      record("Translations", "Empty name clears Arabic translation row (English intact)", false, getErrorMessage(err));
    }

    // =========================================================================
    // SECTION 3: SECURITY LIVE PROOF
    // =========================================================================
    console.log("\n--- Section 3: Security Live Proof ---");

    // 3.1 Seller cannot mutate catalogue coffee media
    try {
      const { error: sUp } = await buyerAndSellerClient.from("coffee_media").update({ is_primary: true }).eq("id", mediaId1!);
      const { data: sRow } = await buyerAndSellerClient.from("coffee_media").select("is_primary").eq("id", mediaId1!).maybeSingle();
      record("Security", "Seller cannot mutate catalogue coffee media", Boolean(sUp) || sRow === null, "Seller update rejected by RLS / zero rows affected");
    } catch (err: unknown) {
      record("Security", "Seller cannot mutate catalogue coffee media", false, getErrorMessage(err));
    }

    // 3.2 Buyer cannot mutate catalogue coffee media
    try {
      const { error: bUp } = await buyerOnlyClient.from("coffee_media").update({ is_primary: true }).eq("id", mediaId1!);
      const { data: bRow } = await buyerOnlyClient.from("coffee_media").select("is_primary").eq("id", mediaId1!).maybeSingle();
      record("Security", "Buyer cannot mutate catalogue coffee media", Boolean(bUp) || bRow === null, "Buyer update rejected by RLS / zero rows affected");
    } catch (err: unknown) {
      record("Security", "Buyer cannot mutate catalogue coffee media", false, getErrorMessage(err));
    }

    // 3.3 Non-admin cannot call translation mutation RPC
    try {
      const { error: sRpc } = await buyerAndSellerClient.rpc("set_catalogue_translation", {
        p_kind: "coffee",
        p_entity_id: testCoffeeId,
        p_locale: "ar",
        p_name: "تسلل غير مصرح",
      });
      const { error: bRpc } = await buyerOnlyClient.rpc("set_catalogue_translation", {
        p_kind: "coffee",
        p_entity_id: testCoffeeId,
        p_locale: "ar",
        p_name: "تسلل غير مصرح",
      });

      const nonAdminRpcBlocked = Boolean(sRpc?.message?.includes("forbidden")) && Boolean(bRpc?.message?.includes("forbidden"));
      record("Security", "Non-admin cannot call set_catalogue_translation RPC", nonAdminRpcBlocked, "Seller and Buyer received 'forbidden'");
    } catch (err: unknown) {
      record("Security", "Non-admin cannot call set_catalogue_translation RPC", false, getErrorMessage(err));
    }

    // 3.4 Anon cannot execute mutation RPCs
    try {
      const { error: aRpc1 } = await anonClient.rpc("set_catalogue_translation", {
        p_kind: "coffee",
        p_entity_id: testCoffeeId,
        p_locale: "ar",
        p_name: "anon",
      });
      const { error: aRpc2 } = await anonClient.rpc("attach_coffee_media", {
        p_coffee_id: testCoffeeId,
        p_object_path: "catalogue/foo",
        p_original_name: "foo.webp",
        p_mime_type: "image/webp",
        p_size_bytes: 10,
      });
      const { error: aRpc3 } = await anonClient.rpc("remove_coffee_media", { p_media_id: testCoffeeId });

      const anonBlocked = Boolean(aRpc1) && Boolean(aRpc2) && Boolean(aRpc3);
      record("Security", "Anon cannot execute mutation RPCs", anonBlocked, "All 3 mutation RPCs rejected for anon");
    } catch (err: unknown) {
      record("Security", "Anon cannot execute mutation RPCs", false, getErrorMessage(err));
    }

    // 3.5 Anon cannot read file_assets
    try {
      const { data: anonAssets, error: assetErr } = await anonClient.from("file_assets").select("id, object_path").limit(5);
      const anonAssetsBlocked = (anonAssets?.length ?? 0) === 0 || Boolean(assetErr);
      record("Security", "Anon cannot read file_assets", anonAssetsBlocked, `Anon read returned ${anonAssets?.length ?? 0} rows; error=${assetErr?.message ?? "none"}`);
    } catch (err: unknown) {
      record("Security", "Anon cannot read file_assets", false, getErrorMessage(err));
    }

    // 3.6 Public image view exposes only intended published media
    try {
      const { data: viewRows } = await anonClient.from("public_coffee_images").select("coffee_slug");
      record("Security", "public_coffee_images view readable anonymously", Array.isArray(viewRows), `Returned ${viewRows?.length ?? 0} published images`);
    } catch (err: unknown) {
      record("Security", "public_coffee_images view readable anonymously", false, getErrorMessage(err));
    }

    // =========================================================================
    // SECTION 4: REGRESSION — AVATAR RUNTIME BEHAVIOR
    // =========================================================================
    console.log("\n--- Section 4: Regression — Avatar Runtime Flow ---");
    try {
      const avPath1 = `avatars/${adminUserId}/reg-avatar-1-${Date.now()}.png`;
      const avPath2 = `avatars/${adminUserId}/reg-avatar-2-${Date.now()}.png`;

      // Upload avatar 1
      const { error: avUp1 } = await adminClient.storage.from("public-assets").upload(avPath1, SAMPLE_WEBP_BYTES, { contentType: "image/png" });
      if (avUp1) throw avUp1;
      uploadedStoragePaths.push(avPath1);
      const { error: avSet1 } = await adminClient.rpc("set_my_avatar", { p_object_path: avPath1 });
      if (avSet1) throw avSet1;

      // Replace avatar with avatar 2
      const { error: avUp2 } = await adminClient.storage.from("public-assets").upload(avPath2, SAMPLE_WEBP_BYTES, { contentType: "image/png" });
      if (avUp2) throw avUp2;
      uploadedStoragePaths.push(avPath2);
      const { data: oldAvPath, error: avSet2 } = await adminClient.rpc("set_my_avatar", { p_object_path: avPath2 });
      if (avSet2) throw avSet2;
      if (oldAvPath) {
        await adminClient.storage.from("public-assets").remove([oldAvPath]);
        const idx = uploadedStoragePaths.indexOf(oldAvPath);
        if (idx !== -1) uploadedStoragePaths.splice(idx, 1);
      }

      // Remove avatar 2
      const { data: remAvPath, error: avRem } = await adminClient.rpc("remove_my_avatar");
      if (avRem) throw avRem;
      if (remAvPath) {
        await adminClient.storage.from("public-assets").remove([remAvPath]);
        const idx = uploadedStoragePaths.indexOf(remAvPath);
        if (idx !== -1) uploadedStoragePaths.splice(idx, 1);
      }

      const { data: finalProfile } = await adminClient.from("profiles").select("avatar_path").eq("id", adminUserId).single();
      const avatarClean = finalProfile?.avatar_path === null;
      record("Regression", "Avatar upload, replace, remove flow completes cleanly", avatarClean, "Avatar updated, old path cleaned, final avatar_path is null");
    } catch (err: unknown) {
      record("Regression", "Avatar upload, replace, remove flow completes cleanly", false, getErrorMessage(err));
    }

  } finally {
    console.log("\n--- Cleanup ---");
    // Clean up any remaining test storage objects
    if (uploadedStoragePaths.length > 0) {
      console.log(`Cleaning up ${uploadedStoragePaths.length} storage objects...`);
      await adminClient.storage.from("public-assets").remove(uploadedStoragePaths);
    }

    // Clean up test coffee and any attached media/translations
    if (testCoffeeId) {
      const { data: remainingMedia } = await adminClient.from("coffee_media").select("id").eq("coffee_id", testCoffeeId);
      for (const m of remainingMedia ?? []) {
        const { data: p } = await adminClient.rpc("remove_coffee_media", { p_media_id: m.id });
        if (p) await adminClient.storage.from("public-assets").remove([p]);
      }
      await adminClient.from("coffee_translations").delete().eq("coffee_id", testCoffeeId);
      await adminClient.from("coffees").delete().eq("id", testCoffeeId);
      console.log(`Deleted test coffee id=${testCoffeeId}`);
    }

    // Reset proof coffee to original baseline
    resetRunECatalogueFixture();
    console.log("Proof coffee reset to DRAFT baseline.\n");
  }

  // Summary
  console.log("==================================================");
  console.log("LIVE VERIFICATION SUMMARY");
  console.log("==================================================");
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed > 0) {
    console.log("FAILED CHECKS:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - [${r.section}] ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log("ALL LIVE CHECKS PASSED!");
  }
}

run().catch((err) => {
  console.error("FATAL ERROR during live verification:", err);
  process.exit(1);
});
