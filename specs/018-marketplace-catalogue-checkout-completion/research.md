# Feature 018 Research and Decisions

**Date**: 2026-10-04. Evidence is checked-in implementation and installed documentation, not a new live schema inspection. Focused read-only checkout and Admin/support research was delegated under speckit-plan's research-agent instruction. No product changes or remote verification occurred.

## 1. Preserve Three Existing Surfaces

**Decision**: Extend root homepage/public Coffee, member marketplace/cart/order and existing Admin routes; no route relocation or parallel buying/Admin application.

**Rationale**: Constitution v2.0.0 fixes root App Router files, normalized domain authority and Public/Member/Admin separation. `package.json` pins Next 16.3.4/React 19.2.8 and the existing UI/database dependencies. The clarified spec overrides fresh combined checkout intentionally while preserving history.

**Alternatives considered**: Rebuilding the portal or installing a separate storefront/support/cache package would multiply private-data boundaries without satisfying another requirement.

## 2. Atomic Split and Durable Recovery

**Decision**: One PostgreSQL selected-line transaction creates a distinct child, completes established checkout, inserts immutable receipt then consumes the source line. Source DRAFT remains. Protect internal child execution with a transaction-local permit and owner-only kernel, never a browser flag.

**Rationale**: `lib/commerce/cart.ts` and `20260926100000_feature_013_cart_destination_rpcs.sql` already resolve latest V1 DRAFT including empty under advisory seed13. `20260930100000_feature_015_atomic_checkout_and_payment_proof.sql` supplies quote/snapshot/reservation/payment/HOLD semantics but accepts arbitrary multi-line DRAFTs. Source item deletion removes the live identity needed by retries; durable binding must survive it. FR-039–060 requires child/source separation even for the final item.

**Alternatives considered**: Client-side copy/delete is not atomic; directly checking out the last source cart breaks empty reuse; a one-DRAFT uniqueness index conflicts with retained historical multiple DRAFTs; unprotected GUC/internal flag creates an alternate bypass. A protected permit adds only internal coordination and cannot survive commit.

## 3. Lock Staging Before Child INSERT

**Decision**: Reconcile expired-order reclamation before child insertion, lock the full selected/reclaimed offer union then position union, and suppress a second reclaim scan in the private kernel. Harden old V1 update/remove/Add entry points with canonical organization/cart/item ordering.

**Rationale**: F015 checkout's sequential expired-reservation loop precedes its offer locks. Child `order_items` INSERT invokes `validate_order_item_offer`, which can lock an offer first. Copying an unchanged kernel would therefore create a new inversion. `20260928120000_feature_013_stock_reservation.sql` release helper locks an expired order with SKIP LOCKED and decrements positions then offers. Existing locks can be reused after full union staging. Feature 016's current Finance kernel locks offers before positions and handles null locations. F007 update/remove currently pre-read an item and lock its parent without org advisory/canonical revalidation; DAL checks alone do not secure direct RPCs.

**Alternatives considered**: A lock-order slogan, row locking only in React/DAL, or accepting a deadlock timeout as proof is insufficient. Replacing financial/reservation arithmetic is unnecessary; retain its body/outputs and stage only acquisition paths. Exact installed trigger/helper bodies remain a phase-1 gate.

## 4. Exact Payload Binding

**Decision**: Extend protected existing request-log storage with nullable canonical payload for F018 operations and use new payload-aware helpers; receipt stores the full selected binding plus source snapshot/result. Generate a separate internal child request UUID.

**Rationale**: `commerce_request_begin` in F013 binds actor/operation/target only, not quantity/offer/destination. Reusing root request for its child would conflict with the existing different operation/target key. Exact JSON/numeric equality avoids treating a hash alone as authority. Historical rows/old helper behavior remain unchanged outside upgraded operations.

**Alternatives considered**: Client idempotency state, request UUID alone, or returning any old log response before authorization/payload validation fails changed-payload and cross-tenant requirements. A new general orchestration ledger is unnecessary while an existing protected request log can be extended.

## 5. One Shared Selected Quote

**Decision**: Refactor approved `compute_order_quote` internals into a subset-aware private calculator, preserving historical signature; selected estimator and one-item child commit share rules.

**Rationale**: `20260926103000_feature_013_quote_and_proforma_issuance.sql` computes same-seller qualifying quantity and shipping groups across order items. Selecting only the final output line would still charge/use unrelated qualification. Filter all inputs and aggregates. Commit still freshly validates USD/UAE/default bank/tax/shipping/stock.

**Alternatives considered**: Duplicating formulas in TypeScript or committing temporary quote-only orders introduces drift or DRAFT accumulation.

## 6. Resumable Admin Without Universal Authority

**Decision**: Controlled idempotent create/step-save/CAS/publication around existing Coffee/translation/media/offer records. Existing role guards remain per action; coordinated publication is atomic and requires both applicable permissions.

**Rationale**: `lib/admin/catalogue.ts` creates Coffee DRAFT directly, saves normalized content/media and transitions status. Creation has no intent binding; edits lack revision conflict protection. `lib/admin/decisions.ts` preserves Compliance decisions/history; it does not make catalogue operators universal offer publishers. `lib/listings/eligibility.ts` and offer/inventory guards require real backing and resale provenance. New publication requires bilingual/content/media/origin readiness, not fabricated inventory.

**Alternatives considered**: A combined Coffee-price-stock row, auto-creating an offer on reload, or granting Finance/Compliance/Warehouse catalogue authority would change settled boundaries. A giant multi-screen transaction cannot include Storage uploads; use intent-aware attach recovery and verified orphan compensation.

## 7. Featured/Public Privacy and Cache

