-- Feature 018 M1: Featured Coffee timestamp and frozen Arabic proforma-item snapshots.
--
-- Adds only nullable, default-free columns. No historical value is backfilled or rewritten: Featured selection is
-- opt-in and Arabic snapshots exist only for proformas issued after the M2 checkout kernel starts populating them.
-- Existing public/member authorization is untouched; `featured_at` is an intentionally public editorial timestamp
-- (anon can already read PUBLISHED coffees) and the public DTO allowlist remains the privacy boundary.
-- Immutability of the Arabic snapshots is inherited from `trg_proforma_invoice_items_immutable`
-- (`prevent_snapshot_mutation`), which already refuses UPDATE/DELETE of every V1 snapshot row.

begin;

do $guard$
begin
  if to_regclass('public.coffees') is null or to_regclass('public.proforma_invoice_items') is null then
    raise exception 'feature_018_m1_prerequisites_missing: coffees or proforma_invoice_items';
  end if;
  if to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)') is null
     or to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)') is null then
    raise exception 'feature_018_m1_prerequisites_missing: Feature 015/016 checkout and finance functions';
  end if;
  if to_regprocedure('public.record_stripe_payment_intent(uuid,text,text)') is not null
     and (has_function_privilege('anon', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')
          or has_function_privilege('service_role', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')) then
    raise exception 'feature_018_m1_feature_017_not_retired';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.proforma_invoice_items'::regclass and t.tgname = 'trg_proforma_invoice_items_immutable' and t.tgenabled = 'O'
  ) then
    raise exception 'feature_018_m1_snapshot_immutability_trigger_missing';
  end if;
  -- Idempotent re-apply is allowed only over conforming objects; anything else is unreviewed drift.
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.coffees'::regclass and a.attname = 'featured_at' and not a.attisdropped
             and (a.atttypid <> 'timestamptz'::regtype or a.attnotnull or a.atthasdef)) then
    raise exception 'feature_018_m1_featured_at_nonconforming';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.proforma_invoice_items'::regclass
             and a.attname in ('product_name_ar_snapshot', 'origin_name_ar_snapshot') and not a.attisdropped
             and (a.atttypid <> 'text'::regtype or a.attnotnull or a.atthasdef)) then
    raise exception 'feature_018_m1_arabic_snapshot_nonconforming';
  end if;
end
$guard$;

alter table public.coffees add column if not exists featured_at timestamptz;

create index if not exists idx_coffees_featured_published
  on public.coffees (featured_at desc, id desc)
  where status = 'PUBLISHED' and featured_at is not null;

alter table public.proforma_invoice_items
  add column if not exists product_name_ar_snapshot text,
  add column if not exists origin_name_ar_snapshot text;

do $constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint k
    where k.conrelid = 'public.proforma_invoice_items'::regclass and k.conname = 'proforma_invoice_items_ar_snapshot_v1_only_check'
  ) then
    -- Legacy rows (no seller_type_snapshot) remain mutable by design; they must never carry Arabic snapshot values.
    alter table public.proforma_invoice_items
      add constraint proforma_invoice_items_ar_snapshot_v1_only_check
      check (seller_type_snapshot is not null or (product_name_ar_snapshot is null and origin_name_ar_snapshot is null));
  end if;
end
$constraint$;

comment on column public.coffees.featured_at is 'Feature 018: first moment the Coffee was selected as Featured (NULL = not selected). Re-selecting keeps the original moment.';
comment on column public.proforma_invoice_items.product_name_ar_snapshot is 'Feature 018: frozen Arabic Coffee name captured at issuance only; NULL when no Arabic translation existed.';
comment on column public.proforma_invoice_items.origin_name_ar_snapshot is 'Feature 018: frozen Arabic origin name captured at issuance only; NULL when no Arabic translation existed.';

commit;
