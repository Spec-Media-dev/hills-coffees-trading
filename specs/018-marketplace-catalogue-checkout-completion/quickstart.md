# Feature 018 Validation Guide

Future implementation guide, not an execution report. No Feature018 code/migrations/test suite exists merely because these documents exist. Use reviewed implementation artifacts and approved target-specific fixtures before integration steps. Do not seed, apply SQL or run remote tests from this planning guide without the relevant explicit authorization.

## Prerequisites

1. Review spec.md, plan.md and all contracts; generate/review tasks in the next lifecycle stage. Keep BANK_TRANSFER_V1 and Feature017 retirement.
2. Complete phase1 actual-schema capture manifest and reconcile all checked-in/live differences. Finalize forward/rollback/read-only postflight from captured definitions, not historical migrations.
3. For isolated PostgreSQL tests, use documented local fixture/runtime configuration and the matching server major/extensions/auth/RLS, including separate authenticated sessions and MFA claims. PGlite/parser tests may check syntax/static contracts but cannot replace real lock/concurrency behavior.
4. For future approved remote runs, verify direct PostgreSQL and **effective** HTTP/Auth/REST/Storage project identity before creating clients or fixtures. Reject F013 local overrides mixed with remote approval. Keep approval flags disabled for local/static runs and report skips accurately.
5. Use exact run IDs/ownership manifests. Preserve curated/demo and immutable commerce/audit/history rows. Do not use fixture-looking names as a data filter or delete rule.

## Local Checks After Implementation

From repository root, with local/static configuration and remote live approvals disabled:

```powershell
npm test -- tests/commerce/cart-actions.test.ts tests/commerce/cart-page.test.tsx tests/commerce/add-to-cart-form.test.tsx tests/admin/catalogue-revalidation.test.tsx tests/admin/catalogue-media-translations.test.ts
npm test -- tests/auth/fixture-session-f016-target.test.ts tests/finance/f016-live-harness.test.ts tests/finance/f016-manifest-safety.test.ts
npm run typecheck
npm run lint
npm run build
git diff --check
```

Run new scoped Feature018 unit/component/static/harness cases once implemented, plus the approved compatible 009/013/014/015/016/017 regression selection. Do not infer a test count now. Historical fixture requirements and unrelated failures require causal triage, not automatic Feature018 blame. Existing gated live DB files may be checked with approvals disabled; skipped bodies count as no remote execution. No automatic `test:seed` or remote verification command is supplied here.

## Real PostgreSQL Transaction Scenarios

All require real connect/invoke/persisted assertions and manifest-owned fixture cleanup/retention. A capability probe is setup only. Independent connections must genuinely overlap, with controlled barriers/lock waits and bounded SQL timeout; sequential promises cannot demonstrate concurrency.

