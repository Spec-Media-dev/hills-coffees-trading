# Implementation Plan: Marketplace, Catalogue & Checkout Completion

**Branch**: `main` (retained) | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Status**: Planning design for review. No implementation, migration SQL, tasks or remote verification is included.

## Summary

Complete the existing Hills Public Website, Member Portal and Operations Console. Preserve normalized catalogue/offer/inventory records and Features 009/013/014/015/016/017. BANK_TRANSFER_V1 is the only active payment flow. The material transaction change is an atomic selected-line split: one pending cart item becomes one dedicated checked-out order, while the same source DRAFT remains reusable, including when empty. Protected immutable receipts provide conflict detection and recovery after line deletion.

PostgreSQL owns checkout, authorization, inventory, immutable snapshots, Finance and fulfillment. Small client components own interactive controls and reference-only Compare state. Public catalogue DTOs and tagged Next.js caches remain separate from session-scoped commerce/support reads. Extend the existing catalogue Admin and Feature 014 support rather than build parallel systems.

## Technical Context

| Area | Decision |
| --- | --- |
| Language/runtime | Strict TypeScript 5, React 19.2.8, Next.js 16.3.4 App Router; PostgreSQL/Supabase functions and RLS |
| Existing dependencies | Supabase JS/SSR, Zod 4, React Hook Form 7, Tailwind 4, edited shadcn/Base UI, Lucide, i18next, Sonner, Motion; GSAP only for existing justified storytelling |
| Storage | Existing PostgreSQL tables, public-assets, private listing-media/payment-proof Storage; no Compare table or external cache |
| Testing | Vitest 3, Testing Library/jsdom, axe-core; PostgreSQL independent-session integration/concurrency; existing approved live harness patterns |
| Rendering | Server Components by default, narrowly scoped client islands, guarded Server Actions/DAL and database RPCs |
| Performance | NFR-005 budgets: LCP ≤2.5s, interaction delay ≤200ms, CLS ≤0.1; document lab conditions separately from field p75 |
| Bounds | Recent/Featured six each, related three, Compare three; paginated marketplace/support; 360/768/1280px EN/AR |
| Constraints | No root relocation, product implementation in planning, new animation/cache/support delivery framework, stock fabrication or provider restoration |
| Schema confidence | Checked-in definitions inspected; live catalog capture is a mandatory implementation gate, not evidence already obtained |

Installed Next.js docs were inspected for `unstable_cache` and `revalidateTag`. `unstable_cache` remains the established repository mechanism although the installed docs recommend Cache Components for new adoption. Do not introduce a cache-mode migration in this feature. Use the existing immediate `revalidateTag(tag, { expire: 0 })` helper for publication/Featured removals; no deprecated one-argument call. No identity/cookie read belongs inside public cache scope.

## Constitution Check

| Gate | Pre-research | Post-design evidence |
| --- | --- | --- |
| Approved spec and audited compatibility | PASS | All 94 FRs and nine stories mapped in [requirements-traceability.md](contracts/requirements-traceability.md); current definitions prerequisite explicitly recorded |
| Locked root and three surfaces | PASS | `/` remains `src/app/page.tsx`; `/dashboard` and `/dashboard-admin` retained |
| Capability, tenant, MFA and RLS enforcement | PASS | [surface-security.md](contracts/surface-security.md); no unified-UI role grants |
| Database transaction/title authority | PASS | [checkout.md](contracts/checkout.md); existing Finance/fulfillment integrity remains authoritative |
| Privacy and native-cache boundary | PASS | Public allowlist DTOs only; private commercial branches uncached and session-authorized |
| Non-destructive history and audit | PASS | Receipts, snapshots, references and financial history retained; rollback cannot erase them |
| Hills design, EN/AR and accessibility | PASS | Shared domain components, existing motion owners, localized states and keyboard gates |
| Lifecycle and bounded scope | PASS | Planning artifacts only; tasks generation follows review; no product readiness claim |

No constitution exception is needed. The new single-line split intentionally supersedes fresh combined checkout; it does not reinterpret historical transactions. Unexpected live-definition drift blocks implementation until the design is reconciled and reviewed; it is not permission to weaken the specification.

## Project Structure

```text
specs/018-marketplace-catalogue-checkout-completion/
  spec.md                         # existing clarified requirements
  plan.md                         # architecture/dependencies/phase gates
  research.md                     # repository evidence and decisions
  data-model.md                   # entities, fields, constraints, lifecycles
  quickstart.md                   # future validation guide
  contracts/
    checkout.md                   # atomicity, locks, receipts, legacy fence
    admin-support.md              # Admin orchestration and Feature 014 extension
    surface-security.md           # routes, DTOs, client/server/cache and buyer states
    migrations-verification.md    # migration groups, capture, rollback/postflight
    requirements-traceability.md  # all FRs/stories and verification paths
```

Planned source ownership uses existing directories:

