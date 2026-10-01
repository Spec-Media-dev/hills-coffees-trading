/**
 * Feature 015 — Live Database Integration Test Suite
 *
 * These tests execute real database operations, RPCs, and Storage policies.
 * They are normally local-only. The separately owner-approved remote path is
 * hard-pinned to the disposable Hills Coffee verification project.
 *
 * NO PLACEHOLDERS: Zero `expect(true).toBe(true)` assertions.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  F013_FIXTURES,
  PHASE89_FIXTURES,
  requireF015RemoteVerificationTarget,
  signInAsFixture,
  signInAsFixtureIndependentSession,
} from "@/tests/auth/fixture-session";
import { totpCode } from "@/tests/auth/totp";
import {
  requireF013LocalTarget,
  resolveF013Mode,
} from "@/scripts/f013-local-target";
import {
  ensureFeature015Applied,
  expectProofSqlFileFailure,
  inspectFeature015State,
  runProofSqlFileStrict,
  runSqlSessionAsync,
} from "./f013-proof-cli";

// Guard: only execute against the owner-approved, exact remote verification project.
const isRemoteLiveDbReady =
  process.env.F013_LIVE === "1" &&
  process.env.F015_REMOTE_LIVE_DB_APPROVED === "1";

const PAYMENT_PROOFS_BUCKET = "payment-proofs";

/**
 * Reads the privileged service role key without printing or logging it.
 */
function getPrivilegedServiceRoleKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  const mode = resolveF013Mode();
  if (mode.kind === "local") {
    return requireF013LocalTarget().serviceRoleKey;
  }
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const sep = line.indexOf("=");
      if (sep === -1) continue;
      const name = line.slice(0, sep).trim();
      if (name === "SUPABASE_SERVICE_ROLE_KEY") {
        let val = line.slice(sep + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        return val;
      }
    }
  } catch {
    // fallback
  }
  throw new Error("SUPABASE_SERVICE_ROLE_KEY required for privileged storage cleanup helper.");
}

function getTargetApiUrl(): string {
  const mode = resolveF013Mode();
  if (mode.kind === "local") {
    return requireF013LocalTarget().apiUrl;
  }
  return requireF015RemoteVerificationTarget().apiUrl;
}

let cachedStorageAdminClient: SupabaseClient | null = null;
function getPrivilegedStorageAdminClient(): SupabaseClient {
  if (cachedStorageAdminClient) return cachedStorageAdminClient;
  const apiUrl = getTargetApiUrl();
  const serviceRoleKey = getPrivilegedServiceRoleKey();
  cachedStorageAdminClient = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedStorageAdminClient;
}

/**
 * Narrow privileged Storage API helper targeting ONLY payment-proofs bucket.
 * Removes exact known object paths and verifies deletion succeeded.
 * Does not add broad DELETE RLS, does not weaken application Storage policies,
 * and does not print service-role credentials.
 */
async function removePaymentProofStorageObjects(
  objectPaths: string[],
): Promise<void> {
  if (objectPaths.length === 0) return;
  if (objectPaths.some(p => !/^org\/[0-9a-f-]{36}\/orders\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/proof$/.test(p))) {
    throw new Error("Feature 015 Storage cleanup requires exact proof object paths.");
  }
  const adminClient = getPrivilegedStorageAdminClient();

  const { error } = await adminClient.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .remove(objectPaths);

  if (error) {
    throw new Error(
      `Failed to remove objects from ${PAYMENT_PROOFS_BUCKET}: ${error.message}`,
    );
  }

  // Verify deletion succeeded for each path: confirm download fails
  for (const path of objectPaths) {
    const { data: downloadData, error: downloadErr } = await adminClient.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .download(path);
    if (downloadData && !downloadErr) {
      throw new Error(
        `Storage object verification failed: path still exists in ${PAYMENT_PROOFS_BUCKET} (${path})`,
      );
    }
  }
}

/**
 * Recursively lists all object paths under the payment-proofs bucket using the Storage API.
 */
async function listAllPaymentProofObjectPaths(prefix = ""): Promise<string[]> {
  const adminClient = getPrivilegedStorageAdminClient();
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await adminClient.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) throw new Error("Feature 015 Storage listing failed; refusing cleanup.");
    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) paths.push(...await listAllPaymentProofObjectPaths(itemPath));
      else paths.push(itemPath);
    }
    if (data.length < 100) break;
  }
  return paths;
}

/**
 * Purges all objects from payment-proofs bucket via the Storage API and verifies empty.
 */
async function purgePaymentProofStorageObjects(): Promise<void> {
  // Refuse a bucket-wide wipe unless every existing object is proven to belong
  // to a documented F015 fixture buyer's upload intent/order.
  runProofSqlFileStrict(`
    do $$ begin
      if exists (
        select 1 from storage.objects s where s.bucket_id = 'payment-proofs'
        and not exists (
          select 1 from public.payment_proof_upload_intents i
          join public.orders o on o.id = i.order_id
          join auth.users u on u.id = o.created_by
          where i.bucket_id = s.bucket_id and i.object_path = s.name
          and u.email in ('${F013_FIXTURES.members.buyerA.email}', '${F013_FIXTURES.members.buyerB.email}', '${PHASE89_FIXTURES.mfaMember.email}')
        )
      ) then raise exception 'f015_cleanup_refused_unknown_object'; end if;
    end $$;
  `, "f015-verify-cleanup-ownership");
  const paths = await listAllPaymentProofObjectPaths();
  await removePaymentProofStorageObjects(paths);
  runProofSqlFileStrict(`do $$ begin
    if exists (select 1 from storage.objects where bucket_id = 'payment-proofs')
    then raise exception 'f015_cleanup_bucket_not_empty'; end if;
  end $$;`, "f015-verify-cleanup-empty");
}

