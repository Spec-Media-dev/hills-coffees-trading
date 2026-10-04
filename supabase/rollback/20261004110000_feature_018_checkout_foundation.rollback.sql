-- Rollback for Feature 018 M2 (checkout_foundation): a SAFE DOWNGRADE, not a restoration of the pre-018 binary.
--
-- Drops only the two new public entry points that can create a purchase (selected-line checkout and its estimate).
-- Everything that protects history and security is RETAINED on purpose:
--   * cart_line_checkout_receipts, f018_checkout_permits, request payload binding and the frozen Arabic snapshots;
--   * the fenced public checkout_bank_transfer_v1 and the private f018_checkout_kernel, so fresh combined checkout
--     stays denied (no permit can exist without the dropped selected-line function) while historical committed
--     orders keep their replay/read semantics;
--   * the shared quote core, the canonical-cart guards on Add/update/remove/order_items and recover_cart_line_checkout
--     (read-only: a buyer can still resolve a lost redirect from the immutable receipt).
-- Feature 017 provider functions are never touched. Re-apply 20261004110000_feature_018_checkout_foundation.sql to
-- restore selected-line checkout; it is idempotent over these retained objects.

begin;

do $guard$
begin
  if to_regclass('public.f018_checkout_permits') is not null then
    if (select count(*) from public.f018_checkout_permits) > 0 then
      raise exception 'feature_018_m2_rollback_live_permit_present';
    end if;
  end if;
end
$guard$;

drop function if exists public.checkout_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid, uuid);
drop function if exists public.estimate_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid);

commit;
