# Contract: Selected-Line Checkout, Cart and Recovery

Applies to FR-029–060, DI-001–008 and Features 013/015/016/009/017 compatibility. Proposed signatures below are design contracts; no RPC is implemented by this document.

## Interfaces

| Operation | Proposed input | Safe result |
| --- | --- | --- |
| `checkout_cart_line_bank_transfer_v1` | buyer org, source cart, source item, offer, exact quantity, destination, request UUID | Immutable receipt ID + existing child checkout result + freshly read CartSummary |
| `estimate_cart_line_bank_transfer_v1` | buyer org, source cart/item, offer, exact quantity, destination | Selected-line buyer quote only; no reservation or temporary committed order |
| `recover_cart_line_checkout` | current buyer org, root request, source cart/item and bound payload | `COMMITTED` + original receipt/child result; `NOT_COMMITTED` only when conclusively checked; or typed conflict/unauthorized/integrity/unavailable |
| `readCart` / summary | authenticated current org | Canonical DRAFT ID/null + pending lines/count + typed read state; no inserts |
| Add | current org, offer, quantity, stable request | Existing canonical cart/line + safe operation result + authoritative summary |
| Update/remove | current org, expected canonical cart, item, quantity where relevant, request | Bound mutation outcome + authoritative summary; old RPC signatures require equivalent V1 guards |

RPC authority derives actor/current org validity server-side; passed org/cart/item IDs are claims to validate, not authority. Boundary validation rejects missing/null/malformed IDs, nonpositive/nonfinite/out-of-scale quantity and unsupported currencies/promos. Support cross-operation request-key tests and payload changes, not only duplicate clicks.

`CartSummary` is a separate fresh read after commit; a failure to refresh it must not disguise a committed checkout as failed. Show the known committed order and a summary-refresh error. No follow-up summary error may cause another checkout. Server Actions return a discriminated outcome, separating operation commit/replay from navigation/presentation state.

## Atomic Sequence

1. Validate input; authenticate and freshly enforce buyer membership/current org, active/KYB/can_buy, blocked user and applicable MFA using the existing authority helpers. No replay result before this check.
2. Acquire existing organization advisory transaction lock (`hashtextextended(org::text,13)`); resolve canonical DRAFT with a read-only latest `created_at DESC, id DESC` query, including zero lines. Do not call the insert-on-absence `commerce_resolve_cart` branch from checkout/recovery/estimate. Checkout/recovery never creates a source cart. Lock an existing canonical source parent before any selected item; absence still permits an authorized committed-receipt lookup before refusing a new checkout.
3. Look up immutable receipt by root request/source-line binding. Validate actor, organization and every bound payload field before replay. Matching committed receipt returns original child after persisted-link integrity validation. A different request for an already consumed line conflicts; it does not create a replacement purchase. A matching receipt can be recovered even if canonical-cart selection later changes or the line no longer exists, but authorization still uses current org and receipt scope.
4. For new checkout, require passed cart equals current canonical cart and exact BANK_TRANSFER_V1 DRAFT with no transaction artifacts. Lock selected item and re-read its cart/org/offer/quantity/snapshot. Missing, stale, changed or consumed item fails safely. Validate destination is active, current-org-owned and supported under existing rules; retain exact destination ID in binding.
5. Claim root request in the protected payload-aware operation log under the same canonical lock hierarchy. Check actor/operation/target/payload conflicts; never return legacy `commerce_request_begin` response without stronger binding. Allocate a distinct child request UUID internally.
6. Stage expired-reservation reclamation and the full inventory lock set as below **before child item INSERT**, because its existing validator can acquire an offer lock.
7. Create a distinct child order owned by the authorized buyer, with server actor/BANK_TRANSFER_V1/DRAFT and no unrelated items. Install its protected internal permit, bound to source/actor/org/root/child request/offer/quantity/destination and completed lock staging. Insert exactly one copied item; existing authoritative item validation/snapshots remain active. The source line is still present.
8. Invoke existing `checkout_bank_transfer_v1` through its protected fresh-child branch into the shared private Feature 015 kernel. It verifies permit/item/binding, uses the staged inventory locks and does **not** rescan expired orders. Compute quote only from the child, issue frozen EN/nullable AR/bank/destination/financial/group snapshots, reserve exact quantity, set proforma CONFIRMED and child HOLD/current pointer, create BANK_TRANSFER payment and established notifications. No client totals are accepted.
9. Validate complete child result/linkage. Insert final immutable receipt with original source snapshot and exact child/proforma/payment/reservation links; complete root operation result. Delete only the locked source item after that receipt exists. Confirm source parent remains the same clean DRAFT and remaining items unchanged.
10. Remove internal permit. Deferred checks prove child has exactly one item, child is not DRAFT, no durable permits, receipt consistency and existing snapshot/financial totals. Commit once. Every exception rolls back child, inventory, payment/proforma, receipts/request claims, notifications and source deletion together.