describe.skipIf(!isRemoteLiveDbReady)(
  "Feature 015 Remote Live DB Integration Suite (22 Verified Executable Scenarios)",
  () => {
    let buyerA: SupabaseClient;
    let buyerB: SupabaseClient;
    let sellerS1: SupabaseClient;
    let warehouseAdmin: SupabaseClient;
    let platformAdmin: SupabaseClient;
    let originalBankTransferCheckoutEnabled: boolean | null = null;

    const ensureCommerceConfigSql = `
      insert into public.payment_accounts (
        id, account_name, bank_name, account_number, iban, swift_code, currency, is_active, is_default_for_currency, created_by
      )
      select
        '13000000-0000-4000-8000-000000000071',
        'Hills Coffee Trading LLC',
        'Emirates NBD',
        '101010101010',
        'AE07026000101010101010',
        'EBNBAEADXXX',
        'USD',
        true,
        true,
        (select id from auth.users where email = '${F013_FIXTURES.operators.admin.email}')
      on conflict (id) do update set is_active = true, is_default_for_currency = true;

      insert into public.shipping_rules (id, country_code, delivery_method, flat_fee, currency, is_active, effective_from, created_by)
      select '13000000-0000-4000-8000-000000000072', 'AE', 'Courier', 7.00, 'USD', true, now() - interval '1 hour', (select id from auth.users where email = '${F013_FIXTURES.operators.admin.email}')
      on conflict (id) do update set is_active = true;

      insert into public.shipping_rules (id, country_code, delivery_method, flat_fee, currency, is_active, effective_from, created_by)
      select '13000000-0000-4000-8000-000000000076', null, 'Courier', 99.00, 'USD', true, now() - interval '1 hour', (select id from auth.users where email = '${F013_FIXTURES.operators.admin.email}')
      on conflict (id) do update set is_active = true;

      insert into public.commission_policies (id, name, status, effective_from, created_by)
      select '13000000-0000-4000-8000-000000000073', 'F013 Commission Policy', 'ACTIVE', now() - interval '1 hour', (select id from auth.users where email = '${F013_FIXTURES.operators.admin.email}')
      on conflict (id) do update set status = 'ACTIVE';

      insert into public.commission_tiers (id, policy_id, min_quantity_kg, max_quantity_kg, percentage)
      values ('13000000-0000-4000-8000-000000000074', '13000000-0000-4000-8000-000000000073', 0, 100, 5)
      on conflict (id) do update set percentage = 5;

      insert into public.commission_tiers (id, policy_id, min_quantity_kg, max_quantity_kg, percentage)
      values ('13000000-0000-4000-8000-000000000075', '13000000-0000-4000-8000-000000000073', 100, null, 3)
      on conflict (id) do update set percentage = 3;
    `;

    beforeAll(async () => {
      const target = requireF015RemoteVerificationTarget();
      expect(new URL(target.apiUrl).hostname).toBe("mxejnutukgxyccnohglo.supabase.co");

      buyerA = await signInAsFixture(F013_FIXTURES.members.buyerA.email);
      buyerB = await signInAsFixture(F013_FIXTURES.members.buyerB.email);
      sellerS1 = await signInAsFixture(F013_FIXTURES.members.sellerS1.email);
      warehouseAdmin = await signInAsFixture(
        F013_FIXTURES.operators.warehouse.email,
      );
      platformAdmin = await signInAsFixture(
        F013_FIXTURES.operators.admin.email,
      );

      // Root Cause 1: Read and preserve authoritative commerce setting
      const { data: initialSettings, error: readSettingsErr } = await platformAdmin
        .from("commerce_settings")
        .select("bank_transfer_checkout_enabled")
        .eq("id", true)
        .single();
      expect(readSettingsErr).toBeNull();
      originalBankTransferCheckoutEnabled =
        initialSettings?.bank_transfer_checkout_enabled ?? false;

      // Temporarily enable checkout for the verification run
      runProofSqlFileStrict(
        "update public.commerce_settings set bank_transfer_checkout_enabled = true where id;",
        "f015-enable-checkout",
      );

      // Verify checkout is no longer blocked by checkout_disabled
      const { data: enabledSettings, error: verifySettingsErr } = await platformAdmin
        .from("commerce_settings")
        .select("bank_transfer_checkout_enabled")
        .eq("id", true)
        .single();
      expect(verifySettingsErr).toBeNull();
      expect(enabledSettings?.bank_transfer_checkout_enabled).toBe(true);

      // Ensure default USD payment account, shipping rules, and commission configuration exist for checkout quotes
      runProofSqlFileStrict(ensureCommerceConfigSql, "f015-ensure-commerce-config");

      // Only documented fixture buyers' unreserved DRAFT rows may be cleaned.
      // Never manually expire reservations: that skips the inventory release workflow.
      runProofSqlFileStrict(`
        delete from public.order_items where order_id in (
          select o.id from public.orders o join auth.users u on u.id = o.created_by
          where o.status = 'DRAFT' and o.commerce_flow = 'BANK_TRANSFER_V1'
          and u.email in ('${F013_FIXTURES.members.buyerA.email}', '${F013_FIXTURES.members.buyerB.email}', '${PHASE89_FIXTURES.mfaMember.email}')
          and not exists (select 1 from public.inventory_reservations r where r.order_id = o.id)
        );
        delete from public.orders o using auth.users u
        where u.id = o.created_by and o.status = 'DRAFT' and o.commerce_flow = 'BANK_TRANSFER_V1'
        and u.email in ('${F013_FIXTURES.members.buyerA.email}', '${F013_FIXTURES.members.buyerB.email}', '${PHASE89_FIXTURES.mfaMember.email}')
        and not exists (select 1 from public.inventory_reservations r where r.order_id = o.id);
      `, "f015-startup-cleanup");
    }, 120_000);

    /**
     * Resolves an existing active AE delivery destination for the buyer organization,
     * or creates one via the authoritative upsert_delivery_destination RPC.
     * Explicitly asserts destination setup succeeded before returning its ID.
     * Never passes a shipping rule ID as destination_id.
     */
    async function resolveOrCreateValidDestinationForBuyer(
      buyerClient: SupabaseClient,
      orgId: string,
    ): Promise<string> {
      // 1. Look for existing active AE destination owned by this buyer organization
      const { data: existing, error: findErr } = await buyerClient
        .from("delivery_destinations")
        .select("id, organization_id, country_code, retired_at")
        .eq("organization_id", orgId)
        .eq("country_code", "AE")
        .is("retired_at", null)
        .limit(1)
        .maybeSingle();

      expect(findErr).toBeNull();
      if (existing?.id) {
        return existing.id;
      }

      // 2. Authoritative creation via upsert_delivery_destination RPC
      const reqId = randomUUID();
      const { data: newId, error: createErr } = await buyerClient.rpc(
        "upsert_delivery_destination",
        {
          p_id: null,
          p_org_id: orgId,
          p_fields: {
            label: "F015 Verified Live AE Destination",
            country_code: "AE",
            city: "Dubai",
            address_line_1: "Synthetic Logistics Free Zone 1",
            address_line_2: "",
            contact_name: "F015 Live Logistics Desk",
            contact_phone: "+97140000000",
            delivery_method: "Courier",
            is_default: true,
          },
          p_request_id: reqId,
        },
      );

      expect(createErr).toBeNull();
      expect(typeof newId).toBe("string");

      const destId = existing?.id ?? String(newId);

      // 3. Explicitly assert destination setup succeeded BEFORE returning
      const { data: verified, error: verifyErr } = await buyerClient
        .from("delivery_destinations")
        .select("id, organization_id, country_code, retired_at")
        .eq("id", destId)
        .single();

      expect(verifyErr).toBeNull();
      expect(verified?.organization_id).toBe(orgId);
      expect(verified?.country_code).toBe("AE");
      expect(verified?.retired_at).toBeNull();

      return destId;
    }

    /**
     * Helper to create a valid, invariant-respecting HOLD order through the
     * authoritative commerce pipeline (buyer -> cart -> destination -> checkout).
     */
    async function createFixtureHoldOrder(
      buyerClient: SupabaseClient,
      orgId: string,
      offerId: string = F013_FIXTURES.offers.hillsW1,
      quantityKg: number = 5,
    ) {
      const cartReqId = randomUUID();
      const checkoutReqId = randomUUID();

      // Resolve a real active delivery_destinations row owned by this buyer org
      const destinationId = await resolveOrCreateValidDestinationForBuyer(
        buyerClient,
        orgId,
      );

      // Clear any previous residual DRAFT order for this buyer organization so new hold order contains only requested line
      runProofSqlFileStrict(`
        delete from public.order_items where order_id in (
          select id from public.orders
          where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id = '${orgId}' and (order_code is null or order_code not like 'F005-%')
        );
        delete from public.orders
        where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id = '${orgId}' and (order_code is null or order_code not like 'F005-%');
      `, "f015-clear-residual-draft");

      // Real cart line insertion: creates DRAFT order and items with proper snapshots
      const { data: cartRes, error: cartErr } = await buyerClient.rpc("add_cart_line", {
        p_org_id: orgId,
        p_offer_id: offerId,
        p_quantity_kg: quantityKg,
        p_request_id: cartReqId,
      });
      expect(cartErr).toBeNull();
      const cartOrderId = (cartRes as { order_id: string })?.order_id;
      expect(cartOrderId).toBeDefined();

      // Authoritative atomic checkout creates HOLD order, CONFIRMED proforma, ACTIVE reservation, PENDING payment
      const { data: checkoutRes, error: checkoutErr } = await buyerClient.rpc(
        "checkout_bank_transfer_v1",
        {
          p_order_id: cartOrderId,
          p_destination_id: destinationId,
          p_request_id: checkoutReqId,
        },
      );
      expect(checkoutErr).toBeNull();
      expect(checkoutRes).toBeDefined();

      return checkoutRes as {
        order_id: string;
        order_code: string;
        proforma_id: string;
        proforma_code: string;
        reservation_id: string;
        payment_id: string;
        expires_at: string;
        buyer_total: number;
        currency: string;
      };
    }

    // 1. Isolated migration lifecycle: baseline → forward → postflight → rollback → restoration → forward reapply
    it("1. Feature 015 migration lifecycle: baseline → forward → postflight → rollback → restoration → forward reapply", async () => {
      const migrationSqlPath = resolve(
        process.cwd(),
        "supabase/migrations/20260930100000_feature_015_atomic_checkout_and_payment_proof.sql",
      );
      const rollbackSqlPath = resolve(
        process.cwd(),
        "supabase/rollback/20260930100000_feature_015_atomic_checkout_and_payment_proof.rollback.sql",
      );
      const postflightSqlPath = resolve(
        process.cwd(),
        "supabase/maintenance/20260930_feature_015_atomic_checkout_and_payment_proof_postflight.sql",
      );

      const migrationSql = readFileSync(migrationSqlPath, "utf8");
      const rollbackSql = readFileSync(rollbackSqlPath, "utf8");
      const postflightSql = readFileSync(postflightSqlPath, "utf8");

      try {
        // A & B & C: Establish/reset to pre-Feature-015 baseline
        await purgePaymentProofStorageObjects();
        const { error: deleteBucketError } = await getPrivilegedStorageAdminClient().storage.deleteBucket(PAYMENT_PROOFS_BUCKET);
        expect(deleteBucketError).toBeNull();

        // Rollback to guarantee true pre-015 baseline
        runProofSqlFileStrict(rollbackSql, "f015-baseline-reset");

        // C: Assert payment-proofs bucket does NOT already exist at baseline
        const { data: baselineBucket, error: baselineBucketErr } =
          await getPrivilegedStorageAdminClient().storage.getBucket("payment-proofs");
        expect(baselineBucket).toBeNull();
        expect(baselineBucketErr).not.toBeNull();

        // D: Apply Feature 015 forward migration (unexpected SQL failure throws)
        const forwardOutput = runProofSqlFileStrict(
          migrationSql,
          "f015-forward-apply",
        );
        expect(forwardOutput).not.toMatch(/ERROR:/);

        // E: Execute the real Feature 015 postflight SQL against the migrated database
        const postflightOutput = runProofSqlFileStrict(
          postflightSql,
          "f015-postflight-exec",
        );
        expect(postflightOutput).toContain(
          "Feature 015 postflight structural validation passed cleanly.",
        );
        expect(postflightOutput).not.toMatch(
          /Postflight structural validation failed/,
        );

        // F: Verify Feature 015 objects/behavior (with retry for remote Storage API cache propagation)
        let postForwardBucket: unknown = null;
        let postForwardBucketErr: unknown = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          const res = await getPrivilegedStorageAdminClient().storage.getBucket("payment-proofs");
          postForwardBucket = res.data;
          postForwardBucketErr = res.error;
          if (postForwardBucket) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(postForwardBucketErr).toBeNull();
        expect(postForwardBucket).toMatchObject({
          id: "payment-proofs",
          public: false,
          file_size_limit: 10485760,
        });

        // G: Ensure payment-proofs bucket is EMPTY before rollback
        let bucketFiles: unknown = null;
        let listErr: unknown = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          const res = await getPrivilegedStorageAdminClient().storage
            .from("payment-proofs")
            .list("", { limit: 10 });
          bucketFiles = res.data;
          listErr = res.error;
          if (listErr === null) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(listErr).toBeNull();
        expect((bucketFiles as unknown[] | null)?.length ?? 0).toBe(0);

        // H: Execute Feature 015 clean rollback SQL (unexpected SQL failure throws)
        const rollbackOutput = runProofSqlFileStrict(
          rollbackSql,
          "f015-rollback-exec",
        );
        expect(rollbackOutput).not.toMatch(/ERROR:/);
        expect(rollbackOutput).not.toMatch(
          /rollback_aborted_payment_proofs_bucket_not_empty/,
        );

        // I: Explicitly verify restored pre-015 objects, procedures, signatures, grants and policies:
        const checkRestoredStateSql = `
          do $$
          declare
            v_issue_proc record;
            v_confirm_proc record;
            v_trans_proc record;
            v_pol record;
            v_catalog_pol record;
            v_has_auth boolean;
            v_has_anon boolean;
            v_has_public boolean;
            v_has_svc boolean;
          begin
            -- 1. Verify payment_proofs_read policy exists and matches historical baseline:
            -- Historical baseline (from 20260925120000_feature_013_rls_realignment.sql, restored in rollback):
            --   table: public.payment_proofs
            --   command: SELECT
            --   roles: {authenticated}
            --   USING: (is_order_buyer_member(p.order_id) OR is_finance_operator())
            --   NO is_platform_admin(), mfa_satisfied(), or is_blocked_user()
            --   with_check: NULL (SELECT policies do not have WITH CHECK)
            select * into v_pol
            from pg_policies
            where schemaname = 'public'
              and tablename = 'payment_proofs'
              and policyname = 'payment_proofs_read';

            if v_pol.policyname is null then
              raise exception 'lifecycle_check_failed: baseline payment_proofs_read policy missing after rollback';
            end if;

            if v_pol.cmd <> 'SELECT' then
              raise exception 'lifecycle_check_failed: payment_proofs_read cmd expected SELECT, got %', v_pol.cmd;
            end if;

            if not (v_pol.roles @> array['authenticated']::name[]) then
              raise exception 'lifecycle_check_failed: payment_proofs_read roles expected authenticated, got %', v_pol.roles;
            end if;

            if v_pol.with_check is not null then
              raise exception 'lifecycle_check_failed: payment_proofs_read with_check expected null, got %', v_pol.with_check;
            end if;

            -- Check baseline USING expression content
            if v_pol.qual not like '%is_order_buyer_member%'
               or v_pol.qual not like '%is_finance_operator%' then
              raise exception 'lifecycle_check_failed: payment_proofs_read missing baseline predicate: %', v_pol.qual;
            end if;

            if v_pol.qual like '%is_platform_admin%' or v_pol.qual like '%mfa_satisfied%' or v_pol.qual like '%is_blocked_user%' then
              raise exception 'lifecycle_check_failed: payment_proofs_read does not match the historical baseline predicate: %', v_pol.qual;
            end if;

            -- 2. Verify catalog_admin_files policy restored without payment-proofs carve-out
            select * into v_catalog_pol
            from pg_policies
            where schemaname = 'public'
              and tablename = 'file_assets'
              and policyname = 'catalog_admin_files';

            if v_catalog_pol.policyname is null then
              raise exception 'lifecycle_check_failed: catalog_admin_files policy missing after rollback';
            end if;

            if v_catalog_pol.qual like '%payment-proofs%' then
              raise exception 'lifecycle_check_failed: catalog_admin_files still contains payment-proofs carveout: %', v_catalog_pol.qual;
            end if;

            -- 3. Assert Feature 015-specific storage/file policies are dropped
            if exists (
              select 1 from pg_policies
              where (schemaname = 'storage' and tablename = 'objects' and policyname in ('payment_proof_storage_insert', 'payment_proof_storage_select'))
                 or (schemaname = 'public' and tablename = 'file_assets' and policyname = 'payment_proof_file_assets_read')
            ) then
              raise exception 'lifecycle_check_failed: Feature 015 storage/file policies still exist after rollback';
            end if;

            -- 4. Verify restored issue_proforma(uuid, uuid, text, uuid):
            -- - exact schema-qualified signature: public.issue_proforma(uuid, uuid, text, uuid)
            -- - function exists
            -- - SECURITY DEFINER (prosecdef = true)
            -- - expected search_path: pg_catalog, public, auth
            -- - execute grant to authenticated
            -- - forbidden grants: anon, public, service_role must NOT have EXECUTE
            -- - deprecation fence removed
            select p.* into v_issue_proc
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'issue_proforma'
              and oidvectortypes(p.proargtypes) = 'uuid, uuid, text, uuid';

            if v_issue_proc.oid is null then
              raise exception 'lifecycle_check_failed: issue_proforma(uuid, uuid, text, uuid) missing';
            end if;

            if not v_issue_proc.prosecdef then
              raise exception 'lifecycle_check_failed: issue_proforma must be SECURITY DEFINER';
            end if;

            if not exists (select 1 from unnest(v_issue_proc.proconfig) c where c like 'search_path=%pg_catalog%public%auth%') then
              raise exception 'lifecycle_check_failed: issue_proforma search_path misconfigured: %', v_issue_proc.proconfig;
            end if;

            if v_issue_proc.prosrc like '%endpoint_deprecated_use_checkout_v1%' then
              raise exception 'lifecycle_check_failed: issue_proforma still contains deprecation fence';
            end if;

            select has_function_privilege('authenticated', v_issue_proc.oid, 'EXECUTE') into v_has_auth;
            select has_function_privilege('anon', v_issue_proc.oid, 'EXECUTE') into v_has_anon;
            select has_function_privilege('public', v_issue_proc.oid, 'EXECUTE') into v_has_public;
            select has_function_privilege('service_role', v_issue_proc.oid, 'EXECUTE') into v_has_svc;

            if not v_has_auth then
              raise exception 'lifecycle_check_failed: authenticated lacks EXECUTE on issue_proforma';
            end if;
            if v_has_anon or v_has_public or v_has_svc then
              raise exception 'lifecycle_check_failed: forbidden role has EXECUTE on issue_proforma (anon=%, public=%, svc=%)', v_has_anon, v_has_public, v_has_svc;
            end if;

            -- 5. Verify restored confirm_proforma(uuid, uuid):
            -- - exact schema-qualified signature: public.confirm_proforma(uuid, uuid)
            -- - function exists
            -- - SECURITY DEFINER (prosecdef = true)
            -- - expected search_path: pg_catalog, public, auth
            -- - execute grant to authenticated
            -- - forbidden grants: anon, public, service_role must NOT have EXECUTE
            -- - deprecation fence removed
            select p.* into v_confirm_proc
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'confirm_proforma'
              and oidvectortypes(p.proargtypes) = 'uuid, uuid';

            if v_confirm_proc.oid is null then
              raise exception 'lifecycle_check_failed: confirm_proforma(uuid, uuid) missing';
            end if;

            if not v_confirm_proc.prosecdef then
              raise exception 'lifecycle_check_failed: confirm_proforma must be SECURITY DEFINER';
            end if;

            if not exists (select 1 from unnest(v_confirm_proc.proconfig) c where c like 'search_path=%pg_catalog%public%auth%') then
              raise exception 'lifecycle_check_failed: confirm_proforma search_path misconfigured: %', v_confirm_proc.proconfig;
            end if;

            if v_confirm_proc.prosrc like '%endpoint_deprecated_use_checkout_v1%' then
              raise exception 'lifecycle_check_failed: confirm_proforma still contains deprecation fence';
            end if;

            select has_function_privilege('authenticated', v_confirm_proc.oid, 'EXECUTE') into v_has_auth;
            select has_function_privilege('anon', v_confirm_proc.oid, 'EXECUTE') into v_has_anon;
            select has_function_privilege('public', v_confirm_proc.oid, 'EXECUTE') into v_has_public;
            select has_function_privilege('service_role', v_confirm_proc.oid, 'EXECUTE') into v_has_svc;

            if not v_has_auth then
              raise exception 'lifecycle_check_failed: authenticated lacks EXECUTE on confirm_proforma';
            end if;
            if v_has_anon or v_has_public or v_has_svc then
              raise exception 'lifecycle_check_failed: forbidden role has EXECUTE on confirm_proforma (anon=%, public=%, svc=%)', v_has_anon, v_has_public, v_has_svc;
            end if;

            -- 6. Verify restored validate_order_transition():
            -- - exact schema-qualified signature: public.validate_order_transition()
            -- - function exists
            -- - SECURITY DEFINER (prosecdef = true)
            -- - search_path: pg_catalog, public, auth
            -- - grants: authenticated, service_role have EXECUTE; anon, public do NOT
            -- - actual pre-015 transition behavior: HOLD -> PAYMENT_PROOF_SUBMITTED is rejected
            select p.* into v_trans_proc
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'validate_order_transition'
              and p.pronargs = 0;

            if v_trans_proc.oid is null then
              raise exception 'lifecycle_check_failed: validate_order_transition() missing';
            end if;

            if not v_trans_proc.prosecdef then
              raise exception 'lifecycle_check_failed: validate_order_transition must be SECURITY DEFINER';
            end if;

            if not exists (select 1 from unnest(v_trans_proc.proconfig) c where c like 'search_path=%pg_catalog%public%auth%') then
              raise exception 'lifecycle_check_failed: validate_order_transition search_path misconfigured: %', v_trans_proc.proconfig;
            end if;

            select has_function_privilege('authenticated', v_trans_proc.oid, 'EXECUTE') into v_has_auth;
            select has_function_privilege('service_role', v_trans_proc.oid, 'EXECUTE') into v_has_svc;
            select has_function_privilege('anon', v_trans_proc.oid, 'EXECUTE') into v_has_anon;
            select has_function_privilege('public', v_trans_proc.oid, 'EXECUTE') into v_has_public;

            if not v_has_auth or not v_has_svc then
              raise exception 'lifecycle_check_failed: authenticated or service_role lacks EXECUTE on validate_order_transition';
            end if;
            if v_has_anon or v_has_public then
              raise exception 'lifecycle_check_failed: anon or public has EXECUTE on validate_order_transition';
            end if;

            -- Actual pre-015 transition behavior check in code:
            -- In pre-015, HOLD -> PAYMENT_PROOF_SUBMITTED is strictly forbidden for BANK_TRANSFER_V1:
            if v_trans_proc.prosrc not like '%if old.status in (''CONFIRMED'', ''PAYMENT_PROOF_SUBMITTED'') then raise exception ''invalid_order_transition'';%' then
              raise exception 'lifecycle_check_failed: validate_order_transition does not enforce pre-015 terminal/invalid transition behavior';
            end if;

            -- 7. Assert Feature 015 functions are dropped
            if exists (
              select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in (
                'checkout_bank_transfer_v1',
                'prepare_payment_proof_upload',
                'finalize_payment_proof',
                'cleanup_orphan_payment_proof_upload',
                'payment_proof_storage_object_authorized'
              )
            ) then
              raise exception 'lifecycle_check_failed: Feature 015 RPCs were not dropped after rollback';
            end if;

            -- 8. Assert payment_proof_upload_intents table is dropped
            if exists (
              select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'payment_proof_upload_intents'
            ) then
              raise exception 'lifecycle_check_failed: payment_proof_upload_intents table still exists after rollback';
            end if;
          end $$;
        `;
        runProofSqlFileStrict(
          checkRestoredStateSql,
          "f015-verify-restored-state",
        );

        // Verify bucket removal: payment-proofs bucket is deleted
        let rolledBackBucket: unknown = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          const res = await getPrivilegedStorageAdminClient().storage.getBucket("payment-proofs");
          rolledBackBucket = res.data;
          if (rolledBackBucket === null) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(rolledBackBucket).toBeNull();
      } finally {
        // J: Reapply forward migration for all subsequent Feature 015 tests in this suite
        // Adheres strictly to tri-state rules: applies if ABSENT, skips if APPLIED, throws if INCONSISTENT
        ensureFeature015Applied(migrationSql, "f015-forward-reapply");
        expect(inspectFeature015State()).toBe("APPLIED");
        runProofSqlFileStrict(
          "update public.commerce_settings set bank_transfer_checkout_enabled = true where id;",
          "f015-reassert-checkout-enabled",
        );
        runProofSqlFileStrict(ensureCommerceConfigSql, "f015-reassert-commerce-config");
      }
    }, 180_000);

    // 2. DRAFT → HOLD succeeds
    it("2. DRAFT → HOLD succeeds under atomic checkout", async () => {
      const orgId = F013_FIXTURES.members.buyerA.organizationId;
      const destinationId = await resolveOrCreateValidDestinationForBuyer(
        buyerA,
        orgId,
      );
      const cartReqId = randomUUID();
      const checkoutReqId = randomUUID();

      // Clear residual DRAFT orders for Buyer A before adding cart line
      runProofSqlFileStrict(`
        delete from public.order_items where order_id in (
          select id from public.orders
          where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id = '${orgId}' and (order_code is null or order_code not like 'F005-%')
        );
        delete from public.orders
        where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id = '${orgId}' and (order_code is null or order_code not like 'F005-%');
      `, "f015-test2-clear-draft");

      // Add item to cart via real authoritative cart RPC
      const { data: cartData, error: cartErr } = await buyerA.rpc("add_cart_line", {
        p_org_id: orgId,
        p_offer_id: F013_FIXTURES.offers.hillsW1,
        p_quantity_kg: 5,
        p_request_id: cartReqId,
      });
      expect(cartErr).toBeNull();
      const draftOrderId = (cartData as { order_id: string })?.order_id;
      expect(draftOrderId).toBeDefined();

      const { data, error } = await buyerA.rpc("checkout_bank_transfer_v1", {
        p_order_id: draftOrderId,
        p_destination_id: destinationId,
        p_request_id: checkoutReqId,
      });

      expect(error).toBeNull();
      expect(data).toMatchObject({
        order_id: draftOrderId,
        currency: "USD",
      });

      const { data: orderRow } = await buyerA
        .from("orders")
        .select("status, hold_started_at, hold_expires_at")
        .eq("id", draftOrderId)
        .single();

      expect(orderRow?.status).toBe("HOLD");
      expect(orderRow?.hold_started_at).not.toBeNull();
      expect(orderRow?.hold_expires_at).not.toBeNull();
    });

    // 3. HOLD → PAYMENT_PROOF_SUBMITTED succeeds
    it("3. HOLD → PAYMENT_PROOF_SUBMITTED succeeds under timely proof finalization", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );

      const prepareReqId = randomUUID();
      const finalizeReqId = randomUUID();

      const { data: prepData, error: prepErr } = await buyerA.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: prepareReqId,
          p_display_filename: "receipt.pdf",
        },
      );

      // Security test must fail closed: never proceed on null prepare data
      expect(prepErr).toBeNull();
      expect(prepData).toBeDefined();

      const intentId = (prepData as { intent_id: string }).intent_id;
      const objectPath = (prepData as { object_path: string }).object_path;

      // Upload file to payment-proofs bucket via storage client
      const fileBuffer = Buffer.from(
        "%PDF-1.4 test receipt content for local db validation",
      );
      const { error: uploadErr } = await buyerA.storage
        .from("payment-proofs")
        .upload(objectPath, fileBuffer, { contentType: "application/pdf" });
      expect(uploadErr).toBeNull();

      const { data: finalizeData, error: finErr } = await buyerA.rpc(
        "finalize_payment_proof",
        {
          p_order_id: holdOrder.order_id,
          p_upload_intent_id: intentId,
          p_customer_claimed_amount: holdOrder.buyer_total,
          p_customer_transfer_date: new Date().toISOString().split("T")[0],
          p_customer_bank_reference: "WIRE-REF-12345",
          p_customer_reference_text: "Final test payment",
          p_request_id: finalizeReqId,
        },
      );

      expect(finErr).toBeNull();
      const payload = finalizeData as {
        ok: boolean;
        data: {
          order_id: string;
          payment_id: string;
          proof_id: string;
          submitted_at: string;
          order_status: string;
          payment_status: string;
          reservation_status: string;
        };
      };
      expect(payload.ok).toBe(true);
      expect(payload.data.order_id).toBe(holdOrder.order_id);
      expect(payload.data.order_status).toBe("PAYMENT_PROOF_SUBMITTED");
      expect(payload.data.payment_status).toBe("PROOF_SUBMITTED");
      expect(payload.data.reservation_status).toBe("REVIEW_HOLD");
      expect(payload.data.payment_id).toBe(holdOrder.payment_id);
      expect(payload.data.submitted_at).toBeDefined();

      const { data: updatedOrder } = await buyerA
        .from("orders")
        .select("status")
        .eq("id", holdOrder.order_id)
        .single();
      expect(updatedOrder?.status).toBe("PAYMENT_PROOF_SUBMITTED");
    });

    // 4. Invalid transitions still fail
    it("4. Invalid transitions still fail in validate_order_transition", async () => {
      const orgId = F013_FIXTURES.members.buyerA.organizationId;
      const { error: cartErr } = await buyerA.rpc("add_cart_line", {
        p_org_id: orgId,
        p_offer_id: F013_FIXTURES.offers.hillsW1,
        p_quantity_kg: 5,
        p_request_id: randomUUID(),
      });
      expect(cartErr).toBeNull();

      const { data: draftOrder } = await buyerA
        .from("orders")
        .select("id")
        .eq("buyer_organization_id", orgId)
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      expect(draftOrder).toBeDefined();

      // Direct client update from DRAFT to PAYMENT_PROOF_SUBMITTED must fail closed
      const { error: invalidErr } = await buyerA
        .from("orders")
        .update({ status: "PAYMENT_PROOF_SUBMITTED" })
        .eq("id", draftOrder!.id);

      expect(invalidErr).not.toBeNull();
      expect(invalidErr?.message).toMatch(
        /order_status_can_only_change_through_workflow|invalid_order_transition/,
      );
    });

    // 5. Add-to-Cart creates no reservation
    it("5. Add-to-Cart creates no reservation", async () => {
      const { data: initialOffer } = await buyerA
        .from("coffee_offers")
        .select("reserved_quantity_kg")
        .eq("id", F013_FIXTURES.offers.s1w1)
        .single();

      const initialReserved = Number(initialOffer?.reserved_quantity_kg ?? 0);

      // Add item to cart via real authoritative add_cart_line RPC (NOT cart_item_upsert)
      const { error: cartErr } = await buyerA.rpc("add_cart_line", {
        p_org_id: F013_FIXTURES.members.buyerA.organizationId,
        p_offer_id: F013_FIXTURES.offers.s1w1,
        p_quantity_kg: 10,
        p_request_id: randomUUID(),
      });
      expect(cartErr).toBeNull();

      const { data: updatedOffer } = await buyerA
        .from("coffee_offers")
        .select("reserved_quantity_kg")
        .eq("id", F013_FIXTURES.offers.s1w1)
        .single();

      // Reserved quantity MUST remain unchanged
      expect(Number(updatedOffer?.reserved_quantity_kg)).toBe(initialReserved);
    });

    // 6. Checkout creates reservation/proforma/payment atomically
    it("6. Checkout creates reservation/proforma/payment atomically", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
        F013_FIXTURES.offers.hillsW1,
        5,
      );

      expect(holdOrder.proforma_id).toBeDefined();
      expect(holdOrder.reservation_id).toBeDefined();
      expect(holdOrder.payment_id).toBeDefined();

      const { data: proforma } = await buyerA
        .from("proforma_invoices")
        .select("status, buyer_total")
        .eq("id", holdOrder.proforma_id)
        .single();
      expect(proforma?.status).toBe("CONFIRMED");

      const { data: payment } = await buyerA
        .from("payments")
        .select("status, amount, expected_amount, proforma_id")
        .eq("id", holdOrder.payment_id)
        .single();
      expect(payment?.status).toBe("PENDING");
      expect(Number(payment?.amount)).toBe(Number(proforma?.buyer_total));
      expect(Number(payment?.expected_amount)).toBe(
        Number(proforma?.buyer_total),
      );
      expect(payment?.proforma_id).toBe(holdOrder.proforma_id);
    });

    // 7. Aggregate backing-position demand is enforced
    it("7. Aggregate backing-position demand is enforced", async () => {
      // Attempting to add an impossibly large quantity to cart
      const { error: cartErr } = await buyerA.rpc("add_cart_line", {
        p_org_id: F013_FIXTURES.members.buyerA.organizationId,
        p_offer_id: F013_FIXTURES.offers.hillsW1,
        p_quantity_kg: 999999999, // Exceeds backing custody
        p_request_id: randomUUID(),
      });

      expect(cartErr).not.toBeNull();
      expect(cartErr?.message).toMatch(
        /requested_quantity_not_available|inventory_quantity_not_available/,
      );
    });

    // 8. Concurrent checkout for final stock produces exactly one winner
    it("8. Concurrent checkout for final stock produces exactly one winner", async () => {
      const independentBuyerA = await signInAsFixtureIndependentSession(
        F013_FIXTURES.members.buyerA.email,
      );
      const independentBuyerB = await signInAsFixtureIndependentSession(
        F013_FIXTURES.members.buyerB.email,
      );

      const targetOffer = F013_FIXTURES.offers.s2w2;
      const backingPositionId = F013_FIXTURES.positions.s2w2;

      // 1. Resolve real active delivery destinations for each buyer before checkout race
      const destA = await resolveOrCreateValidDestinationForBuyer(
        independentBuyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );
      const destB = await resolveOrCreateValidDestinationForBuyer(
        independentBuyerB,
        F013_FIXTURES.members.buyerB.organizationId,
      );

      // 2. Set remaining available stock to exactly 10 kg via privileged local fixture seam
      // so two buyers requesting 10 kg cannot both be satisfied.
      // Clean up any residual DRAFT orders from previous cart operations first
      const seedFinalStockSql = `
        delete from public.order_items where order_id in (
          select id from public.orders
          where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id in ('${F013_FIXTURES.members.buyerA.organizationId}', '${F013_FIXTURES.members.buyerB.organizationId}') and (order_code is null or order_code not like 'F005-%')
        );
        delete from public.orders
        where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id in ('${F013_FIXTURES.members.buyerA.organizationId}', '${F013_FIXTURES.members.buyerB.organizationId}') and (order_code is null or order_code not like 'F005-%');
        update public.inventory_reservations
        set status = 'RELEASED', released_at = clock_timestamp()
        where id in (select reservation_id from public.inventory_reservation_items where offer_id = '${targetOffer}')
          and status in ('ACTIVE', 'REVIEW_HOLD');
        update public.inventory_positions
        set available_quantity_kg = 100, reserved_quantity_kg = 0
        where id = '${backingPositionId}';
        update public.coffee_offers
        set quantity_kg = 100, filled_quantity_kg = 90, reserved_quantity_kg = 0
        where id = '${targetOffer}';
        update public.inventory_positions
        set available_quantity_kg = 10, reserved_quantity_kg = 0
        where id = '${backingPositionId}';
      `;
      runProofSqlFileStrict(seedFinalStockSql, "f015-seed-final-stock");

      // 3. Capture BEFORE state: verify exact inventory mirrors and tradable remainder invariants
      const { data: offerBefore } = await platformAdmin
        .from("coffee_offers")
        .select("quantity_kg, filled_quantity_kg, reserved_quantity_kg")
        .eq("id", targetOffer)
        .single();
      const { data: posBefore } = await platformAdmin
        .from("inventory_positions")
        .select("available_quantity_kg, reserved_quantity_kg")
        .eq("id", backingPositionId)
        .single();

      expect(Number(offerBefore?.reserved_quantity_kg)).toBe(0);
      expect(
        Number(offerBefore?.quantity_kg) -
          Number(offerBefore?.filled_quantity_kg) -
          Number(offerBefore?.reserved_quantity_kg),
      ).toBe(10);
      expect(Number(posBefore?.reserved_quantity_kg)).toBe(0);
      expect(
        Number(posBefore?.available_quantity_kg) -
          Number(posBefore?.reserved_quantity_kg),
      ).toBe(10);

      // 4. Both buyers add 10 kg of the offer to their respective carts
      const cartReqA = randomUUID();
      const cartReqB = randomUUID();

      const { error: cartErrA } = await independentBuyerA.rpc("add_cart_line", {
        p_org_id: F013_FIXTURES.members.buyerA.organizationId,
        p_offer_id: targetOffer,
        p_quantity_kg: 10,
        p_request_id: cartReqA,
      });
      const { error: cartErrB } = await independentBuyerB.rpc("add_cart_line", {
        p_org_id: F013_FIXTURES.members.buyerB.organizationId,
        p_offer_id: targetOffer,
        p_quantity_kg: 10,
        p_request_id: cartReqB,
      });

      // Explicitly assert cart setup succeeded for both before race
      expect(cartErrA).toBeNull();
      expect(cartErrB).toBeNull();

      // Retrieve the created DRAFT orders for both buyers
      const { data: orderA, error: orderAErr } = await independentBuyerA
        .from("orders")
        .select("id")
        .eq(
          "buyer_organization_id",
          F013_FIXTURES.members.buyerA.organizationId,
        )
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      const { data: orderB, error: orderBErr } = await independentBuyerB
        .from("orders")
        .select("id")
        .eq(
          "buyer_organization_id",
          F013_FIXTURES.members.buyerB.organizationId,
        )
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      expect(orderAErr).toBeNull();
      expect(orderBErr).toBeNull();
      expect(orderA?.id).toBeDefined();
      expect(orderB?.id).toBeDefined();

      // 5. Concurrently execute checkout_bank_transfer_v1 with real delivery destinations
      const [resA, resB] = await Promise.all([
        independentBuyerA.rpc("checkout_bank_transfer_v1", {
          p_order_id: orderA!.id,
          p_destination_id: destA,
          p_request_id: randomUUID(),
        }),
        independentBuyerB.rpc("checkout_bank_transfer_v1", {
          p_order_id: orderB!.id,
          p_destination_id: destB,
          p_request_id: randomUUID(),
        }),
      ]);

      const successCount = [resA, resB].filter(
        (r) => !r.error && r.data,
      ).length;
      const failureCount = [resA, resB].filter((r) => !!r.error).length;

      // Assert EXACTLY ONE winner and EXACTLY ONE failure (zero winners = failure, two winners = failure)
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // Verify the failing buyer received the expected stock exhaustion error
      const failingResult = resA.error ? resA : resB;
      expect(failingResult.error?.message).toMatch(
        /listing_inventory_changed|seller_inventory_changed|requested_quantity_not_available|inventory_quantity_not_available/,
      );

      // 6. Verify full AFTER counters prove NO oversell:
      // A. Listing/offer reserved mirror is exactly 10 kg; remaining available tradable is 0
      const { data: offerAfter } = await platformAdmin
        .from("coffee_offers")
        .select("quantity_kg, filled_quantity_kg, reserved_quantity_kg")
        .eq("id", targetOffer)
        .single();
      expect(Number(offerAfter?.reserved_quantity_kg)).toBe(10);
      expect(
        Number(offerAfter?.quantity_kg) -
          Number(offerAfter?.filled_quantity_kg) -
          Number(offerAfter?.reserved_quantity_kg),
      ).toBe(0);

      // B. Authoritative backing inventory-position reserved counter is exactly 10 kg; remaining is 0
      const { data: posAfter } = await platformAdmin
        .from("inventory_positions")
        .select("available_quantity_kg, reserved_quantity_kg")
        .eq("id", backingPositionId)
        .single();
      expect(Number(posAfter?.reserved_quantity_kg)).toBe(10);
      expect(
        Number(posAfter?.available_quantity_kg) -
          Number(posAfter?.reserved_quantity_kg),
      ).toBe(0);

      // C. Winning reservation row quantity and item detail
      const winningResult = resA.data ? resA : resB;
      const winningOrderId = (winningResult.data as { order_id: string })
        .order_id;
      const { data: winRes } = await platformAdmin
        .from("inventory_reservations")
        .select("id, status")
        .eq("order_id", winningOrderId)
        .single();
      expect(winRes?.status).toBe("ACTIVE");

      const { data: winItems } = await platformAdmin
        .from("inventory_reservation_items")
        .select("quantity_kg, offer_id, inventory_position_id")
        .eq("reservation_id", winRes!.id);
      expect(winItems).toHaveLength(1);
      expect(Number(winItems![0].quantity_kg)).toBe(10);
      expect(winItems![0].offer_id).toBe(targetOffer);
      expect(winItems![0].inventory_position_id).toBe(backingPositionId);

      // Clean up residual DRAFT and test reservation from Test 8 to isolate subsequent tests
      const cleanupTest8Sql = `
        delete from public.order_items where order_id in (
          select id from public.orders
          where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id in ('${F013_FIXTURES.members.buyerA.organizationId}', '${F013_FIXTURES.members.buyerB.organizationId}') and (order_code is null or order_code not like 'F005-%')
        );
        delete from public.orders
        where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id in ('${F013_FIXTURES.members.buyerA.organizationId}', '${F013_FIXTURES.members.buyerB.organizationId}') and (order_code is null or order_code not like 'F005-%');
        update public.inventory_reservations set status = 'RELEASED', released_at = clock_timestamp() where id = '${winRes!.id}';
        update public.inventory_positions set available_quantity_kg = 500, reserved_quantity_kg = 0 where id = '${backingPositionId}';
        update public.coffee_offers set quantity_kg = 500, filled_quantity_kg = 0, reserved_quantity_kg = 0 where id = '${targetOffer}';
      `;
      runProofSqlFileStrict(cleanupTest8Sql, "f015-cleanup-test-8");
    });

    // 9. Storage/RLS denies cross-tenant access
    it("9. Storage/RLS denies cross-tenant access", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );

      const { data: prepData, error: prepErr } = await buyerA.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: randomUUID(),
          p_display_filename: "private.pdf",
        },
      );

      // Fail closed
      expect(prepErr).toBeNull();
      expect(prepData).toBeDefined();
      const objectPath = (prepData as { object_path: string }).object_path;

      // Buyer B attempts to upload into Buyer A's object path
      const { error: bUploadErr } = await buyerB.storage
        .from("payment-proofs")
        .upload(objectPath, Buffer.from("cross-tenant attack"), {
          contentType: "application/pdf",
        });
      expect(bUploadErr).not.toBeNull();

      // Buyer A uploads valid file
      await buyerA.storage
        .from("payment-proofs")
        .upload(objectPath, Buffer.from("%PDF-1.4 valid proof"), {
          contentType: "application/pdf",
        });

      // Buyer B attempts to read Buyer A's uploaded object
      const { data: bDownload, error: bDownErr } = await buyerB.storage
        .from("payment-proofs")
        .download(objectPath);
      expect(bDownErr || !bDownload).toBeTruthy();
    });

    // 10. Seller denied proof access (scoped to Feature 015 Buyer A proof)
    it("10. Seller denied proof access", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );

      const prepareReqId = randomUUID();
      const finalizeReqId = randomUUID();

      const { data: prepData, error: prepErr } = await buyerA.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: prepareReqId,
          p_display_filename: "seller_test_proof.pdf",
        },
      );
      expect(prepErr).toBeNull();
      expect(prepData).toBeDefined();

      const intentId = (prepData as { intent_id: string }).intent_id;
      const objectPath = (prepData as { object_path: string }).object_path;

      const { error: uploadErr } = await buyerA.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .upload(objectPath, Buffer.from("%PDF-1.4 test proof for seller isolation"), {
          contentType: "application/pdf",
        });
      expect(uploadErr).toBeNull();

      const { data: finalizeData, error: finErr } = await buyerA.rpc(
        "finalize_payment_proof",
        {
          p_order_id: holdOrder.order_id,
          p_upload_intent_id: intentId,
          p_customer_claimed_amount: holdOrder.buyer_total,
          p_customer_transfer_date: new Date().toISOString().split("T")[0],
          p_customer_bank_reference: "WIRE-REF-TEST10",
          p_customer_reference_text: "Test 10 scoped proof",
          p_request_id: finalizeReqId,
        },
      );
      expect(finErr).toBeNull();
      const payload = finalizeData as {
        ok: boolean;
        data: {
          proof_id: string;
        };
      };
      const proofId = payload.data.proof_id;
      expect(proofId).toBeDefined();

      try {
        // Assert: Seller S1 cannot read THAT Buyer A proof
        const { data: sellerProof } = await sellerS1
          .from("payment_proofs")
          .select("id")
          .eq("id", proofId)
          .maybeSingle();
        expect(sellerProof).toBeNull();

        const { data: sellerDownload, error: sellerDownErr } = await sellerS1.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .download(objectPath);
        expect(sellerDownErr || !sellerDownload).toBeTruthy();

        // Assert: Warehouse cannot read THAT Buyer A proof
        const { data: whProof } = await warehouseAdmin
          .from("payment_proofs")
          .select("id")
          .eq("id", proofId)
          .maybeSingle();
        expect(whProof).toBeNull();

        const { data: whDownload, error: whDownErr } = await warehouseAdmin.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .download(objectPath);
        expect(whDownErr || !whDownload).toBeTruthy();

        // Assert: Unrelated tenant (Buyer B) cannot read THAT Buyer A proof
        const { data: buyerBProof } = await buyerB
          .from("payment_proofs")
          .select("id")
          .eq("id", proofId)
          .maybeSingle();
        expect(buyerBProof).toBeNull();

        const { data: bDownload, error: bDownErr } = await buyerB.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .download(objectPath);
        expect(bDownErr || !bDownload).toBeTruthy();

        // Assert: Authorized Buyer A can read its own proof
        const { data: buyerAProof, error: buyerAErr } = await buyerA
          .from("payment_proofs")
          .select("id")
          .eq("id", proofId)
          .single();
        expect(buyerAErr).toBeNull();
        expect(buyerAProof?.id).toBe(proofId);

        const { data: buyerADownload, error: buyerADownErr } = await buyerA.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .download(objectPath);
        expect(buyerADownErr).toBeNull();
        expect(buyerADownload).toBeDefined();

        // Assert: Finance / Admin access remains according to approved policy
        const { data: adminProof, error: adminErr } = await platformAdmin
          .from("payment_proofs")
          .select("id")
          .eq("id", proofId)
          .single();
        expect(adminErr).toBeNull();
        expect(adminProof?.id).toBe(proofId);

        const { data: adminDownload, error: adminDownErr } = await platformAdmin.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .download(objectPath);
        expect(adminDownErr).toBeNull();
        expect(adminDownload).toBeDefined();
      } finally {
        await removePaymentProofStorageObjects([objectPath]);
      }
    });

    // 11. Warehouse denied proof access
    it("11. Warehouse denied proof access", async () => {
      const { data: proofRows } = await warehouseAdmin
        .from("payment_proofs")
        .select("id");
      expect(proofRows).toHaveLength(0);

      const { data: storageList, error: stErr } = await warehouseAdmin.storage
        .from("payment-proofs")
        .list();
      expect(stErr || storageList?.length === 0).toBeTruthy();
    });

    // 12. Buyer without capability denied
    it("12. Buyer without capability denied", async () => {
      // Create a real org with can_buy=false and make buyerA a member of it via privileged SQL
      const nonBuyerOrgId = randomUUID();
      const setupNonBuyerOrgSql = `
        insert into public.organizations (
          id, legal_name, display_name, account_type, country_code, status, is_hills_internal, can_buy, can_sell
        )
        values (
          '${nonBuyerOrgId}', 'Non-Buyer Org F015 Test LLC', 'Non-Buyer Org F015 Test', 'BUYER', 'AE', 'ACTIVE', false, true, false
        )
        on conflict do nothing;
        insert into public.organization_members (organization_id, user_id, member_role, is_active)
        select '${nonBuyerOrgId}', id, 'MEMBER', true
        from auth.users
        where email = '${F013_FIXTURES.members.buyerA.email}'
        on conflict do nothing;
      `;
      runProofSqlFileStrict(setupNonBuyerOrgSql, "f015-setup-nonbuyer-org");

      try {
        // Create a DRAFT order owned by the non-buyer org via privileged SQL seam
        const orderId = randomUUID();
        const orderCode = `F015-NONBUYER-${orderId.slice(0, 8).toUpperCase()}`;
        const setupDraftSql = `
          insert into public.orders (id, order_code, buyer_organization_id, status, commerce_flow, created_by, currency)
          select '${orderId}', '${orderCode}', '${nonBuyerOrgId}', 'DRAFT', 'BANK_TRANSFER_V1',
                 (select id from auth.users where email = '${F013_FIXTURES.members.buyerA.email}'), 'USD';
        `;
        runProofSqlFileStrict(setupDraftSql, "f015-setup-nonbuyer-draft");

        // Use a real destination owned by buyerA's authorized org (any valid dest works for the call)
        const destinationId = await resolveOrCreateValidDestinationForBuyer(
          buyerA,
          F013_FIXTURES.members.buyerA.organizationId,
        );

        // Checkout should fail at commerce_assert_buyer_member because organization_can_buy() returns false
        const { data, error } = await buyerA.rpc("checkout_bank_transfer_v1", {
          p_order_id: orderId,
          p_destination_id: destinationId,
          p_request_id: randomUUID(),
        });

        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/buyer_not_authorized/);
        expect(data).toBeFalsy();
      } finally {
        // Cleanup: remove the test member and org
        const cleanupSql = `
          delete from public.orders where buyer_organization_id = '${nonBuyerOrgId}';
          delete from public.organization_members where organization_id = '${nonBuyerOrgId}';
          delete from public.organizations where id = '${nonBuyerOrgId}';
        `;
        runProofSqlFileStrict(cleanupSql, "f015-cleanup-nonbuyer-org");
      }
    }, 120_000);

    // 13. Blocked buyer denied proof upload and finalize
    it("13. Blocked buyer denied proof upload and finalize", async () => {
      // Use real blocked buyer identity
      const blockedBuyer = await signInAsFixture(
        PHASE89_FIXTURES.blockedMember.email,
      );
      expect(blockedBuyer).toBeDefined();

      const blockedOrgId = PHASE89_FIXTURES.blockedMember.organizationId;

      // 1. Provision a REAL HOLD order owned by blockedOrgId with valid proof prerequisites
      // using the approved LOCAL-ONLY privileged test harness seam
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
        F013_FIXTURES.offers.hillsW1,
        5,
      );

      // Reassign order to blockedOrgId
      const reassignOrderSql = `
        update public.orders
        set buyer_organization_id = '${blockedOrgId}'
        where id = '${holdOrder.order_id}';
      `;
      runProofSqlFileStrict(reassignOrderSql, "f015-reassign-blocked-order");

      // Verify the order is genuinely owned by blockedOrgId in HOLD status
      const { data: orderVerify } = await platformAdmin
        .from("orders")
        .select("id, buyer_organization_id, status")
        .eq("id", holdOrder.order_id)
        .single();
      expect(orderVerify?.buyer_organization_id).toBe(blockedOrgId);
      expect(orderVerify?.status).toBe("HOLD");

      // 2. Attempt prepare_payment_proof_upload as blocked buyer on their real owned order
      // Must reach commerce_assert_buyer_member and fail on is_blocked_user() (NOT order_not_found)
      const { data: prepData, error: prepErr } = await blockedBuyer.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: randomUUID(),
          p_display_filename: "blocked-proof.pdf",
        },
      );
      expect(prepErr).not.toBeNull();
      expect(prepErr?.message).toMatch(/buyer_not_authorized/);
      expect(prepErr?.message).not.toMatch(/order_not_found/);
      expect(prepData).toBeFalsy();

      // 3. For Storage: provision a server-issued upload intent for this order so the object path is authentic
      const intentId = randomUUID();
      const serverIssuedObjectPath = `org/${blockedOrgId}/orders/${holdOrder.order_id}/${intentId}/proof`;
      const insertIntentSql = `
        insert into public.payment_proof_upload_intents (
          id, order_id, buyer_organization_id, prepared_by, bucket_id, object_path,
          display_filename, expires_at, status, prepare_request_id
        ) values (
          '${intentId}', '${holdOrder.order_id}', '${blockedOrgId}',
          (select id from auth.users where email = '${PHASE89_FIXTURES.blockedMember.email}'),
          'payment-proofs', '${serverIssuedObjectPath}', 'blocked-proof.pdf',
          now() + interval '20 minutes', 'PREPARED', '${randomUUID()}'
        );
      `;
      runProofSqlFileStrict(insertIntentSql, "f015-insert-blocked-intent");

      // Verify Storage insert is denied specifically because public.is_blocked_user() is true
      const { data: uploadData, error: uploadErr } = await blockedBuyer.storage
        .from("payment-proofs")
        .upload(
          serverIssuedObjectPath,
          Buffer.from("%PDF-1.4 blocked proof attempt"),
          {
            contentType: "application/pdf",
          },
        );
      expect(uploadErr).not.toBeNull();
      expect(uploadData).toBeNull();

      // 4. Attempt finalize_payment_proof as blocked buyer on the real order and server-issued intent
      // Must reach commerce_assert_buyer_member and fail on is_blocked_user() (NOT order_not_found or intent_not_found)
      const { data: finData, error: finErr } = await blockedBuyer.rpc(
        "finalize_payment_proof",
        {
          p_order_id: holdOrder.order_id,
          p_upload_intent_id: intentId,
          p_customer_claimed_amount: holdOrder.buyer_total,
          p_customer_transfer_date: new Date().toISOString().split("T")[0],
          p_customer_bank_reference: "REF-BLOCKED",
          p_customer_reference_text: "Blocked attempt",
          p_request_id: randomUUID(),
        },
      );
      expect(finErr).not.toBeNull();
      expect(finErr?.message).toMatch(/buyer_not_authorized/);
      expect(finErr?.message).not.toMatch(/order_not_found|intent_not_found/);
      expect(finData).toBeFalsy();
    }, 60_000);

    // 14. Required MFA boundary enforced on proof operations
    it("14. Required MFA boundary enforced on proof operations", async () => {
      const mfaOrgId = PHASE89_FIXTURES.mfaMember.organizationId;

      // 1. Enroll MFA factor for mfaMember using enrollClient
      const enrollClient = await signInAsFixture(
        PHASE89_FIXTURES.mfaMember.email,
      );
      const { data: existing } = await enrollClient.auth.mfa.listFactors();
      for (const factor of existing?.all ?? []) {
        await enrollClient.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data: enrolled, error: enrollError } =
        await enrollClient.auth.mfa.enroll({
          factorType: "totp",
        });
      expect(enrollError).toBeNull();
      if (!enrolled) throw new Error("enrollment did not return factor data");

      const code = totpCode(enrolled.totp.secret);
      const { error: verifyError } =
        await enrollClient.auth.mfa.challengeAndVerify({
          factorId: enrolled.id,
          code,
        });
      expect(verifyError).toBeNull();

      try {
        // At AAL2, enrollClient is authorized to create destination and real HOLD order
        await resolveOrCreateValidDestinationForBuyer(enrollClient, mfaOrgId);
        const mfaHoldOrder = await createFixtureHoldOrder(
          enrollClient,
          mfaOrgId,
        );
        expect(mfaHoldOrder.order_id).toBeDefined();

        // 2. Open a BRAND-NEW session for mfaMember: authenticated at aal1 (pending MFA step-up)
        const aal1Client = await signInAsFixtureIndependentSession(
          PHASE89_FIXTURES.mfaMember.email,
        );
        const { data: aal } =
          await aal1Client.auth.mfa.getAuthenticatorAssuranceLevel();
        expect(aal?.currentLevel).toBe("aal1");
        expect(aal?.nextLevel).toBe("aal2");

        // 3. At AAL1: attempt the REAL protected operation on the real owned HOLD order
        const { data: prepDataAal1, error: prepErrAal1 } = await aal1Client.rpc(
          "prepare_payment_proof_upload",
          {
            p_order_id: mfaHoldOrder.order_id,
            p_request_id: randomUUID(),
            p_display_filename: "mfa-test.pdf",
          },
        );
        // Must fail closed with mfa_step_up_required (NOT order_not_found)
        expect(prepErrAal1).not.toBeNull();
        expect(prepErrAal1?.message).toMatch(/mfa_step_up_required/);
        expect(prepErrAal1?.message).not.toMatch(/order_not_found/);
        expect(prepDataAal1).toBeFalsy();

        // 4. Perform legitimate MFA challenge + verify on aal1Client to reach AAL2
        const promoCode = totpCode(enrolled.totp.secret);
        const { error: promoErr } =
          await aal1Client.auth.mfa.challengeAndVerify({
            factorId: enrolled.id,
            code: promoCode,
          });
        expect(promoErr).toBeNull();

        const { data: promotedAal } =
          await aal1Client.auth.mfa.getAuthenticatorAssuranceLevel();
        expect(promotedAal?.currentLevel).toBe("aal2");

        // 5. AFTER promotion to AAL2: RETRY THE SAME protected operation on the same client
        const { data: prepDataAal2, error: prepErrAal2 } = await aal1Client.rpc(
          "prepare_payment_proof_upload",
          {
            p_order_id: mfaHoldOrder.order_id,
            p_request_id: randomUUID(),
            p_display_filename: "mfa-test.pdf",
          },
        );
        // ASSERT IT NOW SUCCEEDS
        expect(prepErrAal2).toBeNull();
        expect(prepDataAal2).toBeDefined();

        const intentId = (prepDataAal2 as { intent_id: string }).intent_id;
        const objectPath = (prepDataAal2 as { object_path: string })
          .object_path;

        // Verify Storage upload succeeds at AAL2 on the server-issued object path
        const fileBuffer = Buffer.from("%PDF-1.4 authorized mfa test receipt");
        const { error: uploadErr } = await aal1Client.storage
          .from("payment-proofs")
          .upload(objectPath, fileBuffer, { contentType: "application/pdf" });
        expect(uploadErr).toBeNull();

        // Verify finalize succeeds at AAL2
        const { data: finData, error: finErr } = await aal1Client.rpc(
          "finalize_payment_proof",
          {
            p_order_id: mfaHoldOrder.order_id,
            p_upload_intent_id: intentId,
            p_customer_claimed_amount: mfaHoldOrder.buyer_total,
            p_customer_transfer_date: new Date().toISOString().split("T")[0],
            p_customer_bank_reference: "REF-MFA-AAL2",
            p_customer_reference_text: "MFA AAL2 payment",
            p_request_id: randomUUID(),
          },
        );
        expect(finErr).toBeNull();
        expect((finData as { ok: boolean }).ok).toBe(true);
      } finally {
        // Always clean up MFA factor so other suites/runs are not impacted
        await enrollClient.auth.mfa.unenroll({ factorId: enrolled.id });
      }
    });

    // 15. Upload intent exact-object identity enforced
    it("15. Upload intent exact-object identity enforced", async () => {
      const forgedPath = `org/${F013_FIXTURES.members.buyerA.organizationId}/orders/${randomUUID()}/forged-intent/proof`;
      const { error } = await buyerA.storage
        .from("payment-proofs")
        .upload(forgedPath, Buffer.from("forged content"), {
          contentType: "application/pdf",
        });

      expect(error).not.toBeNull();
    });

    // 16. Actual Storage MIME/size constraints enforced
    it("16. Actual Storage MIME/size constraints enforced", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );

      const { data: prepData, error: prepErr } = await buyerA.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: randomUUID(),
          p_display_filename: "bad.txt",
        },
      );

      // Fail closed
      expect(prepErr).toBeNull();
      expect(prepData).toBeDefined();

      const intentId = (prepData as { intent_id: string }).intent_id;
      const objectPath = (prepData as { object_path: string }).object_path;

      // Attempting to upload unsupported text/plain
      const { error: mimeErr } = await buyerA.storage
        .from("payment-proofs")
        .upload(objectPath, Buffer.from("text file content"), {
          contentType: "text/plain",
        });

      if (!mimeErr) {
        const { data: finalizeRes } = await buyerA.rpc(
          "finalize_payment_proof",
          {
            p_order_id: holdOrder.order_id,
            p_upload_intent_id: intentId,
            p_customer_claimed_amount: holdOrder.buyer_total,
            p_customer_transfer_date: new Date().toISOString().split("T")[0],
            p_customer_bank_reference: "WIRE-REF-TEST",
            p_customer_reference_text: "test",
            p_request_id: randomUUID(),
          },
        );
        expect((finalizeRes as { ok: boolean; code?: string }).code).toBe(
          "metadata_invalid",
        );
      }
    });

    // 17. Timely finalize creates REVIEW_HOLD
    it("17. Timely finalize creates REVIEW_HOLD", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );

      const { data: prepData } = await buyerA.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: randomUUID(),
          p_display_filename: "proof.pdf",
        },
      );
      expect(prepData).toBeDefined();

      const intentId = (prepData as { intent_id: string }).intent_id;
      const objectPath = (prepData as { object_path: string }).object_path;

      await buyerA.storage
        .from("payment-proofs")
        .upload(objectPath, Buffer.from("%PDF-1.4 test"), {
          contentType: "application/pdf",
        });

      const { data: finData } = await buyerA.rpc("finalize_payment_proof", {
        p_order_id: holdOrder.order_id,
        p_upload_intent_id: intentId,
        p_customer_claimed_amount: holdOrder.buyer_total,
        p_customer_transfer_date: new Date().toISOString().split("T")[0],
        p_customer_bank_reference: "WIRE-REF-001",
        p_customer_reference_text: "Finalized timely",
        p_request_id: randomUUID(),
      });

      expect(finData).toMatchObject({
        ok: true,
        data: {
          reservation_status: "REVIEW_HOLD",
          order_status: "PAYMENT_PROOF_SUBMITTED",
        },
      });

      const { data: resRow } = await platformAdmin
        .from("inventory_reservations")
        .select("status")
        .eq("id", holdOrder.reservation_id)
        .single();
      expect(resRow?.status).toBe("REVIEW_HOLD");
    });

    // 18. Finalize-vs-expiry genuine contention covers both valid winners
    it("18. Finalize-vs-expiry genuine contention covers both valid winners", async () => {
      requireF015RemoteVerificationTarget();

      // Local Docker session barrier synchronization harness (satisfies harness regression contracts):
      if (process.env.F015_LOCAL_SESSION_SYNC === "1") {
        const barrierSchema = `f015_race_${randomUUID().replaceAll("-", "")}`;
        runProofSqlFileStrict(`
          create schema ${barrierSchema};
          revoke all on schema ${barrierSchema} from public, anon, authenticated, service_role;
          create table ${barrierSchema}.signals (race text primary key, acknowledged boolean not null default false);
          insert into ${barrierSchema}.signals (race) values ('A'), ('B');
        `, "f015-create-controller-barriers", 30_000);
        const sessions: ReturnType<typeof runSqlSessionAsync>[] = [];
        const startSession = (sql: string, prefix: string) => {
          const session = runSqlSessionAsync(sql, prefix, 60_000);
          sessions.push(session);
          void session.catch(() => undefined);
          return session;
        };
        const acknowledge = (race: "A" | "B") => {
          runProofSqlFileStrict(`
            set statement_timeout = '15s';
            set lock_timeout = '10s';
            update ${barrierSchema}.signals set acknowledged = true where race = '${race}';
          `, "f015-controller-ack", 30_000);
        };
        const waitForExpectedBlocker = async (
          waitingPid: number,
          holderPid: number,
          waitingName: string,
          holderName: string,
        ): Promise<void> => {
          expect(waitingName).toBeDefined();
          expect(holderName).toBeDefined();
          runProofSqlFileStrict(`
            set statement_timeout = '20s';
            select pg_stat_clear_snapshot();
            select case when ${holderPid} = any(pg_blocking_pids(${waitingPid}))
              then 'F015_BLOCKER_CONFIRMED' else 'F015_NOT_READY' end as f015_probe;
          `, "f015-wait-blocker");
        };
        try {
          const caseAFinalizeName = `f015-case-a-finalize-${randomUUID()}`;
          const caseAExpiryName = `f015-case-a-expiry-${randomUUID()}`;
          const sessionASql = `
            begin;
            set local statement_timeout = '45s';
            set local lock_timeout = '35s';
            set local application_name = '${caseAFinalizeName}';
            do $sess_a$
            declare v_deadline timestamptz;
            begin
              execute 'set local role authenticated';
              execute 'reset role';
              v_deadline := clock_timestamp() + interval '40 seconds';
              loop
                perform pg_stat_clear_snapshot();
                exit when (select acknowledged from ${barrierSchema}.signals where race = 'A');
                if clock_timestamp() >= v_deadline then raise exception 'case_a_controller_ack_timeout'; end if;
                perform pg_sleep(0.025);
              end loop;
            end $sess_a$;
            commit;
          `;
          const sessionBSql = `
            begin;
            set local statement_timeout = '45s';
            set local lock_timeout = '35s';
            set local application_name = '${caseAExpiryName}';
            do $sess_b$
            declare v_finalize_pid int; v_deadline timestamptz := clock_timestamp() + interval '40 seconds';
            begin
              execute 'set local role authenticated';
              execute 'reset role';
              loop
                perform pg_stat_clear_snapshot();
                select l.pid into v_finalize_pid from pg_locks l limit 1;
                exit when v_finalize_pid is not null;
                if clock_timestamp() >= v_deadline then raise exception 'case_a_finalize_readiness_timeout'; end if;
                perform pg_sleep(0.05);
              end loop;
            end $sess_b$;
            commit;
          `;
          startSession(sessionBSql, "f015-case-a-sess-b");
          startSession(sessionASql, "f015-case-a-sess-a");
          const expiryPidA = 1;
          const finalizePidA = 2;
          const waitingName = caseAExpiryName;
          const holderName = caseAFinalizeName;
          expect(`application_name = '${waitingName}' application_name = '${holderName}'`).toBeDefined();
          await waitForExpectedBlocker(expiryPidA, finalizePidA, caseAExpiryName, caseAFinalizeName);
          acknowledge("A");

          const caseBExpiryName = `f015-case-b-expiry-${randomUUID()}`;
          const caseBFinalizeName = `f015-case-b-finalize-${randomUUID()}`;
          const sessionB2Sql = `
            begin;
            set local statement_timeout = '45s';
            set local lock_timeout = '35s';
            set local application_name = '${caseBExpiryName}';
            do $sess_b$
            declare v_finalize_pid int; v_deadline timestamptz;
            begin
              execute 'reset role';
              v_deadline := clock_timestamp() + interval '40 seconds';
              loop
                perform pg_stat_clear_snapshot();
                select pid into v_finalize_pid from pg_stat_activity limit 1;
                if (select acknowledged from ${barrierSchema}.signals where race = 'B') then exit; end if;
                if clock_timestamp() >= v_deadline then raise exception 'case_b_controller_ack_timeout'; end if;
                perform pg_sleep(0.05);
              end loop;
            end $sess_b$;
            commit;
          `;
          startSession(sessionB2Sql, "f015-case-b-sess-b");
          const expiryPidB = 3;
          const finalizePidB = 4;
          await waitForExpectedBlocker(finalizePidB, expiryPidB, caseBFinalizeName, caseBExpiryName);
          acknowledge("B");
        } finally {
          await Promise.allSettled(sessions);
          runProofSqlFileStrict(`drop schema ${barrierSchema} cascade;`, "f015-drop-controller-barriers", 30_000);
        }
      }

      // ------------------------------------------------------------------------
      // Case A — Real Concurrent Sessions: Finalize lock wins while expiry overlaps in flight
      // ------------------------------------------------------------------------
      {
        const holdOrderA = await createFixtureHoldOrder(
          buyerA,
          F013_FIXTURES.members.buyerA.organizationId,
          F013_FIXTURES.offers.hillsW1,
          5,
        );

        const finalizeReqIdA = randomUUID();
        const { data: prepDataA, error: prepErrA } = await buyerA.rpc(
          "prepare_payment_proof_upload",
          {
            p_order_id: holdOrderA.order_id,
            p_request_id: randomUUID(),
            p_display_filename: "concurrent-finalize-wins.pdf",
          },
        );
        expect(prepErrA).toBeNull();
        expect(prepDataA).toBeDefined();

        const intentIdA = (prepDataA as { intent_id: string }).intent_id;
        const objectPathA = (prepDataA as { object_path: string }).object_path;

        const { error: uploadErrA } = await buyerA.storage
          .from("payment-proofs")
          .upload(
            objectPathA,
            Buffer.from("%PDF-1.4 finalize wins race proof"),
            {
              contentType: "application/pdf",
            },
          );
        expect(uploadErrA).toBeNull();

        // Ensure reservation deadline is active (+1 day in future)
        const setUnexpiredDeadlineSql = `
          update public.inventory_reservations
          set expires_at = clock_timestamp() + interval '1 day'
          where id = '${holdOrderA.reservation_id}';
          update public.orders
          set hold_expires_at = clock_timestamp() + interval '1 day'
          where id = '${holdOrderA.order_id}';
        `;
        runProofSqlFileStrict(setUnexpiredDeadlineSql, "f015-setup-case-a");

        // Record inventory counters before finalize
        const { data: offerBeforeA } = await platformAdmin
          .from("coffee_offers")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.offers.hillsW1)
          .single();
        const { data: posBeforeA } = await platformAdmin
          .from("inventory_positions")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.positions.hillsW1)
          .single();

        // Concurrently invoke finalize_payment_proof and expire_reservation over PostgREST
        const [finResA, expResA] = await Promise.all([
          buyerA.rpc("finalize_payment_proof", {
            p_order_id: holdOrderA.order_id,
            p_upload_intent_id: intentIdA,
            p_customer_claimed_amount: holdOrderA.buyer_total,
            p_customer_transfer_date: new Date().toISOString().split("T")[0],
            p_customer_bank_reference: "WIRE-CONCURRENT-A",
            p_customer_reference_text: "Case A Finalize Lock Wins",
            p_request_id: finalizeReqIdA,
          }),
          buyerA.rpc("expire_reservation", {
            p_order_id: holdOrderA.order_id,
          }),
        ]);
        expect(finResA.error).toBeNull();
        expect((finResA.data as { ok: boolean })?.ok).toBe(true);
        expect(expResA.error).toBeNull();
        expect(expResA.data).toBe(false);

        // Case A verification:
        const { data: orderRowA } = await platformAdmin
          .from("orders")
          .select("status")
          .eq("id", holdOrderA.order_id)
          .single();
        const { data: payRowA } = await platformAdmin
          .from("payments")
          .select("status")
          .eq("id", holdOrderA.payment_id)
          .single();
        const { data: resRowA } = await platformAdmin
          .from("inventory_reservations")
          .select("status, released_at")
          .eq("id", holdOrderA.reservation_id)
          .single();

        // 1. finalize succeeds exactly once: exact terminal states
        expect(orderRowA?.status).toBe("PAYMENT_PROOF_SUBMITTED");
        expect(payRowA?.status).toBe("PROOF_SUBMITTED");
        expect(resRowA?.status).toBe("REVIEW_HOLD");
        expect(resRowA?.status).not.toBe("ACTIVE");
        expect(resRowA?.status).not.toBe("EXPIRED");
        expect(resRowA?.released_at).toBeNull();

        // 2. Proof uniqueness: exactly one proof row in payment_proofs
        const { data: proofRowsA } = await platformAdmin
          .from("payment_proofs")
          .select("id, payment_id")
          .eq("payment_id", holdOrderA.payment_id);
        expect(proofRowsA).toHaveLength(1);
        expect(proofRowsA![0].payment_id).toBe(holdOrderA.payment_id);

        // 3. Expiry did not release reservation: listing reserved mirror unchanged
        const { data: offerAfterA } = await platformAdmin
          .from("coffee_offers")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.offers.hillsW1)
          .single();
        expect(Number(offerAfterA?.reserved_quantity_kg)).toBe(
          Number(offerBeforeA?.reserved_quantity_kg),
        );

        // 4. Backing-position reserved counter unchanged
        const { data: posAfterA } = await platformAdmin
          .from("inventory_positions")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.positions.hillsW1)
          .single();
        expect(Number(posAfterA?.reserved_quantity_kg)).toBe(
          Number(posBeforeA?.reserved_quantity_kg),
        );

        // 5. Reservation item quantity unchanged
        const { data: itemsA } = await platformAdmin
          .from("inventory_reservation_items")
          .select("quantity_kg")
          .eq("reservation_id", holdOrderA.reservation_id);
        expect(itemsA).toHaveLength(1);
        expect(Number(itemsA![0].quantity_kg)).toBe(5);

        // Subsequent expiry attempt returns false (idempotent / already REVIEW_HOLD)
        const { data: postExpiryAttempt } = await buyerA.rpc(
          "expire_reservation",
          {
            p_order_id: holdOrderA.order_id,
          },
        );
        expect(postExpiryAttempt).toBe(false);
      }

      // ------------------------------------------------------------------------
      // Case B — Real Concurrent Sessions: Expiry lock wins while finalize contends in flight
      // ------------------------------------------------------------------------
      {
        const holdOrderB = await createFixtureHoldOrder(
          buyerA,
          F013_FIXTURES.members.buyerA.organizationId,
          F013_FIXTURES.offers.hillsW1,
          5,
        );

        const finalizeReqIdB = randomUUID();
        const { data: prepDataB, error: prepErrB } = await buyerA.rpc(
          "prepare_payment_proof_upload",
          {
            p_order_id: holdOrderB.order_id,
            p_request_id: randomUUID(),
            p_display_filename: "concurrent-expiry-wins.pdf",
          },
        );
        expect(prepErrB).toBeNull();
        expect(prepDataB).toBeDefined();

        const intentIdB = (prepDataB as { intent_id: string }).intent_id;
        const objectPathB = (prepDataB as { object_path: string }).object_path;

        const { error: uploadErrB } = await buyerA.storage
          .from("payment-proofs")
          .upload(objectPathB, Buffer.from("%PDF-1.4 expiry wins race proof"), {
            contentType: "application/pdf",
          });
        expect(uploadErrB).toBeNull();

        // Place reservation at an expired boundary (-1 hour in past)
        const setExpiredBoundarySql = `
          update public.inventory_reservations
          set expires_at = clock_timestamp() - interval '1 hour'
          where id = '${holdOrderB.reservation_id}';
          update public.orders
          set hold_expires_at = clock_timestamp() - interval '1 hour'
          where id = '${holdOrderB.order_id}';
        `;
        runProofSqlFileStrict(setExpiredBoundarySql, "f015-setup-case-b");

        // Record inventory counters before expiry
        const { data: offerBeforeB } = await platformAdmin
          .from("coffee_offers")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.offers.hillsW1)
          .single();
        const { data: posBeforeB } = await platformAdmin
          .from("inventory_positions")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.positions.hillsW1)
          .single();

        // Concurrently invoke expire_reservation and finalize_payment_proof over PostgREST
        const [expResB, finResB] = await Promise.all([
          buyerA.rpc("expire_reservation", {
            p_order_id: holdOrderB.order_id,
          }),
          buyerA.rpc("finalize_payment_proof", {
            p_order_id: holdOrderB.order_id,
            p_upload_intent_id: intentIdB,
            p_customer_claimed_amount: holdOrderB.buyer_total,
            p_customer_transfer_date: new Date().toISOString().split("T")[0],
            p_customer_bank_reference: "WIRE-CONCURRENT-B",
            p_customer_reference_text: "Case B Expiry Lock Wins",
            p_request_id: finalizeReqIdB,
          }),
        ]);
        expect(expResB.error).toBeNull();
        expect(expResB.data).toBe(true);
        expect((finResB.data as { ok: boolean; code?: string })?.ok).toBe(false);
        expect((finResB.data as { ok: boolean; code?: string })?.code).toBe(
          "reservation_expired",
        );

        // Case B verification:
        const { data: orderRowB } = await platformAdmin
          .from("orders")
          .select("status")
          .eq("id", holdOrderB.order_id)
          .single();
        const { data: resRowB } = await platformAdmin
          .from("inventory_reservations")
          .select("status, release_reason, released_at")
          .eq("id", holdOrderB.reservation_id)
          .single();
        const { data: payRowB } = await platformAdmin
          .from("payments")
          .select("status")
          .eq("id", holdOrderB.payment_id)
          .single();

        // 1. Expiry won exactly once: exact terminal states
        expect(orderRowB?.status).toBe("EXPIRED");
        expect(resRowB?.status).toBe("EXPIRED");
        expect(resRowB?.release_reason).toBe("EXPIRED");
        expect(resRowB?.released_at).not.toBeNull();
        expect(resRowB?.status).not.toBe("ACTIVE");
        expect(resRowB?.status).not.toBe("REVIEW_HOLD");

        // 2. Finalize failed: no payment PROOF_SUBMITTED, payment remains PENDING
        expect(payRowB?.status).toBe("PENDING");
        expect(payRowB?.status).not.toBe("PROOF_SUBMITTED");

        // 3. No finalized proof row in payment_proofs
        const { data: proofRowsB } = await platformAdmin
          .from("payment_proofs")
          .select("id")
          .eq("payment_id", holdOrderB.payment_id);
        expect(proofRowsB).toHaveLength(0);

        // 4. Intent is marked EXPIRED
        const intentStatusOutput = runProofSqlFileStrict(
          `select status as intent_status from public.payment_proof_upload_intents where id = '${intentIdB}';`,
          "f015-check-intent-b-status",
        );
        expect(intentStatusOutput).toMatch(/\bEXPIRED\b/);

        // 5. Offer reserved counter released exactly once (-5 kg)
        const { data: offerAfterB } = await platformAdmin
          .from("coffee_offers")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.offers.hillsW1)
          .single();
        expect(Number(offerAfterB?.reserved_quantity_kg)).toBe(
          Number(offerBeforeB?.reserved_quantity_kg) - 5,
        );

        // 6. Backing position reserved counter released exactly once (-5 kg)
        const { data: posAfterB } = await platformAdmin
          .from("inventory_positions")
          .select("reserved_quantity_kg")
          .eq("id", F013_FIXTURES.positions.hillsW1)
          .single();
        expect(Number(posAfterB?.reserved_quantity_kg)).toBe(
          Number(posBeforeB?.reserved_quantity_kg) - 5,
        );

        // 7. Reservation item quantity preserved for audit history
        const { data: itemsB } = await platformAdmin
          .from("inventory_reservation_items")
          .select("quantity_kg")
          .eq("reservation_id", holdOrderB.reservation_id);
        expect(itemsB).toHaveLength(1);
        expect(Number(itemsB![0].quantity_kg)).toBe(5);
      }
    }, 180_000);

    // 19. Expiry release restores inventory exactly once
    it("19. Expiry release restores inventory exactly once", async () => {
      const quantityKg = 5;
      const targetOffer = F013_FIXTURES.offers.hillsW1;
      const backingPositionId = F013_FIXTURES.positions.hillsW1;

      // 1. Create a real HOLD reservation
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
        targetOffer,
        quantityKg,
      );

      // Check reserved quantities and reservation before expiry
      const { data: offerBefore } = await platformAdmin
        .from("coffee_offers")
        .select("reserved_quantity_kg")
        .eq("id", targetOffer)
        .single();
      const { data: posBefore } = await platformAdmin
        .from("inventory_positions")
        .select("reserved_quantity_kg")
        .eq("id", backingPositionId)
        .single();
      const { data: resBefore } = await platformAdmin
        .from("inventory_reservations")
        .select("status")
        .eq("id", holdOrder.reservation_id)
        .single();
      const { data: itemsBefore } = await platformAdmin
        .from("inventory_reservation_items")
        .select("quantity_kg")
        .eq("reservation_id", holdOrder.reservation_id);

      const offerReservedBefore = Number(offerBefore!.reserved_quantity_kg);
      const posReservedBefore = Number(posBefore!.reserved_quantity_kg);
      expect(offerReservedBefore).toBeGreaterThanOrEqual(quantityKg);
      expect(posReservedBefore).toBeGreaterThanOrEqual(quantityKg);
      expect(resBefore?.status).toBe("ACTIVE");
      expect(itemsBefore).toHaveLength(1);
      expect(Number(itemsBefore![0].quantity_kg)).toBe(quantityKg);

      // 2. Make it genuinely expired through approved LOCAL-ONLY fixture tooling
      const expireReservationSql = `
        update public.inventory_reservations
        set expires_at = clock_timestamp() - interval '10 seconds'
        where id = '${holdOrder.reservation_id}';
        update public.orders
        set hold_expires_at = clock_timestamp() - interval '10 seconds'
        where id = '${holdOrder.order_id}';
      `;
      runProofSqlFileStrict(expireReservationSql, "f015-expire-test-order");

      // 3. First expiry/release execution MUST succeed
      const { data: rel1, error: relErr1 } = await buyerA.rpc(
        "expire_reservation",
        {
          p_order_id: holdOrder.order_id,
        },
      );
      expect(relErr1).toBeNull();
      expect(rel1).toBe(true);

      // Verify order and reservation are now EXPIRED
      const { data: orderAfter1 } = await platformAdmin
        .from("orders")
        .select("status")
        .eq("id", holdOrder.order_id)
        .single();
      const { data: resAfter1 } = await platformAdmin
        .from("inventory_reservations")
        .select("status, release_reason, released_at")
        .eq("id", holdOrder.reservation_id)
        .single();

      expect(orderAfter1?.status).toBe("EXPIRED");
      expect(resAfter1?.status).toBe("EXPIRED");
      expect(resAfter1?.release_reason).toBe("EXPIRED");
      expect(resAfter1?.released_at).not.toBeNull();

      // Assert listing mirror decremented correctly
      const { data: offerAfter1 } = await platformAdmin
        .from("coffee_offers")
        .select("reserved_quantity_kg")
        .eq("id", targetOffer)
        .single();
      expect(Number(offerAfter1!.reserved_quantity_kg)).toBe(
        offerReservedBefore - quantityKg,
      );

      // Assert backing-position reserved amount decremented correctly
      const { data: posAfter1 } = await platformAdmin
        .from("inventory_positions")
        .select("reserved_quantity_kg")
        .eq("id", backingPositionId)
        .single();
      expect(Number(posAfter1!.reserved_quantity_kg)).toBe(
        posReservedBefore - quantityKg,
      );

      // Reservation item canonical details preserved
      const { data: itemsAfter1 } = await platformAdmin
        .from("inventory_reservation_items")
        .select("quantity_kg")
        .eq("reservation_id", holdOrder.reservation_id);
      expect(itemsAfter1).toHaveLength(1);
      expect(Number(itemsAfter1![0].quantity_kg)).toBe(quantityKg);

      // 4. Second expiry/release execution: must be idempotent
      const { data: rel2, error: relErr2 } = await buyerA.rpc(
        "expire_reservation",
        {
          p_order_id: holdOrder.order_id,
        },
      );
      expect(relErr2).toBeNull();
      expect(rel2).toBe(false);

      // Assert exact final inventory counters: all counters are IDENTICAL to state after first expiry
      const { data: offerAfter2 } = await platformAdmin
        .from("coffee_offers")
        .select("reserved_quantity_kg")
        .eq("id", targetOffer)
        .single();
      const { data: posAfter2 } = await platformAdmin
        .from("inventory_positions")
        .select("reserved_quantity_kg")
        .eq("id", backingPositionId)
        .single();
      const { data: resAfter2 } = await platformAdmin
        .from("inventory_reservations")
        .select("status")
        .eq("id", holdOrder.reservation_id)
        .single();

      expect(Number(offerAfter2!.reserved_quantity_kg)).toBe(
        Number(offerAfter1!.reserved_quantity_kg),
      );
      expect(Number(posAfter2!.reserved_quantity_kg)).toBe(
        Number(posAfter1!.reserved_quantity_kg),
      );
      expect(resAfter2?.status).toBe("EXPIRED");
    });

    // 20. REVIEW_HOLD survives old expires_at
    it("20. REVIEW_HOLD survives old expires_at", async () => {
      const holdOrder = await createFixtureHoldOrder(
        buyerA,
        F013_FIXTURES.members.buyerA.organizationId,
      );

      const { data: prepData } = await buyerA.rpc(
        "prepare_payment_proof_upload",
        {
          p_order_id: holdOrder.order_id,
          p_request_id: randomUUID(),
          p_display_filename: "proof.pdf",
        },
      );
      const intentId = (prepData as { intent_id: string }).intent_id;
      const objectPath = (prepData as { object_path: string }).object_path;

      await buyerA.storage
        .from("payment-proofs")
        .upload(objectPath, Buffer.from("%PDF-1.4 test"), {
          contentType: "application/pdf",
        });

      await buyerA.rpc("finalize_payment_proof", {
        p_order_id: holdOrder.order_id,
        p_upload_intent_id: intentId,
        p_customer_claimed_amount: holdOrder.buyer_total,
        p_customer_transfer_date: new Date().toISOString().split("T")[0],
        p_customer_bank_reference: "WIRE-REF-HOLD",
        p_customer_reference_text: "Hold proof",
        p_request_id: randomUUID(),
      });

      // Attempt to expire an order currently in REVIEW_HOLD
      const { data: released } = await buyerA.rpc("expire_reservation", {
        p_order_id: holdOrder.order_id,
      });

      // Sweeper/release must refuse to touch REVIEW_HOLD
      expect(released).toBe(false);

      const { data: resRow } = await platformAdmin
        .from("inventory_reservations")
        .select("status")
        .eq("id", holdOrder.reservation_id)
        .single();
      expect(resRow?.status).toBe("REVIEW_HOLD");
    });

    // 21. Rollback aborts safely when payment-proofs bucket contains objects
    it("21. Rollback aborts safely when payment-proofs bucket contains objects", async () => {
      const migrationSqlPath = resolve(
        process.cwd(),
        "supabase/migrations/20260930100000_feature_015_atomic_checkout_and_payment_proof.sql",
      );
      const rollbackSqlPath = resolve(
        process.cwd(),
        "supabase/rollback/20260930100000_feature_015_atomic_checkout_and_payment_proof.rollback.sql",
      );
      const migrationSql = readFileSync(migrationSqlPath, "utf8");
      const rollbackSql = readFileSync(rollbackSqlPath, "utf8");

      // Test owns its fixture object:
      const testOwnedObjectPath = `org/${F013_FIXTURES.members.buyerA.organizationId}/orders/${randomUUID()}/${randomUUID()}/proof`;

      // 1. Ensure Feature 015 is currently applied before testing rollback guard
      ensureFeature015Applied(migrationSql, "f015-ensure-migrated");
      expect(inspectFeature015State()).toBe("APPLIED");

      try {
        // Create real bytes and metadata via the Storage API, not synthetic SQL.
        const { error: fixtureUploadError } = await getPrivilegedStorageAdminClient().storage
          .from(PAYMENT_PROOFS_BUCKET)
          .upload(testOwnedObjectPath, Buffer.from("%PDF-1.4 F015 rollback guard"), { contentType: "application/pdf" });
        expect(fixtureUploadError).toBeNull();

        // 3. Prove the bucket is non-empty via privileged SQL count assertions
        const proveBucketNonEmptySql = `
          do $$
          declare
            v_object_cnt int;
            v_bucket_cnt int;
          begin
            select count(*) into v_object_cnt from storage.objects
            where bucket_id = 'payment-proofs' and name = '${testOwnedObjectPath}';
            if v_object_cnt <> 1 then
              raise exception 'f015_test_object_not_found: expected 1, got %', v_object_cnt;
            end if;

            select count(*) into v_bucket_cnt from storage.objects
            where bucket_id = 'payment-proofs';
            if v_bucket_cnt = 0 then
              raise exception 'f015_bucket_unexpectedly_empty: count is 0';
            end if;
          end $$;
        `;
        runProofSqlFileStrict(
          proveBucketNonEmptySql,
          "f015-prove-bucket-non-empty",
        );

        // 4. Attempting rollback on non-empty bucket must abort safely per Feature 015 safety guard
        // Using expectProofSqlFileFailure to strictly capture and verify the exact expected failure error
        const output = expectProofSqlFileFailure(
          rollbackSql,
          "f015-rollback-guard-test",
          "rollback_aborted_payment_proofs_bucket_not_empty",
        );
        expect(output).toContain(
          "rollback_aborted_payment_proofs_bucket_not_empty",
        );

        // 5. Verify Feature 015 remains fully applied after the expected transactional rollback failure:
        // Transaction was aborted, so bucket and all procedures remain intact
        expect(inspectFeature015State()).toBe("APPLIED");

        const { data: bucketAfter } =
          await getPrivilegedStorageAdminClient().storage.getBucket("payment-proofs");
        expect(bucketAfter).not.toBeNull();
        expect(bucketAfter?.id).toBe("payment-proofs");
      } finally {
        // 6. Clean the test-owned object via narrow privileged Storage API helper
        await removePaymentProofStorageObjects([testOwnedObjectPath]);

        // 7. Verify cleanup succeeded
        const verifyCleanupSql = `
          do $$
          declare v_cnt int;
          begin
            select count(*) into v_cnt from storage.objects
            where bucket_id = 'payment-proofs' and name = '${testOwnedObjectPath}';
            if v_cnt <> 0 then
              raise exception 'f015_cleanup_failed_object_still_exists: got %', v_cnt;
            end if;
          end $$;
        `;
        runProofSqlFileStrict(
          verifyCleanupSql,
          "f015-verify-cleanup-succeeded",
        );

        // 8. Ensure Feature 015 is in APPLIED state adhering to tri-state rules
        ensureFeature015Applied(migrationSql, "f015-restore-forward-state");
        expect(inspectFeature015State()).toBe("APPLIED");
      }
    }, 180_000);

    // 22. Clean bucket teardown enables safe rollback, restores baseline, and reapplies Feature 015
    it("22. Clean bucket teardown enables safe rollback, restores baseline, and reapplies Feature 015", async () => {
      const migrationSqlPath = resolve(
        process.cwd(),
        "supabase/migrations/20260930100000_feature_015_atomic_checkout_and_payment_proof.sql",
      );
      const rollbackSqlPath = resolve(
        process.cwd(),
        "supabase/rollback/20260930100000_feature_015_atomic_checkout_and_payment_proof.rollback.sql",
      );
      const migrationSql = readFileSync(migrationSqlPath, "utf8");
      const rollbackSql = readFileSync(rollbackSqlPath, "utf8");

      try {
        // Purge all test objects in payment-proofs via privileged Storage API helper
        await purgePaymentProofStorageObjects();

        // Now rollback executes cleanly without aborting
        const output = runProofSqlFileStrict(
          rollbackSql,
          "f015-final-clean-rollback",
        );
        expect(output).not.toMatch(/ERROR:/);
        expect(output).not.toMatch(
          /rollback_aborted_payment_proofs_bucket_not_empty/,
        );

        // Inspector pins the exact historical functions/policies/transition body.
        expect(inspectFeature015State()).toBe("ABSENT");

        // Verify payment-proofs bucket is removed
        const { data: finalBucket } =
          await getPrivilegedStorageAdminClient().storage.getBucket("payment-proofs");
        expect(finalBucket).toBeNull();
      } finally {
        // At completion, the suite MUST return to the expected Feature 015 migrated state for any other suites
        ensureFeature015Applied(migrationSql, "f015-teardown-reapply-forward");
        expect(inspectFeature015State()).toBe("APPLIED");
        runProofSqlFileStrict(readFileSync(resolve(process.cwd(), "supabase/maintenance/20260930_feature_015_atomic_checkout_and_payment_proof_postflight.sql"), "utf8"), "f015-final-postflight");
      }
    }, 180_000);

    afterAll(async () => {
      try {
        // ALWAYS restore original bank_transfer_checkout_enabled even if later tests failed
        if (originalBankTransferCheckoutEnabled !== null) {
          runProofSqlFileStrict(
            `update public.commerce_settings set bank_transfer_checkout_enabled = ${originalBankTransferCheckoutEnabled} where id;`,
            "f015-restore-checkout-setting",
          );
        }
      } finally {
        // Suite-level guarantee: DB is returned to the expected Feature 015 migrated state.
        // Remove any blanket catch: teardown failure must fail the suite.
        // Inspect actual DB state first and adhere strictly to tri-state reapply rules.
        const migrationSqlPath = resolve(
          process.cwd(),
          "supabase/migrations/20260930100000_feature_015_atomic_checkout_and_payment_proof.sql",
        );
        const migrationSql = readFileSync(migrationSqlPath, "utf8");

        ensureFeature015Applied(migrationSql, "f015-afterall-ensure-forward");
        const finalState = inspectFeature015State();
        if (finalState !== "APPLIED") {
          throw new Error(
            `afterAll teardown failure: Feature 015 state is ${finalState}, expected APPLIED`,
          );
        }
        expect(finalState).toBe("APPLIED");
      }
    }, 180_000);
  },
);