| Scenario | Procedure | Persisted expected outcome |
| --- | --- | --- |
| A/B/C choose A | Populate canonical cart with different offers/sellers; estimate/checkout A | One child/item, A-only shipping/tax/qualification/financials/reservation; B/C unchanged; source DRAFT/count2 |
| Last line | Checkout source's remaining line, then Add again | Same source empty ID/no finance artifacts; next Add same ID; child not DRAFT |
| Repeat cycles | Twenty final-checkout/new-Add cycles | Same pending cart ID, unique source identities/receipts, no replacement empty accumulation |
| First Add race | Two sessions Add when no DRAFT exists | One new canonical pending order, correct merged/distinct lines |
| Same-line race | Matching keys, then distinct conflicting keys/payloads | At most one committed child; matching replay; different consumption conflict |
| A/B race | Separate same-org sessions checkout A and B | Two serialized dedicated one-item transactions, no lost C or double consumption |
| Mutation races | Final/nonfinal checkout versus Add/update/remove | Exact serialized quantity/state or safe stale/conflict; no noncanonical source consumed |
| Shared backing | Different orgs/offers compete for same position including null location | No oversell; title/available/reserved sums conserved; bounded waits and no lock inversion |
| Expired reclaim/Finance | Stage expired multi-group reservations while Finance/release/checkout overlap | Complete union lock staging, no unstaged second scan; skipped locked reservation safely remains reserved |
| Selected quote | Give unrelated same-seller line enough quantity to change commission tier, and unrelated shipping group | Selected quote excludes both unrelated qualification and shipping; commit matches shared rules |
| Lost response | Suppress successful checkout response; recover by original intent after source deletion | Same receipt/order/artifacts, source not recreated |
| Changed binding | Change each of cart/item/org/offer/quantity/destination/operation/actor for reused key | Safe conflict/denial and no new reservation/payment/order |
| Failure injection | Fail child creation, item validation, snapshot, reservation/payment, receipt insertion, source deletion and deferred check | Original cart and inventory intact; no child/proforma/payment/receipt/request/notification residue |
| Direct legacy fence | Call old entry with fresh zero/one/many-line source DRAFT, spoof internal flag | Denied; internally permitted one-item child accepted |
| Historical replay | Replay an already committed multi-line/multi-group historical order | Same history/snapshots; no fresh combined checkout/retired grant restoration |
| Finance CONFIRM | Submit real permitted proof then confirm dedicated child | Exact one invoice/title event/buyer position/required storage allocation and FULFILLMENT group/item membership |
| Finance REJECT | Reject proof, repeat and race/recover | Terminal PAYMENT_REJECTED, release once; no invoice/title/handoff artifact |
| Corruption | Isolated persisted receipt/child/review/proof/invoice/title/shipment corruption variants | Integrity failure, not recreation or silently accepted terminal replay |
| Authority loss | Remove current eligibility/membership or use wrong org/blocked/non-MFA caller before replay | No privileged result/mutation despite known receipt/request IDs |

Inspect current tables, not just RPC success JSON. Compare exact item/group quantities/destination/contact/method/fee/currency, Finance review/proof/invoice/ownership links and null-safe inventory identity. Dedicated one-line checkout still exercises existing 009/016 downstream requirements; historical multi-group fixtures remain separate and intact.

## Admin/Discovery/Cart/Compare Scenarios

- First Coffee save twice/unknown response → one DRAFT. Interrupt translation/media/offer, reload, resume same Coffee/explicit selected offer. Concurrent revision/change-payload denial preserves both operators' work.
- Missing eligible position → saved catalogue/Warehouse handoff with no inventory INSERT. Unauthorized role/MFA/forged backing denied through direct RPC as well as UI.
- Catalogue-only publication versus coordinated approved-offer publication; missing bilingual/origin/primary readiness denial; injected combined failure leaves neither partially published. Existing English-only published fallback remains visible.
- Media lost attach response checks existing association before cleanup; only verified unattached intent object removed; report cleanup failure.
- Featured enable twice retains timestamp, Unfeature nulls, unpublish hides but retains, republish restores original order. Recent uses original creation time. Both ≤6, overlap valid, empty Featured omitted; related ≤3 deterministic excluding current.
- Anonymous browse/detail/search/Compare sees no prices/qty/private seller/inventory/cart/bank/proof in HTML/RSC/meta/JSON-LD/caches. Authenticated request then anonymous/cache reuse and tenant switching remain safe.
- Legitimate member offer with unpublished Coffee stays eligible; SOLD_OUT/own-offer/stock hold/provenance constraints remain effective. Localized bounded search distinguishes read failure from no results; gallery/media fallback is safe.
- Add EN/AR committed feedback, new-intent merge versus replay, unavailable retained count, quantity-only count stability and zero-icon behavior. Auth/org/epoch/cross-tab/focus cannot apply prior private response/count. Member logo `/`, no Admin cart, contact/RFQ retained.
- Public slugs versus member offer refs max3, separate offers of same Coffee, fresh values/unavailable states, clear/remove, no commercial public URL or stored price/signed URL. Context loss clears private data.

## Bank/Documents/Help Scenarios