Any injected failure at steps 5–10 must leave original source lines/quantities and inventory unchanged. No independently committed split, client orchestration, compensating financial deletion or stranded child DRAFT is permitted.

## Canonical Lock Order and Reclamation

For V1 cart writes: fresh authority → organization advisory → canonical source order → selected source item(s) ordered by UUID → protected operation claim → expired-order/reservation staging → all relevant offers ascending UUID → all relevant inventory positions ascending UUID. Newly created child rows have no competing reader before commit; acquire their locks without returning to another pre-existing cart/order after inventory locks. Downstream Finance preserves order → offers → positions and never takes a source-cart advisory lock after holding inventory locks.

Detailed reclamation stage:

- Discover expired ACTIVE reservations sharing the selected offer without locking an offer first. Resolve their existing order IDs; acquire candidate expired order locks ascending with `FOR UPDATE SKIP LOCKED`, matching existing release semantics. Revalidate HOLD/ACTIVE/expired status and lock reservation rows consistently before release.
- Build the **complete union** of selected offer plus all reservation-item offers to be released. Lock offers ascending UUID; derive/revalidate the full backing-position union using `IS NOT DISTINCT FROM` location semantics; lock positions ascending UUID. Recheck provenance/eligibility/available quantity and release candidacy after locks.
- Release only the staged expired reservations through the established helper with already-held reentrant locks; preserve its decrement/status/snapshot semantics. Its position-before-offer decrement writes do not acquire a new lock after the full set is held.
- Insert child item only now. Its selected-offer lock is reentrant. Shared kernel must not perform a second reclamation scan or acquire unstaged pre-existing order/offer/position locks. A skipped candidate remains reserved; an availability failure is safe, not permission to reclaim an unlocked order.

The shared staging helper replaces the old sequential reclaim loop only where fresh checkout executes. Historical logged replay does not reclaim or reserve. The design does not copy an unchanged Feature 015 body behind a wrapper while leaving its later reclaim loop active. Validate actual installed release/trigger behavior in phase 1; if it has an additional lock edge, reconcile the full graph before SQL implementation. Test independent sessions with different orgs, same/null-location backing positions, expired historical multi-group orders, Finance confirm/reject and stock guards. A timeout is not evidence of deadlock freedom; inspect lock waits and serialized outcomes.

Add/update/remove and `get_or_create_cart` must use the same organization key/resolver. Upgrade old V1 update/remove database entry points: locate item’s scope without mutating, freshly authorize, acquire org lock, resolve/lock canonical parent, lock/re-read selected item and reject stale/noncanonical/non-DRAFT targets. Preserve separate historical LEGACY behavior under its existing guards. Do not rely on the DAL’s prior `readCart`. Recheck after waits. Direct table/API writes that bypass these invariants must be revoked or equivalently enforced by triggers; capture existing policies/grants before deciding.

## Quote Contract

Extract the established `compute_order_quote` rules into one shared private calculation accepting an explicit validated item subset. Keep the existing three-argument interface compatible for historical consumers; add a controlled single-line estimator. Filter every source CTE and every aggregate, including same-seller qualifying quantity, commission tier assignment, shipping groups, tax, total quantity and buyer totals. Estimation uses source item ID only, without creating a child; commit uses its dedicated one-item child. Both use the same approved USD/UAE/shipping/tax/commission/bank rules, and commit freshly revalidates inventory/configuration.

Buyer quote projection excludes commission/seller net/share, internal positions/locations and configuration secrets. It includes selected identity/quantity, permitted USD/kg, merchandise/shipping/tax/total, safe destination and expiry/configuration guidance. Estimate is not a price lock or reservation. Missing bank/shipping/tax settings abort checkout with source intact. No new pricing/promotional rule is introduced.

## Legacy Entry Point Fence

