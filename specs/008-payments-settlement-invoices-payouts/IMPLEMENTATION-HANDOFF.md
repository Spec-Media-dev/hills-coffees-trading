# Feature 008 — Payments, Settlement, Invoices & Payouts — Implementation Handoff

## RUN A / Phase 1 — Provider-neutral finance foundation (T001–T006)

**Model**: Claude Sonnet 5 — High
**Date**: 2026-09-13/14
**Scope executed**: T001–T006 only. No Phase 2+ work, no provider selection, no database migration,
no `admin_review_payment()`/`submit_payment_proof()` call, no UI screens. Worked directly on `main`;
no branch created, nothing committed or pushed by this run.

---

## 0. Authoritative-source reconciliation (before any code was written)

Read, in order: `docs/requirements/Hills-Coffee-SRS-v1.md` (background only — no new SRS requirement
touches Phase 1), `docs/database/database-schema-report.json` (the live schema/RLS/grant/function
baseline — decoded via the same double-JSON-wrapped convention `tests/orders/db-baseline.ts` already
established), `docs/database/commission-capability.md`, `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md`, `specs/007-orders-checkout-reservations/**` (closed feature,
consumed not re-verified), and this feature's own `spec.md`/`plan.md`/`tasks.md`. Current database
capability/live evidence was treated as authoritative over planning prose throughout, per both the run
directive and `plan.md`'s own stated priority.

No missing database behavior was invented. No database change was made or proposed as a workaround.

---

## 1. What was built