- Bank CRUD/default role/MFA split, valid active USD readiness and concurrent default selection; account change affects only new bank snapshot. Buyer old/expired reads never fall back to current account.
- Exact current pointer with deliberately higher other document; NULL/corrupt link, projection/type/query/connectivity failure and expiry-RPC error are classified rather than empty/highest-version fallback.
- New issuance freezes AR names; later translation edit leaves issued fields unchanged. Historical null remains frozen English; custom offer title/account/reference unchanged LTR.
- Every buyer-state row in surface-security contract presents its permitted next action; proof received/review/rejected states do not suggest duplicate transfer/proof. Known committed render failure opens order; uncertain outcome preserves intent.
- HC16 random references, forced collision retry/exhaustion atomicity, old HLP/raw-ID authorized redirects. Category General fallback, bounded Admin filters/search.
- Cross-tenant/current-org/blocked/MFA/nonstaff/ref/staff-author forgery denied. Historical actual item seller can link own authorized order while buyer proof/financial data remains private.
- Atomic ticket+initial message/history/events; same/changed-key create/reply/status, concurrent reply/status, every graph edge/null/invalid transition, waiting/resolved member reopen, closed member denial and explicit Admin reopen.
- Safe receipt/staff-reply/status notifications exclude actor/deduplicate; no message body/bank/proof payload; ticket link reauthorizes. History/messages append-only and audit safe metadata; commerce notification bindings unchanged.

## EN/AR, Accessibility and Performance

Exercise all nine story acceptance paths in both locales at 360/768/1280px. Check semantic headings/table headers, keyboard/tab/focus restoration, labeled quantity/dialog/gallery/tray/form errors, live announcements, contained compare/document scrolling and sticky actions. Run axe plus manual keyboard/assistive-technology critical paths. Enable reduced motion; all content/actions remain available. Check every changed user/admin/notification/accessibility string and original-language fallback.

Record representative device/network/build/browser conditions and measured LCP/interaction delay/CLS against specified budgets. Lab runs are not field p75 evidence; build success is not measured performance or product readiness.

## Approved Migration Verification and End State

Follow migrations-verification contract: capture/preflight → reviewed forward groups → read-only postflight → real scenarios → rollback compatibility → conditional reapply/postflight → cleanup/retained evidence → final health. Do not run historical Feature016 Scenario28 or Scenario29 unchanged after Feature017. Compatibility wrapper adapts fresh setup and ACL assertions while retaining historical multi-group integrity tests.

Recovery/finally is mandatory after rollback succeeds: inspect actual state, conditionally restore Feature018 applied with Feature017 retirement, run postflight/active V1 checks, then report original failure. Failed restoration immediately stops dependent operations and reports exact state/ACL exposure/step/operator recovery; no false completion. Final successful verification requires APPLIED/healthy, provider execution denied and Edge/secrets absent. Cleanup operates only on verified manifest resources, retains immutable records, and reports all residue.

## Three Delivery Passes

Use [tasks.md](tasks.md) in three delivery passes; do not treat a pass as permission to skip its internal task dependencies.

| Pass | Task range | Required internal gate |
| --- | --- | --- |
| A — Foundation, Checkout, Admin & Bank | T001–T059 | T001–T010 are local capture work; **T011 is REMOTE READ-ONLY** TEST/DEMO capture; T012 reconciles it. Do not author migration SQL or start Feature018 database implementation until T011/T012 are complete with no unresolved drift. Phase A closes on local integration/postflight evidence, not remote mutation. |
| B — Marketplace & Member Experience | T060–T111 | Consume M1/M2 contracts from Pass A. Demonstrate the local public-to-member journey and Help Center without waiting for Pass C polish/live work. |
| C — Polish, Regression, Live Verification & Closure | T112–T140 | T120–T128 local/static; T129 records explicit remote authorization; T130–T138 are remote TEST/DEMO work only against `mxejnutukgxyccnohglo`; T131 is the first remote mutation; T139–T140 close from evidence. |

The remote capture in T011 is deliberately distinct from remote mutation. Neither it nor a skipped live test establishes deployed implementation evidence.

## Planning Session Evidence

This session authored planning documents and checked their coverage/links/Git whitespace only. It did not implement product code, create tasks/migration SQL, run product tests/build, mutate Supabase or claim Feature018 live verification. The setup helper was blocked once by lean-ctx's permanent allowlist restriction; no bypass/retry was used. Before/after plan hooks are absent. Review the plan before generating tasks.