| Domain | Existing/planned locations |
| --- | --- |
| Public discovery/detail | `src/app/page.tsx`, `src/app/(public)/coffee/`, `lib/public/coffees.ts`, `lib/public/cache.ts`, `components/public/`, `components/coffee/` |
| Member offers | `src/app/dashboard/coffee/`, `lib/listings/`, `components/listings/` |
| Cart/checkout/recovery | `src/app/dashboard/cart/`, `src/app/dashboard/orders/[orderId]/`, `lib/commerce/`, `components/commerce/` |
| Shared navigation | `components/public/site-header.tsx`, member layout/sidebar/mobile navigation and existing nav registry |
| Admin catalogue/bank | `src/app/dashboard-admin/(catalogue)/coffees/`, `src/app/dashboard-admin/(compliance)/listings/`, `src/app/dashboard-admin/(system)/payment-accounts/`, `lib/admin/` |
| Compare | Public/member compare pages, separate reference stores and shared presentation under `components/coffee/` |
| Help | `src/app/dashboard/help/`, `src/app/dashboard-admin/support/`, authorized existing messages redirects, `lib/messaging/`, `components/messaging/` |
| SQL/tests | New forward/rollback/postflight files under existing Supabase/script conventions; scoped tests in existing commerce/public/admin/messaging/auth/finance suites |

These are ownership destinations, not generated implementation files. Do not create `tasks.md` in this stage.

## Architecture and Transaction Boundaries

### Selected checkout and empty DRAFT

The new selected-line RPC authenticates and authorizes before receipt replay, serializes organization cart operations using the established advisory key, locks the canonical source order before its selected item, and verifies an exact payload. It creates a distinct transaction order even for the last cart line. The child contains exactly one copied item and leaves DRAFT before commit. The protected Feature 015 kernel supplies existing quote, snapshots, reservation, HOLD/payment and notifications. Insert the final receipt after successful child checkout, then delete only the bound source item. Any error rolls back every effect.

The source keeps its order ID, BANK_TRANSFER_V1 and DRAFT, with no payment/reservation/current-proforma/destination artifacts. No minimum-one-item or one-DRAFT index is introduced. `readCart` remains read-only and resolves latest `(created_at DESC, id DESC)` including empty. `commerce_resolve_cart` reuses it under the organization lock; historic multiple DRAFTs remain untouched. Direct old mutation entry points must receive the same V1 canonical-cart guard, not only the new DAL.

See [checkout.md](contracts/checkout.md) for exact lock staging, selected-only quote, legacy compatibility, receipt authorization and unknown-outcome recovery. In particular, child-item trigger locks and expired-reservation reclamation must be reconciled before insertion. A browser-provided internal flag is never a checkout exemption.

### Admin, publication and real stock

Extend Coffee new/edit into an independently saved stepper: identity/English → Arabic → taxonomy/origin → media → backing position → offer price/quantity → Featured → readiness/previews → review/publication. First confirmed identity save creates one DRAFT with a stable intent; later operations target that ID and an explicitly chosen offer. Keep role-specific server/database checks and CAS edits. An absent position produces a Warehouse handoff, not a stock INSERT. Catalogue-only publication and coordinated Coffee + APPROVED-offer publication are explicit separate operations; coordinated publication is one database transaction.

### Public/member composition and client state

Use reusable Coffee card/detail/gallery/quantity/offer-selector presentation with distinct public and commercial DTO types. Public homepage/detail/Compare use only published public content; authenticated commerce is a fresh guarded branch outside shared caches and public metadata. Existing legitimate member offers do not acquire a Coffee-PUBLISHED requirement. Add returns a committed result followed by authoritative CartSummary; client state never invents a count. Context epochs reject stale results and clear organization/session private state. Compare stores only up to three public slugs or scoped member offer IDs, never persisted prices or signed URLs.

### Bank, buyer documents and Help

Expose the existing default USD bank mechanism while preserving Super Admin CRUD and Platform Admin/MFA default selection. Read buyer documents by exact `current_proforma_id` and verify linkage; bank instructions come only from permitted frozen snapshots. Capture nullable Arabic names on new issuance inside the checkout kernel, preserving frozen English/custom offer titles. Render actual Finance/rejection/expiry/fulfillment states and recover committed checkout through receipts without reconstructing it.

Help extends Feature 014 tickets/messages with category, random HC references and append-only status history. Controlled idempotent create/reply/status operations derive identity, preserve historical HLP references, enforce current organization scope and emit safe transactional in-app notifications. No attachments, private notes, assignment engine or external delivery is added.

## Migration and Dependency Strategy

Four logical forward groups are proposed; exact timestamp/file count is fixed only after live-definition capture. Never edit historical migrations.

1. **M1 catalogue/snapshot support**: nullable `coffees.featured_at`; nullable Arabic product/origin snapshot columns; indexes/allowlist reads. Historical values remain untouched. New issuance population is activated with M2 kernel changes.
2. **M2 checkout foundation**: protected receipts/internal permits and strengthened request payload binding; selected quote; cart mutation serialization; private checkout staging/kernel/public fence; receipt recovery. Requires M1 for snapshot INSERT columns.
3. **M3 Admin orchestration**: idempotent normalized creation/step-save/Featured/publication contracts, conflict guards and permission preservation. Reuses M2 request-binding infrastructure; no stock creation.
4. **M4 Help extensions**: category/reference/history plus idempotent create/reply/status and safe notifications; reuses protected operation binding and existing Feature 014 identity/RLS/audit machinery.

