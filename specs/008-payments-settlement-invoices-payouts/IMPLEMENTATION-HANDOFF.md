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
