# Feature Specification: Production Closure & Stripe Runtime Retirement

**Feature Branch**: `017-stripe-runtime-retirement`
**Created**: 2026-10-03
**Status**: Draft
**Input**: User description: "Retire all active Stripe/provider runtime capability while preserving bank-transfer-only commerce and historical payment records."

## Clarifications

### Session 2026-10-03

- Q: Should `admin_review_payment` remain defined but have execution revoked for all application roles? → A: Keep the function definition; revoke execution for authenticated, service, public, and anonymous roles.
- Q: Should the three Stripe provider functions remain defined for historical compatibility while execution is revoked from every application role, leaving only database ownership unchanged? → A: Keep all three definitions; revoke execution from PUBLIC, anonymous, authenticated, and service roles.
- Q: Should `checkout_order` and `submit_payment_proof` remain unchanged as fenced legacy compatibility endpoints rather than being retired in Feature 017? → A: Keep both fenced and out of scope for execution revocation.
- Q: Should the three undeployed Stripe Edge Function source directories be deleted from the repository rather than retained as archived but deployable code? → A: Delete the three Stripe Edge Function source directories.
- Q: Should Stripe SDK packages and all tests that require them be removed after replacement retirement tests cover their former boundary checks? → A: Remove both packages after replacing their retired-path tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete a Bank-Transfer Payment Journey (Priority: P1)

A buyer completes the supported payment journey—from cart and destination through reservation, proforma, bank transfer, private proof submission, finance confirmation or rejection, and fulfillment handoff—without seeing or being offered card, Stripe, or other provider funding.

**Why this priority**: The supported bank-transfer commerce journey must remain fully usable while obsolete payment capability is removed.

**Independent Test**: Create a bank-transfer order and prove the complete proof-to-finance-review path reaches its documented confirmed and rejected outcomes without any provider payment option.

**Acceptance Scenarios**:

1. **Given** an authorized buyer with a checkout-ready cart, **When** the buyer checks out and follows the payment instructions, **Then** the buyer receives a proforma and can submit a private bank-transfer proof without provider controls or provider wording.
2. **Given** a submitted bank-transfer proof, **When** an authorized finance operator confirms it, **Then** the established paid, invoice, ownership, notification, and fulfillment-handoff outcomes occur exactly once.
3. **Given** a submitted bank-transfer proof, **When** an authorized finance operator rejects it, **Then** the established rejection, reservation-release, and notification outcomes occur without affecting another order.

---

### User Story 2 - Prevent Retired Provider Execution (Priority: P1)

A security reviewer can verify that retired provider payment operations cannot be invoked by public, anonymous, authenticated, or service roles, while supported bank-transfer operations remain available only to their authorized actors.

**Why this priority**: Removing visible payment controls is insufficient if dormant provider execution remains reachable.

**Independent Test**: Attempt every retired provider operation under each relevant role and verify denial; separately verify each supported bank-transfer operation succeeds or fails according to its existing authorization and state rules.

**Acceptance Scenarios**:

1. **Given** any application role, **When** it attempts a retired provider operation, **Then** the attempt is denied before it can alter payment, inventory, fulfillment, or historical records.
2. **Given** an unauthenticated or unauthorized caller, **When** it attempts a protected bank-transfer, finance-review, proof, or payment-history operation, **Then** it receives the established safe denial and no private information or state change.
3. **Given** an authorized caller on the supported flow, **When** it uses an active bank-transfer operation, **Then** the operation retains its established authorization, idempotency, and state-transition behavior.

---

### User Story 3 - Preserve Historical Financial Evidence (Priority: P2)

An authorized historical-data viewer can continue to access payment and accounting history that is permitted today, including any preserved provider-era evidence, without gaining a way to start, settle, or transfer provider payments.

**Why this priority**: Retirement must not destroy financial/audit evidence or conflate read access with operational capability.

**Independent Test**: Use preserved historical-record fixtures to verify intended readers can view allowed history while all retired provider execution attempts are denied.

**Acceptance Scenarios**:

1. **Given** a permitted historical payment record, **When** an authorized viewer opens its payment history, **Then** the permitted record remains visible with the existing privacy boundaries.
2. **Given** a historical provider-related record, **When** an authorized viewer accesses it, **Then** its evidence is preserved and no provider action, transfer, or funding control is offered.

---