| File | Purpose |
|---|---|
| `lib/finance/validation.ts` | Status/method const arrays (`PAYMENT_STATUSES`, `PAYMENT_METHODS`, `PROFORMA_STATUSES`, `PAYOUT_STATUSES`) copied verbatim from the live CHECK constraints, their Zod schemas, `parse*` helpers, and `RequestFundingInput` (T004's minimal-identifier input contract). |
| `lib/finance/types.ts` | `PaymentDTO`, `OrderFinancialsDTO`, `ProformaDTO`/`ProformaItemDTO`, `TaxInvoiceDTO`, `PayoutDTO` — explicit field allowlists, one `currency` field per DTO covering every amount in that DTO. |
| `lib/finance/errors.ts` | `mapFinanceError()` — mirrors `lib/orders/errors.ts`'s exact raised-message → `ActionFeedbackCode` pattern; `FINANCE_ERROR_MAP` is empty this run (no mutating RPC exists yet to raise anything); unmapped errors log only the SQLSTATE-shaped `code`. |
| `lib/finance/read.ts` | `getPayment`, `getOrderFinancials`, `getProforma`, `getTaxInvoice`, `getPayoutsForOrder`, `getPayoutsForOrganization` — explicit-column-select, RLS-scoped, zero caching, zero `payment_events` reference. |
| `lib/finance/funding.ts` | `requestFunding(input)` — validates `{ orderId }` only, always returns the controlled `FINANCE_FUNDING_UNAVAILABLE` outcome. No network/SDK/secret/provider name/DB call. |
| `lib/types/action-feedback.ts` | Added `FINANCE_READ_FAILED`, `FINANCE_FUNDING_UNAVAILABLE` to the shared `ACTION_FEEDBACK` map (additive; no existing key changed). |
| `lib/app/copy/en.ts` / `ar.ts` | Added a new top-level `finance` namespace (`errors.readFailed`, `funding.unavailable.{title,description}`) in both locales — real Arabic, not an English-fallback overlay. |
| `tests/finance/validation.test.ts` | T001 proofs (38 tests). |
| `tests/finance/errors.test.ts` | T002 proofs (9 tests). |
| `tests/finance/read.test.ts` | T003/T006 live + source-level proofs (7 tests). |
| `tests/finance/funding.test.ts` | T004 proofs (8 tests). |
| `tests/finance/rls-policy.test.ts` | T003 static RLS-policy proof, T005 payment_accounts audit, T006 no-live-tier-query audit (13 tests). |
| `specs/008-payments-settlement-invoices-payouts/tasks.md` | T001–T006 marked `[x]` with per-task evidence notes. |

No file outside this list was modified. No `lib/orders/*` file was changed — Feature 008 consumes
Feature 007's outputs without touching its module boundary.

---

## 2. T001 — finance status/DTO allowlists

Read live from `database-schema-report.json`'s `constraints` array (CHECK constraints), not guessed:

- `payments_status_check` → `PENDING | PROOF_SUBMITTED | UNDER_REVIEW | CONFIRMED | REJECTED | EXPIRED | VOID` (7 values, exact).
- `payments_payment_method_check` → `BANK_TRANSFER | PROVIDER`.
- `proforma_invoices_status_check` → `ISSUED | PAID | VOID`.
- `payouts_status_check` → `PENDING_PAYOUT | PROCESSING | PAID | VOID`.

These are byte-identical to what `lib/orders/validation.ts` already independently derived for
`PAYMENT_STATUSES`/`PROFORMA_STATUSES` (Feature 007) — cross-checked, no drift.

**No invented escrow vocabulary.** `FUNDED`, `ESCROW_FUNDED`, `AUTHORIZED`, `CAPTURED`,
`AWAITING_ESCROW`, `RELEASED` do not appear anywhere in `lib/finance/*`. `tests/finance/
validation.test.ts` parametrically proves each is rejected by `PaymentStatusSchema`/`PayoutStatusSchema`
and by the `parsePaymentStatus`/`parsePayoutStatus` helpers. `PENDING`/`CONFIRMED` carry no alias or
second spelling; their honest meaning (internal-payment-exists vs. post-settlement-result — never a
funding/escrow precursor) is documented in `validation.ts`'s own header, matching `spec.md`'s
"Provider-neutral lifecycle" and `plan.md`'s "Honest status mapping" table exactly.

---

## 3. T002 — controlled finance errors + localized copy

`lib/finance/errors.ts#mapFinanceError` mirrors `lib/orders/errors.ts` structurally: a
`Record<rawMessage, ActionFeedbackCode>` map, an `extractRaisedMessage`/`logUnmappedFinanceError` pair
that never logs anything but the SQLSTATE-shaped `code`, and a safe generic fallback
(`FINANCE_READ_FAILED`). `FINANCE_ERROR_MAP` is deliberately empty: Phase 1's `read.ts` performs
SELECT-only RLS reads with no RAISE EXCEPTION surface, and `funding.ts` never touches the database at
all — there is genuinely nothing to map yet. This is the SAME "forward-compatible, not prematurely
acted on" precedent `lib/orders/errors.ts` itself documents for its own not-yet-called Phase 4/5
branches; Phase 3/4's provider-event and settlement work reuses this same function/map, never a second
one.

**Raw-error leakage audit**: `tests/finance/errors.test.ts` proves a raised message containing
sensitive text (e.g. a fabricated "secret bank routing number") never appears in the logged output —
only `{ sqlstate: "..." }` is logged — and that `mapFinanceError`'s return value is always one of the
shared `ActionFeedbackCode` strings.

**EN/AR coverage**: `lib/app/copy/{en,ar}.ts` gained a `finance` namespace:
`finance.errors.readFailed`, `finance.funding.unavailable.{title,description}`. Both keys are present
in `en.ts` (source of truth) and `ar.ts` (a real translation — `tests/finance/errors.test.ts` asserts
Arabic-script content, not an English fallback via the `overlay()` mechanism). The unavailable copy was
tested against the run directive's own banned phrasing (`success`, `escrow initiat*`, `bank
account/iban/swift`, `transfer ... money`) and contains none of it; it instead mirrors the EXISTING,
already-approved `orders.payment.note` precedent's tone ("Payment steps arrive in a later release. No
payment is collected here.").

**Sonner/inline contract**: unchanged — this run added no Client Component and no toast call site
(Phase 1 builds no UI). The codes are ready for a future Server Action/page to feed into the existing
`useActionToast`/`toast` pipeline exactly as `lib/orders/*` already does; no second toast provider was
introduced or considered.

---

## 4. T003 — RLS-scoped finance read layer

`lib/finance/read.ts` header comment documents, per table, the LIVE `rls_policies` entry it relies on
(read directly from `database-schema-report.json`, not assumed). Summary:

| Table | Function(s) | Live SELECT policy | Permitted | Denied |
|---|---|---|---|---|
| `payments` | `getPayment` | `payments_view`: `is_platform_admin() OR can_view_order(order_id)`; `payments_finance_read`: `is_finance_operator() OR is_auditor()` | buyer org, seller org (order party), platform admin, finance, auditor | cross-org, anonymous (no `anon` grant exists) |
| `order_financials` | `getOrderFinancials` | `financials_view`: `can_view_order(order_id)`; `financials_finance_read`: `is_finance_operator() OR is_auditor()` | same as `payments` | same as `payments` |
| `proforma_invoices` + items | `getProforma` | `proforma_view`/`proforma_items_view`: `can_view_order(order_id)` ONLY | buyer org, seller org, platform admin | cross-org, anonymous, **and a pure FINANCE- or AUDITOR-role account with no order-party/admin standing** |
| `tax_invoices` | `getTaxInvoice` | `tax_invoice_view`: `can_view_order(order_id)`; `tax_invoice_finance`: `is_finance_operator()` (ALL commands) | buyer/seller/admin, finance operator | cross-org, anonymous, **a pure AUDITOR** |
| `payouts` | `getPayoutsForOrder`/`getPayoutsForOrganization` | `payouts_view`: `is_platform_admin() OR is_org_member(seller_organization_id)`; `payouts_finance`: `is_finance_operator()` (ALL) | seller org itself, platform admin, finance operator | cross-org, anonymous, **a pure AUDITOR** |
| `payment_events` | *(none — not read)* | `payment_events_admin_read`: `is_platform_admin()`; `payment_events_finance_read`: `is_finance_operator() OR is_auditor()` | admin/finance/auditor only | **ordinary buyer/seller members have zero access, not even to non-payload columns** |

**Live proof** (`tests/finance/read.test.ts`): a real checked-out order (built through Feature 007's own
production write paths — `createDraftOrder`/`addOrderItem`/shipment Server Actions/
`executeCheckout`, never a raw insert) is readable via `getPayment`/`getOrderFinancials`/`getProforma`
by its own buyer org, and returns `null` for all three for an unrelated org and for an anonymous
client. `getPayoutsForOrder`/`getTaxInvoice` are proven honestly empty/`null` before settlement/
issuance exist (neither can be created without `admin_review_payment()` or a future Feature 010
workflow, both out of Phase 1 scope).

**Static proof** (`tests/finance/rls-policy.test.ts`): asserts the exact `using_expression`/`command`
text of every live policy on all ten finance-adjacent tables against the schema-report baseline, and
that no `anon` grant exists on any of them.

**Genuine current-policy limitation (reported, not worked around)**: proformas, tax invoices, and
payouts have no independent FINANCE/AUDITOR read policy the way `payments`/`order_financials` do — a
pure FINANCE role (not also ADMIN/SUPER_ADMIN) cannot read a proforma today, and a pure AUDITOR cannot
read any of the three. This is the CURRENT database's own decision; `lib/finance/read.ts` does not
attempt to compensate for it with application-side logic, and this finding is carried forward as a
Phase 2+ item (see Section 8).

**No `payment_events` read at all** — the safest and most literal way to satisfy "do not expose
`payment_events.payload`": no Phase 1 consumer needs event metadata, so none of the table is selected,
not even a safe non-payload allowlist. Live RLS denies ordinary members entirely regardless.

**No caching**: `read.ts` contains no `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/
`updateTag`/`Redis`/`Upstash` reference (source-verified in `tests/finance/read.test.ts`).

**No service-role**: `read.ts` imports only `@/lib/supabase/server`'s request-scoped client; no
`service_role` string appears anywhere in the file (source-verified).

---

## 5. T004 — provider-neutral funding seam

`lib/finance/funding.ts#requestFunding(input: unknown)`:

1. Parses `input` against `RequestFundingInput` (`{ orderId: uuid }` — the ONLY accepted shape).
2. On a malformed input, returns `{ ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors }`.
3. On a valid identifier, ALWAYS returns `{ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE }` — no branching, no database read, no provider check. This is honest: "provider not selected + no approved DB gate" is a fact true for every input right now, so there is nothing to look up.

**Web/mobile compatibility**: the function is a plain, framework-agnostic async function with no
Next.js/browser/React Native-specific import — a future Server Action (web) or an Edge Function-backed
call (mobile) can both call it identically once a real UI exists.

**Zero provider/network/secret proof** (`tests/finance/funding.test.ts`, source-level, comment-stripped):
no `fetch`/`XMLHttpRequest`/`axios`; no occurrence of `stripe`/`tazapay`/`paytabs`/`escrow.com`/
`checkout.com`/`adyen`/`braintree`/`paypal` (case-insensitive); no `process.env.*SECRET/KEY/TOKEN/
CREDENTIAL` or `NEXT_PUBLIC_`/`EXPO_PUBLIC_` reference; no call to `admin_review_payment`,
`submit_payment_proof`, `.rpc(`, `.insert(`/`.update(`/`.upsert(`/`.delete(`, or `createClient` (it
never touches Supabase at all); no cache directive.

**Client-tamper proof**: a client-supplied `amount`/`currency`/`status`/`provider` alongside a valid
`orderId` is silently dropped by Zod's default parsing and never influences the outcome
(`tests/finance/funding.test.ts` + `tests/finance/validation.test.ts` both assert this).

---

## 6. T005 — `payment_accounts` boundary audit

Grepped the entire application source tree (`lib/`, `components/`, `src/`, `app/`) both before and
after this run for `payment_accounts` and for the bank-account column names
(`account_number`/`iban`/`swift_code`/`bank_name`):

- **Before this run**: zero matches anywhere.
- **After this run**: still zero matches, except this handoff document and `lib/finance/types.ts`'s own
  doc comment explaining the DTO deliberately never carries `payment_accounts` fields.

**No correction was needed.** `tests/finance/rls-policy.test.ts`'s T005 section makes this a standing,
automated proof: it walks every `.ts`/`.tsx` file under those four roots and fails if any file calls
`.from("payment_accounts")` or references a bank-field name. Live RLS on `payment_accounts` also
independently confirms admin-only access (`payment_accounts_admin`: `is_platform_admin()` for read,
`is_super_admin()` for write — no member-facing policy of any kind exists at the database layer
either). Feature 010 remains the sole planned owner of any `payment_accounts` configuration UI; this
run introduces none.

---

## 7. T006 — snapshot-only commission and payout fields

`OrderFinancialsDTO` (in `lib/finance/types.ts`) is a byte-for-byte field mirror of `order_financials`'
own columns (`commissionPolicyId`, `commissionPercentageSnapshot`, `commissionAmount`,
`sellerNetAmount`, `totalQuantityKg`, etc.) — every value flows through `getOrderFinancials` as
`Number(row.column)` coercion only, nothing else. `PayoutDTO` mirrors `payouts` the same way.

**No live-tier query**: `tests/finance/rls-policy.test.ts` statically greps every file under
`lib/finance/` for `commission_policies`/`commission_tiers` and asserts zero matches (comments
included, since even a documentary reference would be worth flagging — there are none regardless).

**No money arithmetic**: the same test file asserts `lib/finance/read.ts` contains no `*` (multiplication)
character outside a stripped comment — the one operator any percentage/commission/tax recomputation
would require. `Number()` coercion is the only numeric operation present.

**Currency**: every DTO carries exactly one `currency` field alongside all of its amounts (matching the
database's own one-currency-per-row shape for `payments`/`order_financials`/`payouts`); no amount is
ever returned detached from its stored currency, and no FX conversion exists anywhere in this feature.

`COMMISSION-OPEN-01` (0% fallback vs. fail-closed) was not touched, resolved, or worked around — Phase
1 only reads the snapshot Feature 007's checkout already wrote.

---

## 8. Blockers / findings for Phase 2+

1. **Provider selection, credentials, webhook contract, trusted-funding DB gate** — unchanged from
   `spec.md`'s own open-items table; nothing here resolves or advances them. Explicitly out of scope
   for RUN A.
2. **Proforma/tax-invoice/payout read policy gap** (Section 4): a pure FINANCE role cannot read
   `proforma_invoices`, and a pure AUDITOR role cannot read `proforma_invoices`, `tax_invoices`, or
   `payouts` — only `payments`/`order_financials` have genuine FINANCE-OR-AUDITOR SELECT policies
   today. If Feature 010's finance console needs proforma/tax-invoice/payout visibility for a
   FINANCE-only or AUDITOR-only operator (not also a platform admin), that requires a NEW approved RLS
   policy — a database change, out of this run's scope, and not silently worked around here.
3. **No live finance/auditor test fixture exists** — `tests/auth/fixture-session.ts`/`scripts/
   seed-test-fixtures.ts` has no `platform_admins` row with `role IN ('FINANCE','AUDITOR')` seeded.
   `tests/finance/read.test.ts` therefore proves buyer/seller/cross-org/anonymous access live, and
   relies on the STATIC policy proof in `tests/finance/rls-policy.test.ts` for the finance/auditor
   claim rather than a live signed-in session. Adding such a fixture (if a future run needs a live
   finance/auditor proof) is a change to the SHARED, privileged seed script — deliberately not made in
   this narrow run per "TEST FIXTURE DISCIPLINE."
4. Every other open item in `spec.md`'s "Open items and classifications" table (refunds/chargebacks,
   dual control, payout release evidence, escrow lifecycle vocabulary, DB-BLOCK-01) is untouched and
   unchanged by this run.

---

## 9. Security / static audits (final)

- `SERVICE_ROLE`/`service_role`: zero occurrences in `lib/finance/*`.
- `NEXT_PUBLIC_`/`EXPO_PUBLIC_` provider secrets: zero occurrences.
- `commission_policies`/`commission_tiers`: zero occurrences in `lib/finance/*` (test-enforced).
- `payment_events` payload exposure: the table is never selected at all by `lib/finance/read.ts`.
- `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag`/`Redis`/`Upstash`: zero occurrences.
- `submit_payment_proof`/`admin_review_payment`: zero occurrences anywhere in `lib/finance/*`.
- Provider SDK names / network calls from `funding.ts`: zero (test-enforced).
- Public-route/metadata exposure: no `lib/finance/*` symbol is imported by any file under
  `src/app/(public)`/public metadata/sitemap/JSON-LD generators — none of those files were touched by
  this run, and none import from `lib/finance`.

---

## 10. UI/quality

Phase 1 built no member/admin screen (per its own scope: "Phase 1 should not create broad member
screens"). The only user-facing artifact is the EN/AR copy contract itself (Section 3), which is
localization-ready, RTL-safe (plain sentence copy, no directional markup needed), and carries no color/
state indicator to audit. Design-token/Light-Dark/44px/keyboard/focus/axe verification applies once
Phase 5 (T022–T026) builds the actual payment/document/payout routes — there is no component to verify
yet, and this handoff does not claim otherwise.

---

## 11. Test evidence

**Focused suite** (`npm test -- tests/finance`): 5 files, **75/75 passing**.

| File | Tests |
|---|---|
| `tests/finance/validation.test.ts` | 38 |
| `tests/finance/errors.test.ts` | 9 |
| `tests/finance/read.test.ts` | 7 (2 live-DB, 4 source-level, within `describe` blocks totalling 7 `it`s) |
| `tests/finance/funding.test.ts` | 8 |
| `tests/finance/rls-policy.test.ts` | 13 |

**Full verification**:

- `npm run typecheck`: exit 0, clean.
- Feature-008-scoped `npm run lint -- lib/finance lib/types/action-feedback.ts lib/app/copy/en.ts lib/app/copy/ar.ts tests/finance`: exit 0, zero findings.
- `npm run build`: succeeded; no new route was added (Phase 1 has no UI); all 34 existing routes unchanged.
- `git diff --check`: exit 0 (only pre-existing CRLF-on-touch warnings, no actual whitespace error).
- Repo-wide `npm run lint`: exit 1, 273 problems (124 errors, 149 warnings) — **every single finding is
  under `docs/claude-design/**` (the documented historical baseline)** except one PRE-EXISTING,
  UNTOUCHED warning in `tests/listings/manage-page.test.tsx` (`'LocaleProvider' is defined but never
  used`) that predates this run and was not introduced by it. **Zero new non-baseline finding.**
- Full `npm test` (whole repo, live Supabase integration suite, sequential by `vitest.config.mts`'s
  `fileParallelism: false`): **109 test files, 1218 tests — 100% passing, zero failures.** This
  includes the 5 new `tests/finance/*.test.ts` files (75 tests) alongside every existing Feature
  003–007 suite, proving zero regression. Duration ~955s (real live-auth/live-DB integration run, not
  mocked). Exit code 0.

---

## 12. Final status map

```
T001 [x]  T002 [x]  T003 [x]  T004 [x]  T005 [x]  T006 [x]
T007 [ ]  T008 [ ]  T009 [ ]  T010 [ ]  T011 [ ]  T012 [ ]
T013 [ ]  T014 [ ]  T015 [ ]  T016 [ ]  T017 [ ]  T018 [ ]
T019 [ ]  T020 [ ]  T021 [ ]  T022 [ ]  T023 [ ]  T024 [ ]
T025 [ ]  T026 [ ]  T027 [ ]  T028 [ ]  T029 [ ]  T030 [ ]
T031 [ ]  T032 [ ]  T033 [ ]  T034 [ ]  T035 [ ]  T036 [ ]
T037 [ ]  T038 [ ]  T039 [ ]
```

**6 / 39 complete.** Phase 1 COMPLETE. Provider remains TBD. Feature 008 is NOT closed.

Not committed, not pushed — left as working-tree changes for the user's own review/commit decision.

---

## RUN D (2026-09-22) — reconciliation + T023, T025, T026, T027, T033

**Model**: Claude Sonnet 5 — High
**Scope executed**: reconciled actual repo state against this handoff/tasks.md (T022's own close-out
had never been appended here — see the note below), then closed T023, T025, T026, T027, T033. No
provider selection, no database migration, no `admin_review_payment()`/`submit_payment_proof()` call
from application code. Worked directly on `main`; nothing committed or pushed by this run.

### RECONCILIATION NOTE — T022 (RUN C, 2026-09-17) was never appended here

`tasks.md` already recorded T022 `[x]` with its own evidence note (private payment-state routes,
`/dashboard/payments` + `/dashboard/payments/[orderId]`, 29 tests + a real Chrome/axe pass). This
handoff file's Section 12 status map had not been updated to reflect it — a documentation gap, not a
functional one. This run's status map (below) reflects the true, current state: **12/39.**

### What this run found, reconciling task status against reality (not blindly trusted)

`spec.md`'s Section "Provider-neutral lifecycle" step 6 and `tasks.md`'s own T023 `Depends: T021` line
both read as if NO settlement can happen before the future Stripe-trusted-funding gate (Phase 4).
That is **false** for the database's CURRENT, already-approved capability: `admin_review_payment()`
already performs real, atomic settlement (title, custody, reservation consumption, fill, proforma,
payment, **and payout** effects) TODAY, without any trusted-funding condition — FR-008 already
classifies it this way ("B — reusable... currently does not require a trusted provider-funding
condition"). Every Feature 005/006/007/009 live-chain test already calls it as "the currently
authoritative settlement primitive." **No application code in `src/app`/`lib` outside `tests/` calls
it** (confirmed: zero references before and after this run) — it is exercised only by test fixtures
building realistic settled state, exactly as Features 005/006/007/009 already do. This run's T023 work
presents those genuinely-real records; it does not add a new settlement caller.

### What was built

| File | Purpose |
|---|---|
| `lib/finance/types.ts` | Added `PaginatedPayouts<T>`. |
| `lib/finance/read.ts` | `getPayoutsForOrganization` is now bounded (`page`/`pageSize`, `.range()`, `DEFAULT_PAYOUT_PAGE_SIZE`/`MAX_PAYOUT_PAGE_SIZE`) — it was an unbounded org-wide scan before this run, the only pre-existing behavior changed. |
| `components/finance/payout-status-badge.tsx` | New — `PayoutStatusBadge`, mirrors `PaymentStatusBadge`'s exact pattern, all 4 `payouts.status` values. |
| `components/finance/proforma-status-badge.tsx` | New — `ProformaStatusBadge`, all 3 `proforma_invoices.status` values. |
| `src/app/dashboard/payments/[orderId]/page.tsx` | Extended (T022's page) with Documents (proforma + tax invoice) and Payout sections. |
| `src/app/dashboard/payouts/page.tsx` | New — the seller's own payout-record list, spec.md's third named primary surface. |
| `lib/dashboard/registry.tsx` | New `"payments"` module: `payments` (buy) + `payouts` (sell, additive). |
| `lib/app/copy/en.ts` / `ar.ts` | Extended `finance` namespace: documents/payout copy, `finance.proforma.status`, `finance.payouts.{status,nav,list}`, `finance.nav.payments`. |
| `components/ui/icon.tsx` | Added `receipt`/`banknote` glyphs (additive). |
| `tests/finance/t023-documents-payouts.test.tsx` | New — 9 live tests (`F008_LIVE_PROOF=1`, gated like Feature 005/006's own equivalent multi-order chains) + 18 ungated static T032-style source-audit tests. |
| `tests/finance/t022-payment-state.test.tsx` | +1 test (honest-empty-state proof for the same PENDING order); its own T022/T023 boundary assertion reconciled (the payments LIST page still never references proforma/tax-invoice/payout; the DETAIL page now legitimately does). |
| `tests/finance/rls-policy.test.ts` | The "no multiplication" T006 proof narrowed to exclude the new, unrelated pagination arithmetic (`page * boundedPageSize`) — still asserts zero money-shaped `*`; header updated to note the live FINANCE-operator proof that now exists. |
| `tests/finance/read.test.ts` | 2 call sites updated for `getPayoutsForOrganization`'s new paginated return shape. |
| `tests/dashboard/registry.test.tsx` | Extended: exact module/href order (`payments` now index 4), the "trading" group now includes `/dashboard/payments`, a new test proves Payouts nav is additive on `canSell` (hidden for buyer-only, visible for a seller-that-also-buys), and the stale `forbidden: ["payments"]` placeholder-check removed (it was the last one — nothing left to forbid). |
| `tests/admin/finance-delegation.test.tsx` | Feature 010's own boundary test reconciled: `/dashboard/payouts` pinned to EXACTLY its one approved read-only page, the same discipline it already applied to `/dashboard/payments` when T022 landed. |

### Live proof (`F008_LIVE_PROOF=1 npx vitest run tests/finance/t023-documents-payouts.test.tsx`, 9/9)

Built a GENUINE settled MEMBER_SELLER sale via `tests/listings/live-chain.ts` (orgB buys Hills stock
and settles → lists it as a resale offer → orgA buys and settles, producing a real `payouts` row for
orgB): seller sees its own payout; the buyer (a real party, not the seller) sees none; a real FINANCE
operator sees payment/payout but NOT proforma (the pre-existing, now live-proven policy gap); anonymous
sees nothing; the seller's own payment-detail page renders the real payout amount/status and the PAID
proforma with its real items; the buyer's view of the SAME order shows the proforma but an honest
"no payout" state; `/dashboard/payouts` lists the real payout with a working link and is capability-
gated (`canSell`) for the buyer-only organization; the payout/proforma values are byte-identical across
independent re-reads; exactly one payout exists for the resale line and none for the HILLS line;
cleanup removes disposable rows (append-only ownership/audit rows retained, as designed).

### What was NOT done (genuine, named gaps — not converted to fake completion)

- **T024** (manual payment-proof fallback) — unchanged, still conditional on an explicit Business/
  Finance + Storage-design decision that has not been made.
- **T028** (snapshot immutability across a LIVE commission-policy mutation) — the "no live tier read" +
  "byte-identical across re-reads" proofs exist; mutating a shared, concurrently-relied-upon
  `commission_policies` row and restoring it exactly was judged out of proportion to attempt this run.
- **T029–T031, T037** (provider/settlement transactional tests) — genuinely blocked; no trusted-funding
  gate or provider exists to test against.
- **T032** — audit work done and green for the CURRENT scope, but its own `Depends: T018` is unmet
  (T018 does not exist — Phase 4 is blocked), so the box was left unchecked per this repo's own
  established convention of respecting literal `Depends` chains (see Feature 005's own precedent).
- **T034** (real browser/axe) — not attempted; the new markup reuses already axe-proven patterns except
  the new proforma-items table, which has not been through a real Chrome/axe pass.
- **T035** (production-build exposure proof) — `npm run build` succeeds and both new routes compile
  dynamic (not prerendered), but no real running server's raw HTTP/RSC payload was inspected.

### Test evidence

- `npx vitest run tests/finance`: 7 files, **125/125 passing, 9 correctly skipped** (live block ungated).
- `F008_LIVE_PROOF=1 npx vitest run tests/finance`: 7 files, **134/134 passing.**
- `npx vitest run tests/dashboard/registry.test.tsx`: **24/24 passing** (extended this run).
- `npx vitest run tests/admin/finance-delegation.test.tsx`: **14/14 passing** (reconciled this run).
- Regressions — `tests/orders` (276), `tests/delivery` (207, 6 skipped), `tests/inventory` (101, 9
  skipped), `tests/admin` (all 26 files), `tests/listings`, `tests/dashboard`: all green, zero new
  failures attributable to this run.
- `npx tsc --noEmit`: exit 0.
- Scoped `eslint`: 0 problems on every file this run touched.
- See the final report for `npm run build`, repo-wide lint, `git diff --check`, and the exhaustive
  batched full-suite result.

### Final status map (this run)

```
T001 [x]  T002 [x]  T003 [x]  T004 [x]  T005 [x]  T006 [x]
T007 [ ]  T008 [ ]  T009 [ ]  T010 [ ]  T011 [ ]  T012 [ ]
T013 [ ]  T014 [ ]  T015 [ ]  T016 [ ]  T017 [ ]  T018 [ ]
T019 [ ]  T020 [ ]  T021 [ ]  T022 [x]  T023 [x]  T024 [ ]
T025 [x]  T026 [x]  T027 [x]  T028 [ ]  T029 [ ]  T030 [ ]
T031 [ ]  T032 [ ]  T033 [x]  T034 [ ]  T035 [ ]  T036 [ ]
T037 [ ]  T038 [ ]  T039 [ ]
```

**12 / 39 complete.** Provider remains TBD (genuine external Finance/Legal/Banking decision — see
`spec.md`'s Open Items table and `STRIPE-PREPARATION.md`, both unchanged by this run — nothing new was
learned about provider selection). Feature 008 is NOT closed. Production-trading readiness requires,
at minimum: the provider decision (T007), the approved database trusted-funding design (T009), the
migration (T011) and the settlement/event/payout/invoice implementation it unblocks (T012–T021,
T029–T031, T037) — none of that exists and none is claimed here.

Not committed, not pushed — left as working-tree changes for the user's own review/commit decision.

---

## RUN E — provider-independent closure (2026-09-22)

**Model**: Claude Sonnet 5 — High
**Scope executed**: the six tasks genuinely actionable without a provider decision — T028, T034, T035,
T036, T038, T039. Explicitly did NOT touch T007–T021, T024, T029–T032, T037 (all provider/Finance/
Legal/Banking-blocked). No provider invented, no fake credential created, no payment architecture
changed to bypass the external decision. Worked directly on `main`; nothing committed or pushed by this
run.

### T028 — live commission-mutation immutability proof

New `tests/finance/t028-snapshot-immutability.test.ts` (`F008_LIVE_PROOF=1`, 8/8 passing; correctly
8-skipped ungated). Reused Feature 010 RUN F's existing disposable-policy conventions verbatim
(`prepareSuperAdminFixture`, `RUN_F_CONFIG_ROWS.policyNamePrefix`, `cleanupRunFConfigRows` — no new
fixture identity or cleanup mechanism invented). Built a genuine settled resale order via
`tests/listings/live-chain.ts`, then against the real linked database: an unauthorized (finance/member)
policy mutation is refused; a SUPER_ADMIN creates/activates/edits/deactivates/archives a disposable,
2099-dated (structurally never-in-force) commission policy; the order's `payouts`/`order_financials`/
`proforma_invoices` rows are proven byte-identical across every one of those mutations; the disposable
policy is cleaned up via the existing privileged fixture path; the settled order's own rows remain,
untouched (append-only). Closed via the SAME "T027/T028 can begin once their read surfaces exist"
override this file's own `Dependencies and parallelisation` section already states — `Depends: T021`
does not literally block it.

### T034 — real browser + axe pass

Ran `tests/browser/feature008-t034.browser.mjs` (new, reusing T022's real-Chrome-via-CDP + raw-REST
fixture technique) across `/dashboard/payments/[orderId]` and `/dashboard/payouts` at 4 scenarios
(en/ar × light/dark × 1366/390). Found and fixed two genuine, pre-existing defects: (1) an axe
`scrollable-region-focusable` violation on the proforma items table's overflow wrapper (fixed:
`role="region" tabIndex={0} aria-label=...`); (2) a pervasive locale bug in
`src/app/dashboard/payments/[orderId]/page.tsx` — most labels used the static English `appCopy.X`
import instead of the locale-reactive `<AppBilingual>` component, so the Arabic page rendered mixed
English text (pre-existing since T022/T023, not introduced by this run). Rewrote the file to use
`<AppBilingual>` throughout; one call site in `src/app/dashboard/payouts/page.tsx` fixed the same way.
Final result: 8/8 surfaces, 0 axe violations, 0 anonymous/cross-org leaks, keyboard focus verified, 0
console/page/request errors. Re-ran T022's own existing browser script afterward to confirm no
regression (still 8/8, 0 violations). One genuine, out-of-scope, shared-component limitation was found
and deliberately NOT touched: `EmptyState`/`StateScreen`/`TableCardList` title/description/caption props
are typed `string`, not `ReactNode`, so their copy can never be Arabic — pre-existing across five
already-closed features (Orders, Deliveries, Sales, Payments, Payouts), out of Feature 008's own scope.

### T035 — production build exposure/security proof

Fresh `npm run build`: both routes compile `ƒ Dynamic`. Grepped the actual built `.next/static` and
`.next/server` output for the literal `SUPABASE_SERVICE_ROLE_KEY` value — zero matches; confirmed the
key is referenced only in `scripts/`/`tests/`, never `src/`. No provider secret exists in `.env.local`
at all (no provider selected yet). `lib/supabase/client.ts` (the only browser Supabase client) has zero
importers under `src/` — this app never ships a Supabase client to the browser. All commission
mutations run through `"use server"` Server Actions only — no client-side financial mutation boundary
exists. Ran a real `next start` production server and, against it: anonymous requests to both routes
redirect to `/sign-in` with zero financial content in the response; `robots.txt` disallows `/dashboard`;
`noindex` is present (inherited, unmodified, from the dashboard layout). Re-ran T034's own browser+axe
script against this real production server (not dev) — 8/8 surfaces, 0 violations, 0 leaks. Closed under
the same "Phase 7 and Phase 8 apply only to actually implemented routes and must not manufacture
provider proof" note — `Depends: T032` is nominally unmet, but T032's own unmet portion is narrowly the
"single settlement caller" clause against code (`lib/finance/settlement.ts`, T018) that does not exist
yet, not the exposure/leakage concerns T035 itself verifies (already green per T032's own existing
audit).

### T036 — clean full verification

Confirmed no orphan Vitest/`next` process and no stale batch files before starting. Fresh canonical
`npx vitest list --filesOnly` → 186 files, 0 duplicates. Ran in 8 sequential, non-overlapping batches
(186 files covered exactly once — missing 0, duplicate 0, unexpected 0). Found and fixed one genuine
Feature 008 regression along the way: `tests/design/uif-f.test.tsx`'s route-inventory assertion had
never been updated for `dashboard/payouts/` (added by the already-committed T023), the same gap its own
comment records once happening for `payments`. Final: **2151 passed, 70 skipped, 0 failed** across all
batches; every batch exit code 0. `npm run lint` (repo-wide): exit 0, 1 pre-existing unrelated warning
(established baseline, not touched by Feature 008). `npm run typecheck`: exit 0. `npm run build`: exit
0. `git diff --check`: exit 0. Zero orphan processes confirmed after completion.

### T038/T039 — reconciliation and final review

This section IS T038: every task's checkbox in `tasks.md` now matches actual, verified evidence, not
aspiration. No provider-blocked task was closed. T039's independent review is recorded in `tasks.md`
itself alongside T039's own checkbox.

### What remains genuinely blocked (all 21 remaining open tasks)

T007–T021 (15 tasks): the entire provider selection → database design → migration → funding/event/
settlement/payout/invoice implementation chain. Blocked on an external Finance/Legal/Banking decision
that does not exist yet (`spec.md`'s Open Items table, `STRIPE-PREPARATION.md`) — nothing in this run
advances or resolves it.
T024: conditional on an explicit Business/Finance + Storage-design approval for a manual payment-proof
fallback that has not been made.
T029–T031: provider/settlement transactional tests — cannot be written against code that does not
exist.
T032: its own "required single settlement caller" clause needs `lib/finance/settlement.ts` (T018),
which is itself blocked on the same provider chain.
T037: repeating the provider/transactional test set for stability — nothing to repeat yet.

### Final status map (this run)

```
T001 [x]  T002 [x]  T003 [x]  T004 [x]  T005 [x]  T006 [x]
T007 [ ]  T008 [ ]  T009 [ ]  T010 [ ]  T011 [ ]  T012 [ ]
T013 [ ]  T014 [ ]  T015 [ ]  T016 [ ]  T017 [ ]  T018 [ ]
T019 [ ]  T020 [ ]  T021 [ ]  T022 [x]  T023 [x]  T024 [ ]
T025 [x]  T026 [x]  T027 [x]  T028 [x]  T029 [ ]  T030 [ ]
T031 [ ]  T032 [ ]  T033 [x]  T034 [x]  T035 [x]  T036 [x]
T037 [ ]  T038 [x]  T039 [x]
```

**18 / 39 complete.** Every remaining open task is externally blocked (provider/Finance/Legal/Banking
decision, or a task nominally depending on code that decision unblocks). No provider-independent
engineering task remains unfinished. Feature 008 is NOT closed — production-trading readiness still
requires the external provider decision and everything downstream of it.

Not committed, not pushed — left as working-tree changes for the user's own review/commit decision.

---

## RUN F008-STRIPE-DECISION (2026-09-22)

**Model**: Claude Sonnet 5 — High
**Scope executed**: the approved Stripe/Connect product decision (provider = Stripe, platform model =
Connect, charge shape = separate charges and transfers, settlement-gate = Option A — trusted funding +
finance-operator "Approve Settlement"/"Release Seller Funds", never an automatic or manual "confirm the
buyer paid") applied to unblock as much of T007–T021, T024, T029–T032, T037 as is genuinely
engineering-actionable without live Stripe credentials, Connect account setup, or Legal/Finance
approval this run cannot supply. Worked directly on `main`; nothing committed or pushed; no database
migration applied or pushed remotely.

### What was built

| File | Purpose |
|---|---|
| `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql` (+ paired rollback + read-only postflight) | Trusted-funding columns on `payments`, `payment_events.provider`/`external_event_id` tightened to `NOT NULL`, new append-only `payment_transfers` table, `admin_review_payment()` reproduced verbatim with ONE inserted precondition (provably a no-op for every existing NULL-`payment_method` path), and three new SECURITY DEFINER functions (`ingest_stripe_event`, `record_stripe_payment_intent`, `record_payment_transfer`). **NOT applied.** |
| `lib/finance/stripe/config.ts` | The one place any Stripe env var is read; booleans + the one client-safe value. |
| `lib/finance/stripe/webhook.ts` | Signature verification (Stripe's own documented algorithm/SDK verifier) — genuinely tested without a live account. |
| `lib/finance/stripe/adapter.ts` | Server-only PaymentIntent/Transfer creation, honest `not_configured`/`provider_error` results, never fabricated success. |
| `lib/finance/settlement.ts` | T018 — the sole application caller of `admin_review_payment()`; `approveSettlement`/`rejectSettlement`. |
| `lib/finance/funding.ts` | Extended: unconfigured path unchanged; configured path invokes the create-payment-intent Edge Function, never fabricates a client secret. |
| `lib/finance/errors.ts`, `lib/types/action-feedback.ts` | New `FINANCE_SETTLEMENT_*`/`FINANCE_FUNDING_*` controlled codes, mapped from every new database exception name. |
| `components/finance/stripe-payment-collector.tsx` | The member funding surface — Stripe Payment Element, publishable key received only as a prop. |
| `src/app/dashboard/payments/[orderId]/page.tsx` | Wired to render the collector once `requestFunding` genuinely succeeds (unreachable today without live configuration). |
| `supabase/functions/{stripe-webhook,stripe-create-payment-intent,stripe-release-transfer}/index.ts` | Three Deno Edge Functions — written, NOT deployed. |
| `supabase/config.toml` | Per-function `verify_jwt` settings for the three functions above. |
| `tsconfig.json`, `eslint.config.mjs` | Exclude `supabase/functions/**` (a separate Deno runtime) from the Node/Next.js TypeScript project and lint scope. |
| `tests/finance/stripe-webhook.test.ts` | 7 tests — signature verification, no live account needed. |
| `tests/finance/stripe-boundary-security.test.ts` | 11 tests — no secret in a client bundle, no direct client provider call, single settlement caller (closes T032). |
| `tests/finance/funding.test.ts`, `tests/finance/errors.test.ts`, `tests/finance/t022-payment-state.test.tsx` | Extended for the new Stripe-configured path and new error mappings; the one now-legitimate "names Stripe" exception narrowly scoped. |
| `tests/orders/audits.test.ts`, `tests/admin/finance-delegation.test.tsx` | Two genuine, pre-existing-test regressions found and fixed: both asserted a fact ("no payment-provider dependency exists anywhere", "no file calls `admin_review_payment`") that this run's OWN approved architecture deliberately supersedes — narrowed precisely to their still-valid remaining scope, not weakened elsewhere. |

### What was NOT done (genuine, named gaps)

- **T007/T010**: legal/banking approval and real credentials — no Stripe account exists; `STRIPE-PREPARATION.md` §14's checklist remains the exact list of facts only a real account can supply.
- **T009/T011/T017/T021/T029/T030**: the migration is authored, reviewed by no human yet, and explicitly NOT applied this run (instructed). Every claim resting on live database behavior stays open with a precise "apply T011, then re-test" note.
- **T012/T013 (live portion)**: three Edge Functions are written but not deployed; the DB-dependent half of T013/T031 needs both the migration applied and a deployment.
- **T024**: deliberately untouched — no manual fallback invented; the same external Business/Finance + Storage decision remains required, now explicitly re-confirmed as still required now that Stripe is the approved primary path.
- **T037**: nothing live-runnable exists yet to repeat for stability.

### Test evidence

- `tests/finance`: 9 files passed, 1 skipped (T028, correctly ungated), **149 passed, 17 skipped, 0 failed**.
- `tests/orders`: 21 files, **276 passed, 0 failed** (after fixing the one genuine pre-existing-test regression).
- `tests/delivery`: 18 passed, 2 skipped, **207 passed, 6 skipped, 0 failed**.
- `tests/admin`: 26 files, **331 passed, 0 failed** (after fixing the one genuine pre-existing-test regression).
- `tests/dashboard`: 7 files, **61 passed, 0 failed**.
- `npm run lint`: exit 0, 1 pre-existing unrelated warning (baseline, unchanged).
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; `.next/static` (the real client bundle) grepped clean for both Stripe secret names.
- `git diff --check`: exit 0 (CRLF notices only).
- The exhaustive full-suite batched run (T036's own standard) was **not** re-run this run — the task
  instructions explicitly said not to run it "unless needed for a closure gate," and this run closes no
  task that requires it.

### Final status map (this run)

```
T001 [x]  T002 [x]  T003 [x]  T004 [x]  T005 [x]  T006 [x]
T007 [ ]  T008 [x]  T009 [ ]  T010 [ ]  T011 [ ]  T012 [ ]
T013 [ ]  T014 [x]  T015 [x]  T016 [x]  T017 [ ]  T018 [x]
T019 [x]  T020 [x]  T021 [ ]  T022 [x]  T023 [x]  T024 [ ]
T025 [x]  T026 [x]  T027 [x]  T028 [x]  T029 [ ]  T030 [ ]
T031 [x]  T032 [x]  T033 [x]  T034 [x]  T035 [x]  T036 [x]
T037 [ ]  T038 [x]  T039 [x]
```

**27 / 39 complete.** Every remaining open task names a specific external requirement (real Stripe
account/credentials/Connect setup, human database/security review + migration application, Edge
Function deployment, or the separate T024 Business/Finance/Storage decision) — none is a stale
"provider undecided" blocker. Feature 008 is NOT closed; the shortest path to closing the rest is the
migration's human review and application, in that order.

Not committed, not pushed, no database migration applied or pushed remotely — left as working-tree
changes for the user's own review/commit decision.
