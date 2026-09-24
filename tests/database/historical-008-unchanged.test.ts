import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 013 T015 — historical artifact guard (MIG-001, SC-011).
 *
 * Pins a SHA-256 of every applied migration, rollback and maintenance (preflight/postflight) file that existed at
 * Feature 013 T001, plus every file under specs/008-payments-settlement-invoices-payouts/. Line endings are normalized
 * (CRLF -> LF) so the pin is independent of git autocrlf. Feature 013 must add NEW forward migrations only; it may
 * never edit, reorder or delete any of these files. A deliberate, human-approved change to one of them would have to
 * update this list in the same reviewed change.
 */
const PINNED: Record<string, string> = {
  "supabase/migrations/20260909000000_db_block_10_scope_catalog_admin_policies.sql": "a959399c1c89c5e16172ffabea1b0a876029ef76293c6f1d8a72f29950e25893",
  "supabase/migrations/20260911010000_feature_003_kyb_foundation.sql": "823cb350d6bfcc8aa0a3fb8be59518c7d52dbd8162bdea67d1092125c11a4961",
  "supabase/migrations/20260912000000_feature_003_profile_bootstrap.sql": "77a81ddaf3c509e351cf833a193a0434ec36d83b1cce0b762a73465020b9c88b",
  "supabase/migrations/20260912010000_feature_003_kyb_draft_fields.sql": "865d27580cb298ce2141a5b564af7752e5892c72f5ba1468191436f2be78a3ab",
  "supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql": "ee6b1a5d872dd6806329cd9f65513681c06515446f69f023eb4b3429b26f04ef",
  "supabase/migrations/20260913100000_feature_007_db_blockers.sql": "b52385d5777dd52447744a585260c6c6459b9ab26e755ba095e445565005f563",
  "supabase/migrations/20260914120000_feature_009_db_block_07.sql": "78a21a9ed66b15658c5e4cfd4415139a0a5d73bfbc65f3bbcbb330f5fc9c17a6",
  "supabase/migrations/20260919120000_feature_012_dispute_status_history.sql": "e9810ec9821ab51663458c523989910afcfe54a434c080d871e3f192a45f199f",
  "supabase/migrations/20260919130000_feature_010_db_open_22_compliance_organization_read.sql": "ec3a05eaff9042ecf55355c6e7e4d7b3bbada3145635863d982e58f295ee65ef",
  "supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql": "62dff25ecf2afa2aadba8f3b9610d8c394ff76c5039b3eea6370979c63afb987",
  "supabase/migrations/20260920140000_database_hygiene_updated_at.sql": "99aa38276290869586938e9ce5c10c84412c5803953f588f5022e46aea6927a1",
  "supabase/migrations/20260920160000_feature_011_db_block_10_price_policy_scope.sql": "b993c2fc0dde3f88fe13178356b0384664db1ad7a7882c608926d65c025a7c42",
  "supabase/migrations/20260921120000_feature_005_db_open_19_inventory_variance_hold.sql": "343113453d0e350bb888b2d0fa7b5c6ddc3579adbb26ed58ccda159a53a496f5",
  "supabase/migrations/20260921140000_database_hygiene_m3_proforma_invoices_updated_at.sql": "950b54b546326e61491b3e6cec59154a995576c7e57b21b8ac59617629f2c1ec",
  "supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql": "f70811518596e000f664a79ae84bfaea20222d1d6526a020798aa72689b5b172",
  "supabase/migrations/20260922130000_feature_010_branding_avatar_listing_media.sql": "b6a72adda5fe040b21ea6e1412acd74e48f1ea99558c2d6e519ff08cabd037b3",
  "supabase/migrations/20260923120000_catalogue_media_and_translations.sql": "f84da46ab2d41e9b179ce07530f8f40139f3f4ba1e22dc1ba8e5a4fff3e31278",
  "supabase/migrations/20260924120000_tag_translations.sql": "fcafc8726a6232320cbe3b19f48b97c1177716d69b6b03e25e28adae3955e742",
  "supabase/rollback/20260909000000_db_block_10_scope_catalog_admin_policies.rollback.sql": "69612a7ed3ec24d29d0c1732937bba8b15f5bb732200fe8fb7fd62a9ea278512",
  "supabase/rollback/20260911010000_feature_003_kyb_foundation.rollback.sql": "51ef940edad9fe1b0af38e1d2957a7c8b7ca853d122dd28bcbbaf38a612cf66b",
  "supabase/rollback/20260912000000_feature_003_profile_bootstrap.rollback.sql": "a8bc887baa7fe382cbdd5119d901845c0a357b508b6df38ccb394a15abf4d0cc",
  "supabase/rollback/20260912010000_feature_003_kyb_draft_fields.rollback.sql": "1c29d003b273c55e7c5b994a800cab7ad624792a4f4d0b55e6de2fdd12f47810",
  "supabase/rollback/20260913000000_feature_003_t033_mfa_data_gate.rollback.sql": "a23226fe273767c78f9acbfc63d70a507929684c5111a76c2b286f3219168957",
  "supabase/rollback/20260913100000_feature_007_db_blockers.rollback.sql": "08deebfba636f2a471d7928698d0fe3a5ebfbb6c8bbea778f511bc66be2d527e",
  "supabase/rollback/20260914120000_feature_009_db_block_07.rollback.sql": "11f1e6122563dfccc8503a1a98a662240d4266d7c7b14300629e388c811aed94",
  "supabase/rollback/20260919120000_feature_012_dispute_status_history.rollback.sql": "5fc3cbc1aa9e084ee0a8f05c01a18ddf2eac296c61098df4b327d59f6bdb7bde",
  "supabase/rollback/20260919130000_feature_010_db_open_22_compliance_organization_read.rollback.sql": "2b5dace3fbb926bc2c10b3526adae4c12aacea6699a159eee53c2cad55e5a5ae",
  "supabase/rollback/20260920120000_feature_010_db_open_21_config_attribution.rollback.sql": "6f93244a44234a66c4375d9a1741943be43d38246dabe6c72544fde5b3ac48ec",
  "supabase/rollback/20260920140000_database_hygiene_updated_at.rollback.sql": "9a313c50f0d0cb46c3e9cb8d925dbb19e0efb89d755a1b4de650fa1dde9671a7",
  "supabase/rollback/20260920160000_feature_011_db_block_10_price_policy_scope.rollback.sql": "b662c0e2830bf9270c8cf571d7b2ef5588e681ac83256c03e407f126ec7ddc3c",
  "supabase/rollback/20260921120000_feature_005_db_open_19_inventory_variance_hold.rollback.sql": "349497cbe9379294afdc87fc9b023a3d5a7120dfdf7409afef0aaac5ddfeb887",
  "supabase/rollback/20260921140000_database_hygiene_m3_proforma_invoices_updated_at.rollback.sql": "d830be581929bbad11b7054cb5b164278f83fc40186c9ff2445109e45ee5c4ff",
  "supabase/rollback/20260922120000_feature_008_stripe_trusted_funding.rollback.sql": "2bbbfe4da355ce7a78623d07479675c47ce2223e48b584ed13bad041774e15d1",
  "supabase/rollback/20260922130000_feature_010_branding_avatar_listing_media.rollback.sql": "91e940fd12f58cb2d4bdee32e485f743d6061ce256e3c5e44baa79f5f1e68c78",
  "supabase/rollback/20260923120000_catalogue_media_and_translations.rollback.sql": "2e439b38b6a7019c073a6c784d51b5f80596dfa3acd5ec6344836ccc15f20ddb",
  "supabase/rollback/20260924120000_tag_translations.rollback.sql": "6a83b36284b1cec1e29832c2b28573c023a1b905442c08f15ef86c9d28c242d1",
  "supabase/maintenance/20260910_t010g_auth_user_cleanup.mjs": "34f571b759a5a6652d7b500030823a679d5ce0b01a18f5bfbff380fb775713d7",
  "supabase/maintenance/20260910_t010g_fixture_cleanup.sql": "65662fa9f24310083b2a88913d625103d4fd2be3a25e76874e02f9318e11e16f",
  "supabase/maintenance/20260910_t010g_fixture_cleanup_verify_after.sql": "f04a5f7d6883454c6964c40cb392873bbb34cf5de53124b05c4d2449de8304ad",
  "supabase/maintenance/20260910_t010g_fixture_verify_readonly.sql": "1cb8c66b6a76e456e4629980e471c7b4bc09a692e83d53b06ae0a47dddb3ec61",
  "supabase/maintenance/20260913_feature_007_db_blockers_preflight.sql": "1c20ac0c7bae849a4e7636dbffcef27ce763b153ac2a5d550dee23469cd2906f",
  "supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql": "51140f14363a945c5e1a407f78e9137c1f5f2f11a92ff0ca9b808fd68417e97a",
  "supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql": "78f1660113e8b597e57e0679dde0435051154997d6da5e96eefc09007334c6c2",
  "supabase/maintenance/20260914_feature_009_db_block_07_postflight.sql": "ffacb4e93b9639336f1bd69d50876107098906e3dbb3ebc857a59e5c2e63814b",
  "supabase/maintenance/20260914_feature_009_db_block_07_preflight.sql": "686a7972f8bcb9eb39a989a87f5675ba8a3ed99fb5cbe7c42d1178c733e47151",
  "supabase/maintenance/20260919_feature_010_db_open_22_postflight.sql": "6087e9e35abf8f1a6d2ccac26b9db1869d03919a3da063ef541cedf3e66dce02",
  "supabase/maintenance/20260919_feature_012_dispute_status_history_postflight.sql": "a01e6bc8ae19d9995da8c0195f646a5502c1b87881c8f98f4a375e2a1b11d695",
  "supabase/maintenance/20260920_database_hygiene_updated_at_postflight.sql": "39f3b0ea490e1ea90c5a78d188ca927adcd766c65040f8b61f4667fcab3f469b",
  "supabase/maintenance/20260920_feature_010_db_open_21_postflight.sql": "193e65242b35587bed4d8e5aeedf2dcaa0fe01cf7b0e54f3d81ec786ffe4185f",
  "supabase/maintenance/20260920_feature_011_price_policy_scope_postflight.sql": "9fcfb3e78cc3f8571dd166c894dc848358001d3879073a27fcbc29b777f912cc",
  "supabase/maintenance/20260921_database_hygiene_m3_proforma_invoices_updated_at_postflight.sql": "5217367030fd97133445542a2513a76079eabaa90f9f16f4c2718e0d31379645",
  "supabase/maintenance/20260921_feature_005_db_open_19_postflight.sql": "f3722485d7563469c224fbee110ccef75fd5efd7e69c212939c9cca6ad1a69fd",
  "supabase/maintenance/20260922_feature_008_stripe_trusted_funding_postflight.sql": "3b93765b8b57e13ec9f233ba8f99823d467325c3535763ebae973c542e0e52a3",
  "supabase/maintenance/20260922_feature_010_branding_avatar_listing_media_postflight.sql": "d041c85aef3213fe37f16f96fcb45c149d1ec4390aef74670a3f2c8e6652c0cb",
  "supabase/maintenance/20260923_catalogue_media_and_translations_postflight.sql": "8b3c0d18bfe5ea7ecae5e4918f05a94d4b8d1692199ccccbb123cae8fe65aeac",
  "supabase/maintenance/20260924_tag_translations_postflight.sql": "24665483e3fea24b05b88778fb921e46c1d1a731c9ec1af47279adff8496e513",
  "specs/008-payments-settlement-invoices-payouts/IMPLEMENTATION-HANDOFF.md": "b4d87d4adbd056c5817ac02e5a4b009a8565a8db0a928717a701d95cafac18a9",
  "specs/008-payments-settlement-invoices-payouts/STRIPE-PREPARATION.md": "6d061da4ec01c174c671498056afab9e04bf60581e406bf9b40112e913f2f046",
  "specs/008-payments-settlement-invoices-payouts/plan.md": "c77b1a8d84a91b08f2036b8b9fbd66354aa9e3a87c6c0d3ed963ac16174eb412",
  "specs/008-payments-settlement-invoices-payouts/spec.md": "34a08a903ee8680e2fbe834ae9760031b21f33627602e7a7c05a8f8d87b9004a",
  "specs/008-payments-settlement-invoices-payouts/tasks.md": "1abb825d6d166c6710819d9302b42ad93ab272b263f5b6e5900361d273485a73",
};

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex");

describe("T015 — historical Feature 008 and applied-migration files are byte-identical", () => {
  it("pins the Feature 008 Stripe migration, its rollback and postflight explicitly", () => {
    for (const file of [
      "supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql",
      "supabase/rollback/20260922120000_feature_008_stripe_trusted_funding.rollback.sql",
      "supabase/maintenance/20260922_feature_008_stripe_trusted_funding_postflight.sql",
    ]) {
      expect(PINNED[file], file).toBeDefined();
    }
    expect(Object.keys(PINNED).some((file) => file.startsWith("specs/008-payments-settlement-invoices-payouts/"))).toBe(true);
  });

  it.each(Object.entries(PINNED))("%s is unchanged", (file, hash) => {
    expect(existsSync(file), `${file} must not be deleted`).toBe(true);
    expect(sha256(file), `${file} content changed`).toBe(hash);
  });
});
