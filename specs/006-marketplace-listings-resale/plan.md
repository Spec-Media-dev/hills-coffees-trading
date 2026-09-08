# Implementation Plan: Marketplace, Seller Listings & Resale

**Feature**: `006-marketplace-listings-resale` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Build the private marketplace (browse/detail for authorized members) and the seller listing
lifecycle (create → review → publish → partial fill → sold out), reading eligibility facts from 005
and writing only what RLS permits on `coffee_offers`. All availability shown is advisory; the
authoritative check happens inside `checkout_order()` (007). Nothing here is ever public.

## Technical Context

**Data**: `coffee_offers` (owner ALL for own org; member SELECT for published/partially-filled),
`listing_status_history` (own org + compliance), `offer_documents`, `offer_sensory_notes`,
`offer_tags`, plus 005's inventory read layer and `coffees`/`coffee_lots` context.
**Writes**: listing create/update/submit within RLS + `validate_offer_transition` trigger rules.
No fill/reservation writes (owned by 007/008).
**Caching**: none shared — private marketplace data (Constitution XI).
**Testing**: authorization negatives (AC-01), eligibility enforcement, state transitions, fill
presentation, plus participation in 007's concurrency test.

## Database capabilities consumed

| Need | Approved mechanism |
|---|---|
| Buyer browse | `coffee_offers` SELECT `member_read_published_offers` (`is_authorized_member()` + PUBLISHED/PARTIALLY_FILLED + `is_visible` + not deleted) |
| Seller manage own | `coffee_offers` ALL `offers_owner_or_admin` (`is_org_member(seller_organization_id)`; writes also need `created_by = auth.uid()`) |
| State history | `listing_status_history` SELECT (own org via offer, or compliance/auditor) |
| Listing extras | `offer_documents`, `offer_sensory_notes` (owner ALL; members read sensory notes for visible offers) |
| Eligible quantity | 005's `lib/inventory/*` (positions, availability) |
| Transition legality | `validate_offer_transition` trigger + `coffee_offers_status_allowed` / `coffee_offers_visibility_check` CHECKs |

**Not owned here**: `reserved_quantity_kg` and `filled_quantity_kg` are written by `checkout_order()`
and `admin_review_payment()` respectively — this feature only reads them.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| I Scope boundary | PASS | Fixed-price, permissioned, no order book/anonymity/leverage (FR-013) |
| III Database authority | PASS | Zero schema change; negotiation gap recorded, not built around |
| V/VI Surfaces & capability | PASS | `/dashboard` only; seller modules additive (FR-015) |
| VII Public/private boundary | PASS | FR-003, SC-006 — zero public exposure |
| VIII Server/DB authorization | PASS | FR-001, FR-005, SEC-001/005 with negative tests |
| X Inventory integrity | PASS | FR-007, FR-010, FR-011 — no re-derivation, advisory UI, DB-authoritative execution |
| XI Caching | PASS | FR-004 — no shared cache of marketplace data |
| XIV Security | PASS | SEC-001..006 |
| XV Ambiguity rule | PASS | Negotiated-offer gap and suspension-cascade question surfaced |

## Architecture decisions

1. **Two read paths, one table.** `lib/listings/browse.ts` (buyer view — relies on the database's
   published-only policy) and `lib/listings/manage.ts` (seller view — own organization, all states).
   Keeping them separate makes it obvious in review which path may return non-published rows.
2. **Eligibility is composed, not duplicated.** 005 supplies *facts* (owned, unreserved, custody,
   Hills-sourced). `lib/listings/eligibility.ts` composes them into the listing *rule* from SRS §8.1
   and returns either an eligible quantity or a specific, named refusal reason.
3. **Publication-time and execution-time checks are distinct.** This feature enforces MKT-02's
   publication check; the execution check belongs to `checkout_order()`. Both are documented in one
   place so a future agent does not assume publication implies executability.
4. **Price snapshots are order-side.** Listing price edits never alter an existing order because
   `order_items` stores its own `unit_price_per_kg` snapshot. Documented here because it is the
   natural place a reviewer would look for the answer.
5. **Fills are read-only projections.** Remaining = `quantity_kg − reserved_quantity_kg −
   filled_quantity_kg`, taken from stored columns and rendered; the module contains no tally logic
   that could drift.
6. **Transitions defer to the trigger.** The Server Actions attempt only transitions the approved
   trigger permits and surface its refusal as a safe application error — the application keeps no
   parallel state machine.
7. **Fixed-price only for MVP.** No offer/counter-offer UI is built; the gap is recorded so it is a
   visible product decision rather than a silent omission.

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── coffee/page.tsx + [offerId]/page.tsx        # NEW — marketplace browse + listing detail
├── listings/page.tsx                            # NEW — seller: my listings (all states)
├── listings/new/page.tsx + actions.ts           # NEW — create draft from eligible inventory
├── listings/[offerId]/page.tsx + actions.ts     # NEW — edit/submit/withdraw within trigger rules
└── sales/page.tsx                               # NEW — seller sales outcomes

lib/listings/
├── browse.ts · manage.ts · eligibility.ts · fills.ts · types.ts   # NEW
└── validation.ts                                                  # NEW — Zod schemas

components/listings/         # NEW — listing card, detail panel, availability/fill bar,
                             #       status badge, eligibility picker, refusal reasons

tests/listings/              # NEW — access control, eligibility, transitions, fills, isolation
```

## Testing strategy

- **AC-01 access control (highest value)**: anonymous / non-member / pending / suspended reach zero
  listing data; approved member succeeds.
- **Eligibility enforcement**: `can_sell = false` refused; non-Hills-sourced refused; over-available
  quantity refused with the available figure named; delivery-reserved quantity refused.
- **Direct-invocation bypass**: calling the create/publish action directly (no UI) is refused by the
  same server-side checks.
- **State transitions**: each permitted transition succeeds; each forbidden one is refused by the
  database trigger and surfaced as a safe error.
- **Fill presentation**: reserved excluded from actionable quantity; partial fill and sold-out states
  derive from stored columns.
- **Isolation**: seller A never sees seller B's drafts/rejected/suspended listings.
- **Public exposure**: no public route, sitemap or structured data contains listing data.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| Negotiated-offer/RFQ not modelled | MVP is fixed-price only | Recorded in spec Open items; requires an approved DB change to add |
| **DB-OPEN-05** | Lot detail may be unreadable on listing pages | Honest degradation, same as 005 |
| Suspension cascade undefined | Live listings of a suspended seller | Do not invent an automatic transition; 010 owns the workflow |
| Advisory availability misread as authoritative | Overselling risk | FR-010 + joint concurrency test with 007 (AC-02) |
| Seller-supplied text/documents | XSS / injection | SEC-004 escaping everywhere it renders, including 010's screens |