Retain `checkout_bank_transfer_v1(uuid,uuid,uuid)` signature and existing allowed authenticated execution. Move shared transaction internals into an owner-only hardened kernel; no PUBLIC/anon/authenticated/service_role execution on private helpers. Preserve output shape, existing financial state transitions and transaction semantics. The public wrapper:

1. Freshly authorizes the order’s buyer before replay.
2. For a fresh DRAFT: requires exactly one item **and** an exact protected in-transaction child permit. Reject arbitrary source carts, zero-line DRAFTs and multi-line DRAFTs regardless of UI, guessed IDs, GUCs, old request logs or supplied flags. The newly created child is accepted through this same entry point inside the split transaction.
3. For already committed historical orders: permits authorized existing replay/read semantics without a one-item condition or permit. It never adds/removes items, reissues a new transaction or rewrites snapshots; mismatched ownership/integrity fails closed. Existing terminal Finance replay checks remain intact.

Guard before any old generic request-log return that could authorize a fresh DRAFT bypass. `issue_proforma`, `confirm_proforma`, `checkout_order`, proof legacy fences and Feature 017 retired-provider ACLs remain effective. Adapt new fixture creation to selected-line RPC; historical multi-group regression uses actual committed history or explicitly isolated pre-cutover baseline setup, never reopening retired grants or replaying old migrations into the applied environment.

## Receipt Replay and Unknown Outcomes

Same root request + actor + exact canonical payload returns same immutable result. Changed cart/line/org/offer/quantity/destination/operation/version conflicts, even if child is now terminal. A different root key cannot consume the same source item due to its unique receipt identity. Re-adding the same offer creates a new item identity and deliberate new purchase; it cannot reuse the old receipt as the pending line.

Recovery works after source deletion. Verify receipt shape/links, child buyer/flow/exact one item/offer/quantity, immutable proforma/destination/financial/bank relationships and request result consistency. Preserve actual evolving payment/reservation state; use existing terminal integrity validators for confirmed/rejected outcomes. A missing child, opposite/extra authoritative review or corrupted invoice/title/shipment linkage fails closed with support guidance, never recreation.

If transport times out, keep root request and bound payload stable. Do not immediately assert `NOT_COMMITTED`: the first transaction may still run. Retry/recovery obtains the same advisory/operation serialization, or reports pending/unavailable while unable to establish outcome. A definite absent committed receipt after synchronization permits retry of the **same** intent against the same unchanged source binding. Navigation failure after known commit shows Open your order. Client cache/receipt possession does not authorize another tenant.

## Empty-Cart Invariants and Races

- Non-final/final checkout preserves source ID and V1 DRAFT; final count is zero with no destination/payment/proforma/reservation transfer.
- Resolver includes empty DRAFT; no replacement because item count is zero. Only authorized Add/create with no canonical DRAFT inserts a pending order. Reads/estimate/recovery do not create it.
- Same-org A/B concurrent checkout serializes by org lock, both may commit dedicated one-item orders; each leaves the other source line unchanged until its own operation. Same-line matching intent replays; conflict never substitutes a line.
- Final checkout versus Add/update/remove returns a valid serialized outcome. Add before consumption may change quantity, so an old exact quantity conflicts rather than purchase a different quantity; Add afterward reuses same source cart. Remove first causes safe stale failure; checkout first makes later update/remove stale/recovery.
- Historic multiple DRAFTs keep latest `(created_at,id)` selection. Reject a stale older cart for fresh mutation; do not consolidate/delete it. Receipt recovery still uses its immutable authorized binding.

## Error/Verification Contract

Typed safe codes: AUTH_REQUIRED, MFA_REQUIRED, ORG_REQUIRED, BUYING_DENIED, WRONG_SCOPE, STALE_CART, STALE_LINE, PAYLOAD_CONFLICT, ALREADY_CONSUMED, OFFER_UNAVAILABLE, INVALID_DESTINATION, CONFIGURATION_UNAVAILABLE, INTEGRITY_FAILURE, OUTCOME_UNKNOWN and READ_UNAVAILABLE. Map database exceptions centrally; log only safe correlation/code, never full financial/proof/bank payload.

Required real PG coverage includes A/B/C→A only; same/different seller qualification exclusion; final empty/add 20 cycles; concurrent first Adds; same/different-line and update/remove/Add races; changed payload/cross-op keys; lost responses; each precommit failure point; shared/null-location backing competition; reclaim versus Finance and old multi-group history; direct fresh legacy denial; current authorization loss on replay; exact invoice/title/allocations/shipments after confirm and absence after reject.
