-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925112000_feature_013_pricing_inputs.sql (Feature 013 M2d).
-- Removes exactly what M2d added: promotion_targets, promotions (with its audit/updated_at triggers, indexes and policy),
-- offer_price_tiers, write_audit_log_promotions(), next_promotion_code_ref() and promotion_code_ref_seq. No object that
-- existed before M2d is altered (M1–M2c stay applied).
-- Safe ONLY before pricing inputs exist: the guard refuses (changing nothing) while any tier, promotion or target row
-- exists, or while a later Feature 013 migration is applied (roll those back first). Promotion audit rows written by
-- trg_audit_promotions stay in audit_logs (append-only).
-- After running it: `supabase migration repair --status reverted 20260925112000` (OPERATOR); the M2d postflight is then
-- expected to FAIL and the M2c postflight to pass again.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.promotions') is null then
    v_problems := v_problems || 'M2d is not applied (promotions missing); ';
  end if;
  if to_regclass('public.notification_events') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('emit_notification_event', 'is_order_buyer_member', 'is_order_line_seller',
                                                             'validate_promotion_scope', 'upsert_seller_promotion', 'upsert_platform_promotion',
                                                             'compute_order_quote')) then
    v_problems := v_problems || 'a later Feature 013 migration (M2e+) is still applied; ';
  end if;
  if exists (select 1 from public.offer_price_tiers) or exists (select 1 from public.promotions) or exists (select 1 from public.promotion_targets) then
    v_problems := v_problems || 'a price tier, promotion or promotion target exists; ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_pricing_inputs rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

drop table public.promotion_targets;
drop table public.promotions;
drop table public.offer_price_tiers;

drop function public.write_audit_log_promotions();
drop function public.next_promotion_code_ref();
drop sequence public.promotion_code_ref_seq;

commit;