### User Story 4 - Present Accurate Payment Information (Priority: P2)

A buyer, seller, or administrator viewing payment information sees bank-transfer-only instructions and accurate payment history, without stale card, Stripe, provider-funding, or future-provider language.

**Why this priority**: Accurate payment communication prevents buyers from attempting unavailable payment methods and avoids misleading operators.

**Independent Test**: Review all buyer and administrator payment surfaces in supported, empty, historical, unauthorized, and error states for accurate bank-transfer-only copy and absence of retired controls.

**Acceptance Scenarios**:

1. **Given** a current payment screen, **When** a user views it, **Then** it communicates only the supported bank-transfer process and appropriate payment status.
2. **Given** a historical record, **When** it is shown, **Then** the record remains understandable without implying that its retired provider method can be used again.

### Edge Cases

- A historical provider record exists after runtime retirement: it remains subject to its existing read/privacy policy, but no user can reactivate, fund, settle, or transfer it through provider capability.
- A caller invokes a retired operation directly rather than through a user interface: the operation is denied with no partial payment, inventory, fulfillment, or audit mutation.
- A stale link, cached view, or browser state points to a removed provider control: the user receives a safe bank-transfer-only or unavailable outcome and no provider request is made.
- A blocked, anonymous, cross-tenant, non-finance, or MFA-ineligible caller attempts a current payment/proof/finance operation: existing authorization and privacy safeguards continue to deny access.
- A retry or concurrent finance decision occurs on a supported bank-transfer payment: the established replay, idempotency, and exactly-once guarantees remain intact.

## Requirements *(mandatory)*

### Functional Requirements

#### Runtime Removal and Payment Experience