**Decision**: Nullable Coffee editorial timestamp; bounded deterministic Recent/Featured/related projections; shared visual composition with separate public/commercial DTOs. Existing public-assets stay public; private listing media stays session-signed.

**Rationale**: `lib/public/coffees.ts` already allowlists public DTOs/PUBLISHED records and normalized translations; `lib/public/cache.ts` owns native tags. `lib/listings/browse.ts` has title search and protected commercial rows; `lib/listings/media.ts` signs listing-media. Existing member eligibility does not require public Coffee publication. Homepage has static showcase plus a separate protected marketplace component, which cannot be allowed to populate a shared public cache.

**Alternatives considered**: Joining offers into public queries, hiding a price only with CSS, publishing private imagery for convenience, or filtering fixture-looking titles is invalid. Preserve native cache infrastructure; no Redis or cacheComponents migration.

Installed Next docs `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/{unstable_cache,revalidateTag}.md` support explicit `{ expire: 0 }` invalidation and disallow headers/cookies in cache scope. `unstable_cache` is documented as superseded by recommended Cache Components, but changing the repository's cache architecture is unnecessary here. Preserve the established mechanism and record that constraint.

## 8. Authoritative Cart and Reference-Only Compare

**Decision**: Server CartSummary plus context epoch/sequence rejects stale responses; mutations refresh committed state. Separate public slugs/member offer IDs in session storage, re-fetch values on open, maximum three.

**Rationale**: `readCart` selects latest DRAFT and returns an empty existing ID; authoritative line count includes unavailable retained intents. Existing Add merges same offer quantity; new intent vs same-intent replay must differ. Private commercial values must not survive org/session switches or public URL sharing.

**Alternatives considered**: Optimistically incrementing a local badge, accepting cross-tab transmitted counts, trusting persisted price/stock/signed URLs, or creating a Compare table adds incorrect authority.

## 9. Frozen Bank, Arabic and Buyer State

**Decision**: Resolve exact current proforma pointer, propagate typed query errors, use frozen permitted bank/snapshot data, capture nullable Arabic fields only at new issuance, and render actual Finance/order/reservation states.

**Rationale**: `lib/commerce/read.ts` currently selects highest version and can collapse errors; buyer proforma route/reservation refresh need classified outcomes. F013 snapshot tables and `prevent_snapshot_mutation` already enforce immutable V1 rows. F015 insertion lines634–650 are the new Arabic capture point. Feature 016 confirms V1 order/payment while proforma remains CONFIRMED; rejection is terminal PAYMENT_REJECTED. `lib/admin/payment-accounts.ts` omits default status in its current projection although existing `set_default_payment_account` handles defaults.

**Alternatives considered**: Reading current bank configuration as fallback, translating historical documents from current Coffee, forcing proforma PAID or inventing PDFs/statuses would regress closed contracts.

## 10. Extend Feature 014 Help

**Decision**: Add category, random HC code generation, protected idempotent writes and append-only status history. Reuse existing tickets/messages/current statuses/Platform Admin and direct transactional in-app notifications.

**Rationale**: `20260929110000_feature_014_support_ticket_reference.sql` provides immutable HLP references, atomic initial creation and reply-driven transitions; current `lib/messaging/` and message actions have no category/idempotency/history/help notification contract. Existing ticket guards check order header seller while `can_view_order` recognizes actual item sellers; fix this inconsistency for historical multi-seller support context. `20260925115000_feature_013_notification_outbox.sql` has constrained commerce templates and no general fanout worker; it cannot be claimed to deliver support events.

**Alternatives considered**: New support product, sequential new references, free-form status updates, caller-supplied staff/recipient, body-in-notification or new messaging framework violates scope/security. Creation confirmation is returned to actor while notification rows exclude self; other authorized recipients may receive safe receipt events.

## 11. Design/Motion Grounding

**Decision**: Retain Hills forest/cream, restrained gold/orange and existing type system; use existing cards/detail/media/navigation/motion ownership with a tighter action hierarchy. Client ownership is limited to gallery, quantity, selector, toast/tray/dialog and form controls.

**Rationale**: Owner screenshots demonstrate oversized marketplace media, weak action feedback and proforma errors. Repository `docs/claude-design/`, design guidance and `components/motion/ANIMATION-OWNERSHIP.md` are concrete references. Prior Refero research attempts returned NO_SUBSCRIPTION; no successful external references are claimed. Use these owner/repository references as the reference lock.

**Alternatives considered**: Rebrand, new animation engine, page-sized client component or combining Motion/GSAP/CSS on the same property/interaction. Motion owns ordinary UI transitions; CSS handles simple feedback; GSAP remains restricted; reduced motion preserves all actions.

## 12. Verification and Migration Safety

**Decision**: Four logical migration groups and explicit capture/preflight/rollback/postflight matrix; future approved real PostgreSQL concurrency and migration restoration. No remote execution in this planning session.

**Rationale**: Latest migrations supersede the historical baseline schema; current installed functions/grants must be captured before editing. Feature 017 retirement must survive every helper and recovery. Feature 016 pre-retirement ACL scenarios cannot run unchanged in the retired environment. New history is retained during rollback; safe fences stay effective.

**Alternatives considered**: Replaying historical migrations, dropping new receipts/snapshots on rollback, restoring old combined checkout or treating skipped/mocked tests as transaction proof.

## Research Resolution

No unresolved owner decision or design clarification remains. Unknown actual deployment definitions are explicitly listed implementation prerequisites, not guessed schema facts. Unexpected live drift, unresolved lock edges or unsafe rollback restoration is a blocking implementation/verification finding until reconciled. Planning completeness does not attest that Feature 018 code, SQL or remote state exists.
