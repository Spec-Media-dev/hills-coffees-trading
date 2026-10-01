-- ==============================================================================
-- READ-ONLY PRODUCTION PREFLIGHT INVENTORY SCRIPT: FEATURE 015
-- ==============================================================================
-- Purpose:
--   Produce a complete, read-only audit and inventory manifest of all in-flight
--   orders under the 'BANK_TRANSFER_V1' commerce flow prior to Feature 015
--   migration authoring and cutover.
--
-- FINAL OWNER AUTHORITY:
--   All currently existing commerce/order/proforma data in all non-production environments
--   is TEST / DEMO DATA ONLY. There are no real customer orders, no real paid orders,
--   and no real in-flight legacy BANK_TRANSFER_V1 orders. No backward-compatible
--   manifest compatibility is required.
--
-- Safety Invariants:
--   - 100% READ ONLY: Contains SELECT queries exclusively. Zero mutations.
--   - Wrapped in BEGIN TRANSACTION READ ONLY to strictly disallow any write.
-- ==============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1. OVERALL COMMERCE STATUS SUMMARY
-- Count of all orders under BANK_TRANSFER_V1 grouped by status
SELECT
  o.commerce_flow,
  o.status AS order_status,
  COUNT(*) AS total_orders,
  MIN(o.created_at) AS oldest_order_created_at,
  MAX(o.created_at) AS newest_order_created_at
FROM public.orders o
WHERE o.commerce_flow = 'BANK_TRANSFER_V1'
GROUP BY o.commerce_flow, o.status
ORDER BY o.status;

-- 2. EXACT IN-FLIGHT 'PROFORMA_ISSUED' ORDERS MANIFEST
-- These are unreserved proformas issued under legacy Sprint 1 flow.
-- Must be reviewed before cutover to ensure they are not stranded.
SELECT
  o.id AS order_id,
  o.order_code,
  o.buyer_organization_id,
  o.status AS order_status,
  o.created_at AS order_created_at,
  pi.id AS proforma_id,
  pi.proforma_code,
  pi.status AS proforma_status,
  pi.buyer_total,
  pi.currency,
  pi.created_at AS proforma_created_at,
  pi.expires_at AS proforma_expires_at,
  CASE
    WHEN pi.expires_at IS NOT NULL AND pi.expires_at <= clock_timestamp() THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END AS proforma_validity
FROM public.orders o
LEFT JOIN public.proforma_invoices pi ON pi.order_id = o.id
WHERE o.commerce_flow = 'BANK_TRANSFER_V1'
  AND o.status = 'PROFORMA_ISSUED'
ORDER BY o.created_at ASC;

-- 3. EXACT IN-FLIGHT 'HOLD' ORDERS MANIFEST
-- These are orders with active 20-minute timed reservations under Sprint 1 flow.
SELECT
  o.id AS order_id,
  o.order_code,
  o.buyer_organization_id,
  o.status AS order_status,
  o.hold_started_at,
  o.hold_expires_at,
  ir.id AS reservation_id,
  ir.status AS reservation_status,
  ir.expires_at AS reservation_expires_at,
  CASE
    WHEN ir.expires_at <= clock_timestamp() THEN 'EXPIRED_AWAITING_SWEEP'
    ELSE 'ACTIVE_HOLD'
  END AS reservation_validity,
  p.id AS payment_id,
  p.status AS payment_status,
  p.expected_amount,
  p.currency
FROM public.orders o
LEFT JOIN public.inventory_reservations ir ON ir.order_id = o.id AND ir.status IN ('ACTIVE', 'REVIEW_HOLD')
LEFT JOIN public.payments p ON p.order_id = o.id
WHERE o.commerce_flow = 'BANK_TRANSFER_V1'
  AND o.status = 'HOLD'
ORDER BY o.hold_started_at ASC;

-- 4. ACTIVE 'DRAFT' ORDERS SUMMARY
-- These are carts in review that will use the new checkout_bank_transfer_v1 seam upon checkout.
SELECT
  COUNT(*) AS total_draft_orders,
  MIN(o.created_at) AS oldest_draft_created_at,
  MAX(o.created_at) AS newest_draft_created_at
FROM public.orders o
WHERE o.commerce_flow = 'BANK_TRANSFER_V1'
  AND o.status = 'DRAFT';

-- 5. ACTIVE RESERVATIONS SANITY AUDIT
-- Verification of any reservations across the platform currently in ACTIVE or REVIEW_HOLD status
SELECT
  ir.status AS reservation_status,
  COUNT(*) AS total_reservations,
  COUNT(*) FILTER (WHERE ir.expires_at <= clock_timestamp()) AS overdue_for_release,
  COUNT(*) FILTER (WHERE ir.expires_at > clock_timestamp()) AS currently_active
FROM public.inventory_reservations ir
WHERE ir.status IN ('ACTIVE', 'REVIEW_HOLD')
GROUP BY ir.status;

COMMIT;