Every group needs preflight, exact grants/search_path/RLS review, safe rollback, read-only postflight and approved actual PostgreSQL verification. [migrations-verification.md](contracts/migrations-verification.md) defines mandatory captures and failure restoration. Rollback must never restore fresh combined checkout or Feature 017 provider execution, and must retain immutable new records.

## Three Delivery Phases and Internal Gates

The 140 granular tasks are delivered in at most three execution passes. The grouping changes execution ergonomics only: task order, dependencies, requirements, tests and safety gates remain unchanged. A delivery phase is not a claim that every task inside it can run concurrently.

| Delivery phase | Tasks | Workstreams | Exit gate |
| --- | --- | --- | --- |
| **A — Foundation, Checkout, Admin & Bank** | T001–T059 | A1 capture/reconciliation; M1 Featured/Arabic; M2 selected checkout/receipts/recovery/empty DRAFT/legacy fence; M3 Admin; bank configuration | Captured/reconciled schema; M1/M2/M3 complete; real local PostgreSQL selected-checkout, exact-once, empty-DRAFT and historical multi-line compatibility pass; Admin/bank local gates pass; no unresolved BLOCKER/HIGH. No remote mutation is required. |
| **B — Marketplace & Member Experience** | T060–T111 | Recently Added/Featured, public detail, marketplace, offer selector/Add, CartSummary/navigation, Compare, proforma/recovery, M4 Help | Local anonymous discovery → sign-in → marketplace → Add → badge → selected checkout → retained lines → order/proforma recovery works; Help locally validated; public/member privacy, cart, Compare, recovery and Help/RLS tests pass; no unresolved BLOCKER/HIGH. |
| **C — Polish, Regression, Live Verification & Closure** | T112–T140 | EN/AR/RTL/a11y/motion/performance; scoped compatibility; target/fixture harness; approved remote verification, rollback/reapply, cleanup and closure | Local/static checks pass; remote TEST/DEMO mutation remains separately authorized at T129; final closure requires actual evidence and never counts a skip as execution. |

### Delivery Phase A internal gate

T001–T010 build and test local capture tooling. **T011 is REMOTE READ-ONLY** TEST/DEMO schema capture, not local/static work and not a mutation. T012 compares that evidence with checked-in assumptions and records signed-off effective definitions. **No Feature 018 migration SQL authoring or database implementation (T013+) may begin until T011 and T012 complete with no unresolved drift.** M1 precedes M2; M2 protected operation binding precedes M3 and M4. Admin and bank work retain their stated task-level dependencies.

### Delivery Phase B dependency boundary

Phase B consumes Phase A's M1/M2 security, checkout and operation-binding contracts. It cannot recreate selected checkout logic, bypass direct-RPC fences or expose private DTO fields. M4 Help uses the protected operation binding from Phase A. It does not need Phase C polish/live work to claim its local functional exit gate.

### Delivery Phase C authorization boundary

T120–T128 are local/static closure preparation. T129 is the explicit authorization record. T130–T138 are remote TEST/DEMO execution against only `mxejnutukgxyccnohglo`; T131 is the first remote mutation and cannot start before T129. T139–T140 require all applicable recorded evidence. Rollback/reapply recovery preserves the safe applied Feature 017-retired state and never restores combined fresh checkout.

M1 precedes checkout because Arabic insertion depends on it. Do not defer security, localization or transaction tests to the final delivery phase; they remain required within the workstreams that introduce the behavior.

## Validation and Continuity

Use [quickstart.md](quickstart.md) for future runnable local checks and approved integration preparation. Mocks may prove presentation/errors but cannot prove atomicity or lock safety. Record actual scenario outcomes, target identity, cleanup and migration state separately; gated tests are not live execution evidence. Retain Feature 016 historical evidence as pre-retirement evidence, do not run its Scenario 28 after Feature 017, and replace Scenario 29's historical ACL expectations with Feature-017/018-aware checks. Historical multi-group fixtures must come from already committed records, not fresh combined checkout or migration replay.

All FRs/stories have an implementation and test path. No owner decision is reopened. No present planning blocker is identified; actual-schema capture, approval for future remote work and all implementation gates remain mandatory prerequisites. The setup helper was attempted once and permanently blocked by the lean-ctx allowlist; these artifacts were authored from the repository plan template directly. No extension configuration exists, so before/after plan hooks do not run. No implementation or remote result is claimed.

## Complexity Tracking

No constitution violation. Additional protected checkout coordination is justified by exact-once consumption and safe internal execution; it does not become a browser authorization store. It must remain limited to the contracts described here, with no new orchestration service.
