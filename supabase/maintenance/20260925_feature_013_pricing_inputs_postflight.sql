-- Read-only postflight for 20260925112000_feature_013_pricing_inputs.sql (Feature 013 M2d, T048).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED' (18 rows). Run right after the apply:
--   npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_pricing_inputs_postflight.sql
with new_tables(t) as (
  values ('offer_price_tiers'), ('promotions'), ('promotion_targets')
),
checks(seq, check_name, ok) as (
  select 1, 'offer_price_tiers: the §3.8 columns (7); UNIQUE(offer_id, min_quantity_kg); threshold > 0, price >= 0, USD',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'offer_price_tiers') = 7
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.offer_price_tiers'::regclass and conname = 'offer_price_tiers_offer_threshold_key')
        = 'UNIQUE (offer_id, min_quantity_kg)'
    and (select count(*) from pg_constraint where conrelid = 'public.offer_price_tiers'::regclass
           and conname in ('offer_price_tiers_min_quantity_check', 'offer_price_tiers_price_check', 'offer_price_tiers_currency_check')) = 3
  union all
  select 2, 'promotions: the §3.8 columns (16); funding_source GENERATED ALWAYS from scope (PLATFORM → HILLS, SELLER → SELLER)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'promotions') = 16
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'promotions' and column_name = 'funding_source'
                and is_generated = 'ALWAYS' and generation_expression like '%PLATFORM%HILLS%SELLER%')
  union all
  select 3, 'promotions: scope {PLATFORM, SELLER}, discount_type {PERCENT, AMOUNT_PER_KG}, status (6 values), funding {HILLS, SELLER}',
    coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
              where c.conrelid = 'public.promotions'::regclass and c.conname = 'promotions_scope_check') = array['PLATFORM', 'SELLER'], false)
    and coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
                  where c.conrelid = 'public.promotions'::regclass and c.conname = 'promotions_discount_type_check') = array['AMOUNT_PER_KG', 'PERCENT'], false)
    and coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
                  where c.conrelid = 'public.promotions'::regclass and c.conname = 'promotions_status_check')
                 = array['ACTIVE', 'ARCHIVED', 'DRAFT', 'ENDED', 'PAUSED', 'SCHEDULED'], false)
    and coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
                  where c.conrelid = 'public.promotions'::regclass and c.conname = 'promotions_funding_source_check') = array['HILLS', 'SELLER'], false)
  union all
  select 4, 'promotions: value > 0, PERCENT <= 100, starts_at < ends_at, SELLER iff seller_organization_id, code [A-Z0-9-]{1,40}',
    (select count(*) from pg_constraint where conrelid = 'public.promotions'::regclass
       and conname in ('promotions_value_check', 'promotions_percent_check', 'promotions_window_check', 'promotions_scope_seller_check',
                       'promotions_code_check', 'promotions_min_quantity_check', 'promotions_promotion_code_ref_check')) = 7
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.promotions'::regclass and conname = 'promotions_percent_check')
        = 'CHECK (((discount_type <> ''PERCENT''::text) OR (value <= (100)::numeric)))'
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.promotions'::regclass and conname = 'promotions_window_check')
        = 'CHECK ((starts_at < ends_at))'
  union all
  select 5, 'promotions: live code unique case-insensitively among non-archived rows; PRM- references; eligibility index',
    (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = to_regclass('public.uq_promotions_code_live'))
      = 'CREATE UNIQUE INDEX uq_promotions_code_live ON public.promotions USING btree (lower(code)) WHERE ((code IS NOT NULL) AND (status <> ''ARCHIVED''::text))'
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'promotions'
                and column_name = 'promotion_code_ref' and column_default = 'next_promotion_code_ref()')
    and to_regclass('public.idx_promotions_eligibility') is not null
  union all
  select 6, 'promotion_targets: 5 columns; kind {OFFER, COFFEE, ALL_SELLER_OFFERS, ALL_OFFERS}; reference and unique target CHECKs',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'promotion_targets') = 5
    and coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
                  where c.conrelid = 'public.promotion_targets'::regclass and c.conname = 'promotion_targets_kind_check')
                 = array['ALL_OFFERS', 'ALL_SELLER_OFFERS', 'COFFEE', 'OFFER'], false)
    and (select count(*) from pg_constraint where conrelid = 'public.promotion_targets'::regclass
           and conname in ('promotion_targets_reference_check', 'promotion_targets_unique_key')) = 2
  union all
  select 7, 'RLS enabled + forced on the 3 tables; exactly one SELECT policy each, TO authenticated',
    (select count(*) from pg_class c join new_tables n on c.oid = ('public.' || n.t)::regclass where c.relrowsecurity and c.relforcerowsecurity) = 3
    and (select count(*) from pg_policies p join new_tables n on p.tablename = n.t where p.schemaname = 'public') = 3
    and (select count(*) from pg_policies p join new_tables n on p.tablename = n.t
           where p.schemaname = 'public' and p.cmd = 'SELECT' and p.roles = '{authenticated}'
             and p.policyname in ('offer_price_tiers_read', 'promotions_read', 'promotion_targets_read')) = 3
  union all
  select 8, 'anon holds nothing on the 3 tables (tiers and promotions never readable by anon); PUBLIC nothing',
    not exists (select 1 from new_tables n
                where has_table_privilege('anon', 'public.' || n.t, 'select, insert, update, delete, truncate, references, trigger')
                   or has_table_privilege('public', 'public.' || n.t, 'select, insert, update, delete, truncate'))
    and not has_column_privilege('anon', 'public.promotions', 'code', 'select')
  union all
  select 9, 'no client write path: authenticated/service_role hold no INSERT/UPDATE/DELETE/TRUNCATE (writes arrive with the M8 RPCs)',
    not exists (select 1 from new_tables n
                where has_table_privilege('authenticated', 'public.' || n.t, 'insert, update, delete, truncate, references, trigger')
                   or has_table_privilege('service_role', 'public.' || n.t, 'insert, update, delete, truncate, references, trigger'))
    and has_table_privilege('authenticated', 'public.offer_price_tiers', 'select')
    and has_table_privilege('authenticated', 'public.promotion_targets', 'select')
  union all
  select 10, 'promotion codes hidden: no client role can SELECT promotions.code; the other columns are readable under RLS',
    not has_column_privilege('authenticated', 'public.promotions', 'code', 'select')
    and has_column_privilege('authenticated', 'public.promotions', 'promotion_code_ref', 'select')
    and has_column_privilege('authenticated', 'public.promotions', 'funding_source', 'select')
    and not has_table_privilege('authenticated', 'public.promotions', 'select')
  union all
  select 11, 'tier read = the coffee_offers member_read_published_offers predicate ∨ own seller org ∨ platform admin',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'offer_price_tiers' and policyname = 'offer_price_tiers_read'
            and qual like '%is_platform_admin()%' and qual like '%is_org_member(o.seller_organization_id)%' and qual like '%is_authorized_member()%'
            and qual like '%PUBLISHED%PARTIALLY_FILLED%' and qual like '%is_visible = true%' and qual like '%deleted_at IS NULL%'
            and qual like '%reserved_quantity_kg%')
  union all
  select 12, 'promotion read: eligible (SCHEDULED/ACTIVE, in-window) PLATFORM promotions for authorized members; own SELLER org; platform admin; targets follow',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotions' and policyname = 'promotions_read'
            and qual like '%is_platform_admin()%' and qual like '%SELLER%is_org_member(seller_organization_id)%'
            and qual like '%PLATFORM%is_authorized_member()%' and qual like '%SCHEDULED%ACTIVE%' and qual like '%starts_at <= now()%' and qual like '%now() < ends_at%')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_targets' and policyname = 'promotion_targets_read'
                and qual like '%promotions p%')
  union all
  select 13, 'redacted promotion audit (allow-list, the code value never copied) + updated_at trigger',
    exists (select 1 from pg_trigger where tgrelid = 'public.promotions'::regclass and tgname = 'trg_audit_promotions'
            and tgfoid = 'public.write_audit_log_promotions()'::regprocedure and tgenabled = 'O')
    and exists (select 1 from pg_trigger where tgrelid = 'public.promotions'::regclass and tgname = 'trg_promotions_updated_at'
                and tgfoid = 'public.set_updated_at()'::regprocedure)
    and not exists (select 1 from pg_trigger where tgfoid = 'public.write_audit_log()'::regprocedure
                    and tgrelid in ('public.offer_price_tiers'::regclass, 'public.promotions'::regclass, 'public.promotion_targets'::regclass))
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_promotions()'::regprocedure) not like '%to_jsonb(%'
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_promotions()'::regprocedure) not like '%''code'', new.code%'
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_promotions()'::regprocedure) not like '%''code'', old.code%'
  union all
  select 14, 'M2d functions: definer as designed, search_path pinned, no anon/PUBLIC EXECUTE; no promotion/tier RPC yet (tables only)',
    (select prosecdef from pg_proc where oid = 'public.write_audit_log_promotions()'::regprocedure)
    and not (select prosecdef from pg_proc where oid = 'public.next_promotion_code_ref()'::regprocedure)
    and not exists (select 1 from pg_proc p where p.oid in ('public.write_audit_log_promotions()'::regprocedure, 'public.next_promotion_code_ref()'::regprocedure)
                    and (has_function_privilege('anon', p.oid, 'execute') or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
                         or exists (select 1 from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item where acl_item::text like '=%' and acl_item::text like '%X%')))
    and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                    and p.proname in ('upsert_seller_promotion', 'upsert_platform_promotion', 'validate_promotion_scope', 'upsert_offer_price_tiers'))
  union all
  select 15, 'the 3 new tables are empty',
    not exists (select 1 from public.offer_price_tiers) and not exists (select 1 from public.promotions) and not exists (select 1 from public.promotion_targets)
  union all
  select 16, 'M1–M2c untouched: validate_order_transition v2, prevent_snapshot_mutation (M2b), M2c tables present; coffee_offers member policy unchanged; checkout disabled',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.prevent_snapshot_mutation()'::regprocedure) = '286e02091213c1be4236b144dff1f383'
    and to_regclass('public.reconciliation_cases') is not null and to_regclass('public.manual_financial_adjustments') is not null
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coffee_offers' and policyname = 'member_read_published_offers')
    and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
  union all
  select 17, 'no Feature 013 object beyond M2d exists yet (M2e+ not applied)',
    to_regclass('public.notification_events') is null
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