- **FR-001**: The system MUST provide bank transfer as the only buyer-facing payment method for all new and current supported commerce flows.
- **FR-002**: The system MUST remove all reachable buyer-facing Stripe, card, provider-funding, provider-settlement, and provider-transfer controls.
- **FR-003**: The system MUST remove obsolete Stripe/provider runtime dependencies, including `stripe` and `@stripe/stripe-js`, and remove runtime configuration reads and environment references including `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- **FR-004**: The system MUST delete the undeployed `stripe-create-payment-intent`, `stripe-webhook`, and `stripe-release-transfer` Edge Function source directories; it MUST preserve historical migration, rollback, and postflight records.
- **FR-005**: Buyer and administrator payment copy MUST describe the bank-transfer-only process, must not advertise unavailable card/provider funding, and must preserve legitimate historical payment visibility.

#### Database Execution Retirement and Historical Preservation

- **FR-006**: A new forward-only hardening change MUST preserve the definitions of `record_stripe_payment_intent`, `record_payment_transfer`, and `ingest_stripe_event` for historical compatibility while retiring their active execution by revoking execution from PUBLIC, anonymous, authenticated, and service roles; the database owner's inherent ownership remains unchanged.
- **FR-007**: The hardening change MUST preserve the `admin_review_payment(uuid,boolean,text)` definition for historical compatibility but retire it as an operational endpoint by revoking execution for PUBLIC, anonymous, authenticated, and service roles; final preflight established that no unresolved legacy/provider business state requires it.
- **FR-008**: Retired operations MUST be denied to PUBLIC, anonymous, authenticated, and service roles; no retired operation may retain an application-reachable execution path.
- **FR-009**: The retirement change and its rollback MUST assert the verified pre-retirement signatures and effective execution grants: `admin_review_payment(uuid,boolean,text)`, `checkout_order(uuid)`, `submit_payment_proof(uuid,uuid,text)`, `record_stripe_payment_intent(uuid,text,text)`, `record_payment_transfer(uuid,text,text,text)`, and `ingest_stripe_event(text,text,text,uuid,jsonb,boolean)`.
- **FR-010**: Rollback MUST restore only the verified pre-retirement execution-grant baseline and MUST not restore a retired runtime integration, deployment secret, or Edge Function deployment.
- **FR-011**: The system MUST preserve historical provider payment rows, provider columns, payment events, payment transfers, invoices, migrations, rollback records, and postflight artifacts; Feature 017 MUST not destructively delete financial history.

#### Active Commerce Compatibility

- **FR-012**: The system MUST preserve the active bank-transfer operations `checkout_bank_transfer_v1`, `issue_proforma`, `confirm_proforma`, `prepare_payment_proof_upload`, `finalize_payment_proof`, and `finance_review_bank_transfer_v1`; `checkout_order` and `submit_payment_proof` remain fenced legacy compatibility endpoints and are out of scope for Feature 017 execution revocation.
- **FR-013**: The system MUST preserve the Feature 009, 013, 014, 015, and 016 guarantees for reservations, inventory, private proof access, finance authorization and MFA, invoices, ownership transfer, storage allocations, fulfillment shipments, destination snapshots, warehouse handoff, notifications, auditing, replay, and idempotency.
- **FR-014**: The system MUST retain Feature 013–016 regression and live-verification tooling as test/operations infrastructure; retirement MUST not move that tooling into product runtime or delete it solely because earlier features are complete.

#### Security and Regression Evidence

- **FR-015**: The retirement work MUST verify that no production runtime import, reachable route, or user interface can initiate Stripe/provider funding, webhook handling, or transfer activity.
- **FR-016**: The retirement work MUST verify denied retired-operation execution for relevant roles and must verify that supported bank-transfer operations retain their established authorization boundaries, including blocked-user, cross-tenant, finance-role, MFA, and payment-proof privacy protections.
- **FR-017**: The retirement work MUST verify security-definer safety, fixed search paths, and absence of unintended PUBLIC or anonymous execution for payment-related operations affected by the change.
- **FR-018**: The retirement work MUST include read-only preflight, forward-change verification, rollback verification, postflight verification, exact execution-grant assertions, and compatibility evidence before it is considered complete.
- **FR-019**: The retirement work MUST verify that no Stripe/provider deployment secret name or deployed Stripe Edge Function is introduced or required by the resulting supported payment flow.
- **FR-020**: The retirement work MUST replace provider-era tests that require Stripe SDK packages with absence/retirement tests covering no provider UI, imports, Edge Function source, or runtime configuration reads; Feature 009, 013, 014, 015, and 016 regression suites remain authoritative for active commerce compatibility.

### Key Entities

- **Supported bank-transfer payment**: A payment associated with the current proforma, private proof, finance decision, and downstream fulfillment process.
- **Historical provider evidence**: Preserved payment, event, transfer, and related accounting/audit records from retired provider capability; readable only according to existing privacy rules and never an authorization to execute provider actions.
- **Retired payment operation**: A former provider or legacy settlement operation that remains identifiable for history/rollback purposes but is unavailable for operational execution.
- **Payment execution-grant baseline**: The verified set of operation signatures and role permissions used to prove forward retirement and bounded rollback behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tested buyer payment journeys offer only bank transfer and complete the existing checkout-to-proof-to-finance-decision journey without a provider control or provider request.
- **SC-002**: 100% of tested attempts by public, anonymous, authenticated, and service roles to execute retired provider or legacy-review operations are denied with zero payment, inventory, fulfillment, or historical-record mutations.
- **SC-003**: 100% of the supported bank-transfer regression scenarios covering checkout, proforma, private proof, confirm, reject, replay, invoice, ownership, notification, and fulfillment handoff retain their established expected outcomes.
- **SC-004**: Repository-wide production-runtime inspection finds zero Stripe SDK/runtime imports, provider funding controls, provider configuration reads, or reachable Stripe/provider payment routes.
- **SC-005**: Historical provider evidence remains intact in all preservation tests, while no test can use that evidence to initiate provider funding, settlement, or transfer execution.
- **SC-006**: Forward, rollback, and postflight verification each confirm the exact approved execution-grant state for every affected payment operation and report no unintended grant to PUBLIC or anonymous callers.

## Assumptions

- Final pre-spec TEST/DEMO evidence is authoritative: no provider payments, nonterminal provider state, trusted-funding evidence, provider events/transfers, deployed Stripe Edge Functions, provider deployment secret names, or unresolved legacy/provider orders requiring legacy review remain.
- Hills Coffee remains bank-transfer-only; no provider replacement, payout automation, reconciliation redesign, or production activation is part of this feature.
- Historical payment/provider data is retained under existing read/privacy rules; this feature changes active runtime capability rather than historical data retention.
- Existing Feature 009, 013, 014, 015, and 016 business behavior and security guarantees are the compatibility baseline.
- Implementation planning will identify the exact affected source, migration, rollback, postflight, and regression files without modifying historical applied migrations.
