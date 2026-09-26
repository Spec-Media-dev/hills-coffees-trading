/**
 * Feature 013 T049 (MP-6) — the M2d live proof as ONE PostgreSQL `DO` block, executed against the linked project by
 * `tests/commerce/pricing-inputs.live.test.ts` (F013_LIVE=1) through `supabase db query --linked`.
 *
 * Same method as T037/T043 (T035 F4, owner-approved one-transaction setup). Clients and service_role cannot write the pricing
 * tables (by design), so fixtures are written by the table owner inside one transaction that always ends in
 * `raise exception 'T049_RESULT:<base64 json>'`: every fixture row, audit row and the temporary platform-admin grant roll
 * back atomically. Only sequence values (PRM- references, audit identity) are consumed.
 *
 * Identities (existing Foundation fixtures, read-only outside the transaction):
 *   - buyer    = buyer-only+foundation-test@example.com (authorized member, cannot sell);
 *   - seller   = buyer-and-seller+foundation-test@example.com (org can sell; owns the SELLER promotion). For the "own listing"
 *     tier branch it is made a member of the Feature 005 Hills fixture org INSIDE one savepoint only (rolled back with it),
 *     so it owns the unpublished listing LST-0000007;
 *   - admin    = the seller identity with a platform_admins row granted INSIDE one savepoint only (rolled back with it).
 * Fixture ids: the reserved 13000000-…-0000000005xx range.
 */
import { sqlLiteral as q, t037Accepted as accepted, t037Check as check, t037Refused as refused } from "./t037-snapshot-proof";

export const T049 = {
  tierPublished: "13000000-0000-4000-8000-000000000511",
  tierDraft: "13000000-0000-4000-8000-000000000512",
  promoEligible: "13000000-0000-4000-8000-000000000521",
  promoDraft: "13000000-0000-4000-8000-000000000522",
  promoExpired: "13000000-0000-4000-8000-000000000523",
  promoFuture: "13000000-0000-4000-8000-000000000524",
  promoSeller: "13000000-0000-4000-8000-000000000525",
  promoProbe: "13000000-0000-4000-8000-000000000526",
  targetEligible: "13000000-0000-4000-8000-000000000531",
  targetSeller: "13000000-0000-4000-8000-000000000532",
  targetDraft: "13000000-0000-4000-8000-000000000533",
} as const;

export const T049_EXISTING = {
  buyerUser: "7c0edf8e-6e90-404a-9711-f6ba7dc64c37",
  sellerUser: "f390df3b-505a-4abe-9863-70c16354f88c",
  sellerOrg: "f0000000-0000-4000-8000-000000000002",
  publishedOffer: "05000000-0000-4000-8000-000000000005", // LST-0000002, Hills, PUBLISHED + visible
  unpublishedOffer: "06000000-0000-4000-8000-00000000000d", // LST-0000007, Hills, PENDING_REVIEW + invisible
  hillsOrg: "05000000-0000-4000-8000-000000000001",
} as const;

const X = T049;
const E = T049_EXISTING;
const SECRETS = ["T049-SECRET-PLATFORM", "T049-SECRET-SELLER", "T049-SECRET-ROTATED"];

export function buildT049ProofSql(): string {
  const claims = (uid: string) => `perform set_config('request.jwt.claims', ${q(JSON.stringify({ sub: uid, role: "authenticated" }))}, true);`;
  const promo = (o: { id?: string; scope?: string; seller?: string | null; code?: string | null; type?: string; value?: string; starts?: string; ends?: string; status?: string; extraCol?: string; extraVal?: string } = {}) =>
    `insert into public.promotions (id, scope, seller_organization_id, code, discount_type, value, starts_at, ends_at, status, created_by${o.extraCol ? `, ${o.extraCol}` : ""})
       values ('${o.id ?? X.promoProbe}', '${o.scope ?? "PLATFORM"}', ${o.seller ? `'${o.seller}'` : "null"}, ${o.code ? q(o.code) : "null"}, '${o.type ?? "PERCENT"}', ${o.value ?? "10"},
               ${o.starts ?? "now() - interval '1 day'"}, ${o.ends ?? "now() + interval '1 day'"}, '${o.status ?? "ACTIVE"}', '${E.sellerUser}'${o.extraVal ? `, ${o.extraVal}` : ""});`;
  const tier = (min: string, price: string, currency = "USD", offer: string = E.publishedOffer) =>
    `insert into public.offer_price_tiers (offer_id, min_quantity_kg, price_per_kg, currency, created_by) values ('${offer}', ${min}, ${price}, '${currency}', '${E.sellerUser}');`;
  /** ids visible to a role, as a sorted text list, compared with the expected list. */
  const visible = (name: string, who: string, table: string, column: string, expected: string[], extraSetup = "") => `
  begin
    ${extraSetup}
    ${who === "anon" ? "" : claims(who)}
    execute 'set local role ${who === "anon" ? "anon" : "authenticated"}';
    execute 'select coalesce(string_agg(${column}::text, '','' order by ${column}::text), '''') from public.${table} where ${column}::text like ''13000000-0000-4000-8000-0000000005%'' or ${column}::text in (''${E.publishedOffer}'', ''${E.unpublishedOffer}'')' into v_got;
    raise exception 'T049_VISIBLE:%', v_got;
  exception when others then
    v_got := sqlerrm;
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'ok', v_got = ${q(`T049_VISIBLE:${[...expected].sort().join(",")}`)}, 'got', v_got));
  end;`;
  const denied = (name: string, who: string, sql: string, extraSetup = "") => `
  begin
    ${extraSetup}
    ${who === "anon" || who === "service_role" ? "" : claims(who)}
    execute 'set local role ${who === "anon" ? "anon" : who === "service_role" ? "service_role" : "authenticated"}';
    execute ${q(sql)};
    raise exception 'T049_NO_ERROR';
  exception when others then
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'ok', position('permission denied' in sqlerrm) > 0, 'got', sqlerrm));
  end;`;
  const grantAdmin = `insert into public.platform_admins (user_id, role, is_active, created_by) values ('${E.sellerUser}', 'ADMIN', true, '${E.sellerUser}');`;
  const joinHills = `insert into public.organization_members (organization_id, user_id) values ('${E.hillsOrg}', '${E.sellerUser}');`;
  const TIERS_ALL = [E.publishedOffer, E.unpublishedOffer];
  const PROMOS_ALL = [X.promoEligible, X.promoDraft, X.promoExpired, X.promoFuture, X.promoSeller];

  return `do $t049$
declare
  r jsonb := '[]'::jsonb;
  v_detail text;
  v_constraint text;
  v_got text;
  v_audit_start bigint := coalesce((select max(id) from public.audit_logs), 0);
begin
  -- 0. Safety: production must be the post-M2d state this proof expects, with no pricing row and no T049 row.
  if to_regclass('public.promotions') is null
     or exists (select 1 from public.offer_price_tiers) or exists (select 1 from public.promotions) or exists (select 1 from public.promotion_targets)
     or exists (select 1 from public.organization_members where organization_id = '${E.hillsOrg}' and user_id = '${E.sellerUser}')
     or not exists (select 1 from public.coffee_offers where id = '${E.unpublishedOffer}' and status = 'PENDING_REVIEW' and not is_visible)
     or exists (select 1 from public.platform_admins where user_id = '${E.sellerUser}')
     or exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    raise exception 'T049_PRECONDITION_FAILED';
  end if;

  -- 1. Fixtures (rolled back at the end): tiers on a published and an unpublished listing; promotions in every visibility class.
  insert into public.offer_price_tiers (id, offer_id, min_quantity_kg, price_per_kg, created_by) values
    ('${X.tierPublished}', '${E.publishedOffer}', 100, 4.50, '${E.sellerUser}'),
    ('${X.tierDraft}', '${E.unpublishedOffer}', 50, 5.50, '${E.sellerUser}');
  ${promo({ id: X.promoEligible, code: "T049-SECRET-PLATFORM" })}
  ${promo({ id: X.promoDraft, status: "DRAFT" })}
  ${promo({ id: X.promoExpired, starts: "now() - interval '3 day'", ends: "now() - interval '1 day'" })}
  ${promo({ id: X.promoFuture, status: "SCHEDULED", starts: "now() + interval '1 day'", ends: "now() + interval '2 day'" })}
  ${promo({ id: X.promoSeller, scope: "SELLER", seller: E.sellerOrg, code: "T049-SECRET-SELLER", type: "AMOUNT_PER_KG", value: "0.25" })}
  insert into public.promotion_targets (id, promotion_id, target_kind, offer_id) values
    ('${X.targetEligible}', '${X.promoEligible}', 'ALL_OFFERS', null),
    ('${X.targetSeller}', '${X.promoSeller}', 'ALL_SELLER_OFFERS', null),
    ('${X.targetDraft}', '${X.promoDraft}', 'ALL_OFFERS', null);

  -- 2. funding_source cannot be spoofed (FIN-011): generated from scope, never writable.
  ${check("FUNDING: PLATFORM promotions are HILLS-funded and SELLER promotions SELLER-funded", `(select funding_source from public.promotions where id = '${X.promoEligible}') = 'HILLS' and (select funding_source from public.promotions where id = '${X.promoSeller}') = 'SELLER'`)}
  ${refused("FUNDING: inserting an explicit funding_source is refused", promo({ extraCol: "funding_source", extraVal: "'SELLER'" }), "funding_source", { immediate: false })}
  ${refused("FUNDING: updating funding_source is refused", `update public.promotions set funding_source = 'SELLER' where id = '${X.promoEligible}';`, "funding_source", { immediate: false })}
  ${accepted("FUNDING: changing the scope re-derives the funding (PLATFORM → SELLER gives SELLER)", `update public.promotions set scope = 'SELLER', seller_organization_id = '${E.sellerOrg}' where id = '${X.promoEligible}'; if (select funding_source from public.promotions where id = '${X.promoEligible}') <> 'SELLER' then raise exception 'not re-derived'; end if;`)}

  -- 3. Invalid promotion / tier / target values are refused by the CHECKs.
  ${refused("CHECK: PERCENT 101 is refused (PERCENT <= 100)", promo({ value: "101" }), "promotions_percent_check", { immediate: false })}
  ${accepted("CHECK: PERCENT 100 is accepted (upper bound)", promo({ value: "100" }))}
  ${accepted("CHECK: AMOUNT_PER_KG above 100 is not bound by the PERCENT rule", promo({ type: "AMOUNT_PER_KG", value: "150" }))}
  ${refused("CHECK: value 0 is refused", promo({ value: "0" }), "promotions_value_check", { immediate: false })}
  ${refused("CHECK: a negative value is refused", promo({ value: "-5" }), "promotions_value_check", { immediate: false })}
  ${refused("CHECK: an unknown discount type is refused", promo({ type: "FIXED" }), "promotions_discount_type_check", { immediate: false })}
  ${refused("CHECK: starts_at = ends_at is refused", promo({ starts: "'2026-10-01 00:00+00'", ends: "'2026-10-01 00:00+00'" }), "promotions_window_check", { immediate: false })}
  ${refused("CHECK: starts_at after ends_at is refused", promo({ starts: "'2026-10-02 00:00+00'", ends: "'2026-10-01 00:00+00'" }), "promotions_window_check", { immediate: false })}
  ${refused("CHECK: a SELLER promotion without a seller organization is refused", promo({ scope: "SELLER" }), "promotions_scope_seller_check", { immediate: false })}
  ${refused("CHECK: a PLATFORM promotion with a seller organization is refused", promo({ seller: E.sellerOrg }), "promotions_scope_seller_check", { immediate: false })}
  ${refused("CHECK: an unknown scope is refused", promo({ scope: "GLOBAL" }), "promotions_scope_check", { immediate: false })}
  ${refused("CHECK: an unknown status is refused", promo({ status: "LIVE" }), "promotions_status_check", { immediate: false })}
  ${refused("CHECK: a lower-case code is refused ([A-Z0-9-]{1,40})", promo({ code: "summer_10" }), "promotions_code_check", { immediate: false })}
  ${refused("CHECK: a 41-character code is refused", promo({ code: "A".repeat(41) }), "promotions_code_check", { immediate: false })}
  ${refused("CHECK: a live code is unique among non-archived promotions", promo({ code: "T049-SECRET-PLATFORM" }), "uq_promotions_code_live", { immediate: false })}
  ${accepted("CHECK: an archived promotion may reuse a live code value", promo({ code: "T049-SECRET-PLATFORM", status: "ARCHIVED" }))}
  ${check("CHECK: PRM- references are generated", `(select bool_and(promotion_code_ref ~ '^PRM-[0-9]{7}$') from public.promotions where id::text like '13000000-0000-4000-8000-0000000005%')`)}
  ${refused("CHECK: a tier threshold of 0 is refused", tier("0", "4"), "offer_price_tiers_min_quantity_check", { immediate: false })}
  ${refused("CHECK: a negative tier price is refused", tier("200", "-1"), "offer_price_tiers_price_check", { immediate: false })}
  ${refused("CHECK: a non-USD tier is refused", tier("200", "4", "EUR"), "offer_price_tiers_currency_check", { immediate: false })}
  ${refused("CHECK: a second tier at the same threshold is refused", tier("100", "4"), "offer_price_tiers_offer_threshold_key", { immediate: false })}
  ${refused("CHECK: an OFFER target without an offer is refused", `insert into public.promotion_targets (promotion_id, target_kind) values ('${X.promoEligible}', 'OFFER');`, "promotion_targets_reference_check", { immediate: false })}
  ${refused("CHECK: an ALL_OFFERS target carrying an offer is refused", `insert into public.promotion_targets (promotion_id, target_kind, offer_id) values ('${X.promoEligible}', 'ALL_OFFERS', '${E.publishedOffer}');`, "promotion_targets_reference_check", { immediate: false })}
  ${refused("CHECK: a duplicate ALL_OFFERS target is refused (NULLS NOT DISTINCT)", `insert into public.promotion_targets (promotion_id, target_kind) values ('${X.promoEligible}', 'ALL_OFFERS');`, "promotion_targets_unique_key", { immediate: false })}
  ${refused("CHECK: an unknown target kind is refused", `insert into public.promotion_targets (promotion_id, target_kind) values ('${X.promoEligible}', 'CATEGORY');`, "promotion_targets_kind_check", { immediate: false })}

  -- 4. Anonymous users read nothing (no grant at all).
  ${denied("ANON: reading offer_price_tiers is refused (0 rows reachable)", "anon", "select count(*) from public.offer_price_tiers")}
  ${denied("ANON: reading promotions is refused (0 rows reachable)", "anon", "select count(*) from public.promotions")}
  ${denied("ANON: reading promotion_targets is refused (0 rows reachable)", "anon", "select count(*) from public.promotion_targets")}

  -- 5. Member / seller / admin access matches the M2d design.
  ${visible("BUYER: an authorized buyer reads only the published listing's tier (not the unpublished listing's)", E.buyerUser, "offer_price_tiers", "offer_id", [E.publishedOffer])}
  ${visible("BUYER: an authorized buyer sees only the eligible PLATFORM promotion (not draft, expired, future or a seller's)", E.buyerUser, "promotions", "id", [X.promoEligible])}
  ${visible("BUYER: an authorized buyer reads only that promotion's targets", E.buyerUser, "promotion_targets", "id", [X.targetEligible])}
  ${visible("SELLER: a member of the listing's own organization also reads the unpublished listing's tier (temporary membership, rolled back)", E.sellerUser, "offer_price_tiers", "offer_id", TIERS_ALL, joinHills)}
  ${visible("SELLER: without that membership the same user reads only the published listing's tier", E.sellerUser, "offer_price_tiers", "offer_id", [E.publishedOffer])}
  ${visible("SELLER: the seller org sees the eligible PLATFORM promotion and its own SELLER promotion", E.sellerUser, "promotions", "id", [X.promoEligible, X.promoSeller])}
  ${visible("SELLER: the seller org reads the targets of both", E.sellerUser, "promotion_targets", "id", [X.targetEligible, X.targetSeller])}
  ${visible("ADMIN: a platform admin sees every promotion (temporary grant, rolled back)", E.sellerUser, "promotions", "id", PROMOS_ALL, grantAdmin)}
  ${visible("ADMIN: a platform admin reads every tier", E.sellerUser, "offer_price_tiers", "offer_id", TIERS_ALL, grantAdmin)}
  ${visible("ADMIN: a platform admin reads every target", E.sellerUser, "promotion_targets", "id", [X.targetEligible, X.targetSeller, X.targetDraft], grantAdmin)}
  ${denied("CODE: a buyer cannot read promotion codes", E.buyerUser, "select code from public.promotions")}
  ${denied("CODE: the owning seller cannot read its promotion's code directly", E.sellerUser, "select code from public.promotions")}
  ${denied("CODE: a platform admin cannot read codes directly (M8 RPC path only)", E.sellerUser, "select code from public.promotions", grantAdmin)}
  ${denied("CODE: select * on promotions is refused for clients", E.buyerUser, "select * from public.promotions")}
  ${visible("CODE: the non-code columns stay readable under RLS", E.buyerUser, "promotions", "id", [X.promoEligible])}
  ${denied("WRITE: authenticated INSERT into offer_price_tiers is refused", E.sellerUser, `insert into public.offer_price_tiers (offer_id, min_quantity_kg, price_per_kg, created_by) values ('${E.unpublishedOffer}', 500, 1, '${E.sellerUser}')`)}
  ${denied("WRITE: authenticated INSERT into promotions is refused", E.sellerUser, `insert into public.promotions (scope, seller_organization_id, discount_type, value, starts_at, ends_at, created_by) values ('SELLER', '${E.sellerOrg}', 'PERCENT', 5, now(), now() + interval '1 day', '${E.sellerUser}')`)}
  ${denied("WRITE: authenticated INSERT into promotion_targets is refused", E.sellerUser, `insert into public.promotion_targets (promotion_id, target_kind) values ('${X.promoSeller}', 'ALL_SELLER_OFFERS')`)}
  ${denied("WRITE: a platform admin cannot UPDATE promotions directly", E.sellerUser, `update public.promotions set status = 'PAUSED'`, grantAdmin)}
  ${denied("WRITE: a platform admin cannot DELETE tiers directly", E.sellerUser, `delete from public.offer_price_tiers`, grantAdmin)}
  ${denied("WRITE: service_role cannot INSERT promotions (read-only)", "service_role", `insert into public.promotions (scope, discount_type, value, starts_at, ends_at, created_by) values ('PLATFORM', 'PERCENT', 5, now(), now() + interval '1 day', '${E.sellerUser}')`)}
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 6. Redacted promotion audit: no code value in audit_logs; a code change is recorded as a boolean.
  update public.promotions set code = 'T049-SECRET-ROTATED' where id = '${X.promoSeller}';
  ${check("AUDIT: promotion audit rows were written and none contains a code value", `(select count(*) >= 5 from public.audit_logs where id > v_audit_start and entity_type = 'promotions') and not exists (select 1 from public.audit_logs a where a.id > v_audit_start and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '') || a.metadata::text) ~ ${q(SECRETS.join("|"))})`, `(select count(*) from public.audit_logs where id > v_audit_start and entity_type = 'promotions')`)}
  ${check("AUDIT: the code change is recorded as code_changed = true without the value", `(select (new_data ->> 'code_changed')::boolean and (new_data ->> 'code_present')::boolean from public.audit_logs where id > v_audit_start and entity_type = 'promotions' and action = 'UPDATE' and entity_id = '${X.promoSeller}' order by id desc limit 1)`)}

  -- 7. Always roll back.
  raise exception 'T049_RESULT:%', replace(encode(convert_to(r::text, 'UTF8'), 'base64'), chr(10), '');
end
$t049$;`;
}
