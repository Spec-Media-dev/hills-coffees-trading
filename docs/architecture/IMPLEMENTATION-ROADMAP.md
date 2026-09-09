# Hills Coffee — Implementation Roadmap

**Last updated**: 2026-09-08
**Governing documents**: `.specify/memory/constitution.md` (v2.0.0) →
`docs/requirements/Hills-Coffee-SRS-v1.md` → `docs/database/` →
`docs/design-guidance/Hills-Coffee-Website-Recommendations.md` → `docs/claude-design/` → code.

> **Feature 001 (Platform Foundation) is IMPLEMENTED and VERIFIED** — all 50 of its tasks are
> checked, and every phase carries a COMPLETE — VERIFIED status recorded against executed
> verification (including live-browser and real-Supabase proofs). **Features 002–012 remain at
> planning stage**, with every task checkbox unchecked.

This document is the index a new agent reads first. For *what the database can already do*, read
`docs/architecture/DATABASE-CAPABILITY-MAP.md` — including its list of recorded blockers and the
commission capability (§8), which is already implemented in the database.

---

## 1. Feature index

| # | Feature | Surface | Status | Artefacts |
|---|---|---|---|---|
| 001 | Platform Foundation | All three (foundation) | Constitution ✅ · Specify ✅ · Clarify ✅ · Plan ✅ · Tasks ✅ · Analyze ✅ · **Implement ✅ — IMPLEMENTED / VERIFIED (50/50 tasks)** | [spec](../../specs/001-platform-foundation/spec.md) · [plan](../../specs/001-platform-foundation/plan.md) · [tasks](../../specs/001-platform-foundation/tasks.md) · research · data-model · contracts · quickstart · AGENT-HANDOFF |
| 002 | Public Website | Public `/` | Planning re-synchronised (59 tasks / 13 phases / 7 contracts) · **Implement IN PROGRESS — 20 / 59 (Phases 1–5, 7 verified)** · **Phase 5.5 Full Product UI Foundation PLANNED (58 UIF tasks / 9 blocks), inserted before Phase 6** · reference-pack + GSAP amendment reconciled 2026-09-09 (ASSET-REF-01, MOTION-GSAP-01) | [spec](../../specs/002-public-website/spec.md) · [plan](../../specs/002-public-website/plan.md) · [tasks](../../specs/002-public-website/tasks.md) · [Phase 5.5 plan](../../specs/002-public-website/PHASE-5.5-UI-FOUNDATION-PLAN.md) · [Phase 5.5 tasks](../../specs/002-public-website/PHASE-5.5-TASKS.md) |
| 003 | Auth, Membership & KYB | Public auth routes + `/dashboard` | Planning prepared · Implement NOT STARTED | [spec](../../specs/003-auth-membership-kyb/spec.md) · [plan](../../specs/003-auth-membership-kyb/plan.md) · [tasks](../../specs/003-auth-membership-kyb/tasks.md) |
| 004 | Member Dashboard | `/dashboard` | Planning prepared · Implement NOT STARTED | [spec](../../specs/004-member-dashboard/spec.md) · [plan](../../specs/004-member-dashboard/plan.md) · [tasks](../../specs/004-member-dashboard/tasks.md) |
| 005 | Inventory, Custody & Storage | `/dashboard` + shared layer | Planning prepared · Implement NOT STARTED | [spec](../../specs/005-inventory-custody-storage/spec.md) · [plan](../../specs/005-inventory-custody-storage/plan.md) · [tasks](../../specs/005-inventory-custody-storage/tasks.md) |
| 006 | Marketplace, Listings & Resale | `/dashboard` | Planning prepared · Implement NOT STARTED | [spec](../../specs/006-marketplace-listings-resale/spec.md) · [plan](../../specs/006-marketplace-listings-resale/plan.md) · [tasks](../../specs/006-marketplace-listings-resale/tasks.md) |
| 007 | Orders, Checkout & Reservations | `/dashboard` | Planning prepared · Implement NOT STARTED | [spec](../../specs/007-orders-checkout-reservations/spec.md) · [plan](../../specs/007-orders-checkout-reservations/plan.md) · [tasks](../../specs/007-orders-checkout-reservations/tasks.md) |
| 008 | Payments, Settlement, Invoices & Payouts | `/dashboard` + finance layer | Planning prepared · Implement NOT STARTED | [spec](../../specs/008-payments-settlement-invoices-payouts/spec.md) · [plan](../../specs/008-payments-settlement-invoices-payouts/plan.md) · [tasks](../../specs/008-payments-settlement-invoices-payouts/tasks.md) |
| 009 | Delivery & Shipments | `/dashboard` + warehouse layer | Planning prepared · Implement NOT STARTED | [spec](../../specs/009-delivery-shipments/spec.md) · [plan](../../specs/009-delivery-shipments/plan.md) · [tasks](../../specs/009-delivery-shipments/tasks.md) |
| 010 | Operations / Admin Console | `/dashboard-admin` | Planning prepared · Implement NOT STARTED | [spec](../../specs/010-admin-operations-console/spec.md) · [plan](../../specs/010-admin-operations-console/plan.md) · [tasks](../../specs/010-admin-operations-console/tasks.md) |
| 011 | Pricing & Reference Data | Public + member + admin | Planning prepared · Implement NOT STARTED | [spec](../../specs/011-pricing-reference-data/spec.md) · [plan](../../specs/011-pricing-reference-data/plan.md) · [tasks](../../specs/011-pricing-reference-data/tasks.md) |
| 012 | Disputes, Notifications & Audit | `/dashboard` + `/dashboard-admin` | Planning prepared · Implement NOT STARTED | [spec](../../specs/012-disputes-notifications-audit/spec.md) · [plan](../../specs/012-disputes-notifications-audit/plan.md) · [tasks](../../specs/012-disputes-notifications-audit/tasks.md) |

**Lifecycle legend**: Specify → Clarify → Plan → Tasks → **Analyze** (per-feature preflight before
implementation) → Implement → Converge. For 002–012, Analyze is pending and should be run
immediately before that feature's implementation begins, not now.

**Feature 002 status note**: 002's planning artefacts were re-synchronised on 2026-09-08 after an
Analyze pass returned NOT READY. The corrections covered the cache API (now `unstable_cache` +
`revalidateTag`, matching what 001 actually implemented), a shared `PublicShell` for the locked root
homepage, an explicit public DTO allowlist, honest RFQ/price/lifecycle/media boundaries, real-browser
verification, trailing-slash canonicalisation, and corrected task dependencies. **002 must be
re-analyzed before implementation.**

---

## 2. Purpose and ownership at a glance

| # | Owns | Explicitly does **not** own |
|---|---|---|
| 001 | Route/layout foundation, identity & authorization resolution, Supabase client boundary, Server Action contract, cache policy, state components, i18n/RTL base, test tooling & fixtures | Any business feature |
| 002 | Public discovery, SEO, public shell, RFQ entry (to the validation boundary), membership entry points, reference-price presentation *shell* | Any private data; price semantics (011); catalogue authoring (010); **commission of any kind** (database + 008 + 010); knowledge/legal content (CONTENT-01) |
| 003 | Authentication, membership application, organization context, KYB submission/status, agreements | Compliance review decisions (010); trading (005–009) |
| 004 | Member portal shell, navigation, overview, module registration contract (**consumes** the Phase-5.5 visual shell; supplies the real capability-driven navigation) | Any module's business logic |
| 005 | Inventory positions, custody, storage allocations, ownership ledger, availability facts | Any inventory mutation (007/008/010) |
| 006 | Private marketplace, listing lifecycle, seller eligibility, fill presentation | Reservations (007); settlement (008); review decisions (010) |
| 007 | Draft orders, checkout via `checkout_order()`, 20-minute hold, expiry, buyer shipment request | Title transfer (008); fulfilment states (009) |
| 008 | Payment instructions/proof, finance decision layer, settlement outcomes, invoices, payouts, **commission snapshot presentation + immutability verification**, and the COMMISSION-OPEN-01 decision | Settlement logic itself (database); commission *calculation* (database); commission *configuration UI* (010); console screens (010) |
| 009 | Delivery request, warehouse fulfilment layer, delivered quantity, tracking | Console screens (010); inventory reservation (blocked, DB-BLOCK-07) |
| 010 | Role-separated operations console composing 003/005/006/008/009/012 layers; catalogue; system config (**consumes** the Phase-5.5 admin visual shell; supplies real role gating) | Transactional logic (delegated); schema changes |
| 011 | The four price types, reference data, disclosure/staleness/licence rules | Executable pricing (006/007); ingestion; FX (blocked) |
| 012 | Disputes, notifications surface, audit/history visibility | Notification generation (blocked); dispute freeze (blocked) |

---

## 3. Dependency graph

```text
                          ┌─────────────────────────┐
                          │ 001 Platform Foundation │  (blocks everything)
                          └────────────┬────────────┘
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
        ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
        │ 002 Public Site │   │ 003 Auth/KYB    │   │ 011 Pricing     │
        └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                 │                     │                     │
                 │            ┌────────▼────────┐            │
                 │            │ 004 Member Dash │            │
                 │            └────────┬────────┘            │
                 │                     │                     │
                 │            ┌────────▼────────┐            │
                 │            │ 005 Inventory   │            │
                 │            └────────┬────────┘            │
                 │                     │                     │
                 │            ┌────────▼────────┐            │
                 │            │ 006 Marketplace │◄───────────┘ (price-type separation)
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 007 Orders/     │
                 │            │     Checkout    │
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 008 Payments/   │
                 │            │     Settlement  │
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 009 Delivery    │
                 │            └────────┬────────┘
                 │                     │
                 │            ┌────────▼────────┐
                 │            │ 012 Disputes/   │
                 │            │  Notif/Audit    │
                 │            └────────┬────────┘
                 │                     │
                 └──────────┬──────────┘
                            │
                   ┌────────▼─────────────────────┐
                   │ 010 Operations/Admin Console │  (composes 003/005/006/008/009/012)
                   └──────────────────────────────┘
```

**Independent work streams** (safe to run concurrently after 001):

- **Stream A — Public**: 002 (+ 011's presentation contract). Needs nothing from 005–009. This is the
  natural parallel track: public-site work can proceed while the transactional spine is built.
- **Stream B — Member spine**: 003 → 004 → 005 → 006 → 007 → 008 → 009. Largely sequential because
  each stage produces the records the next consumes.
- **Stream C — Pricing**: 011's domain layer can be built early; its consumers (002, 006/007) plug in
  when ready.
- **Stream D — Console**: 010 is *composed* from other features' layers, so each of its areas becomes
  buildable as its dependency lands (Compliance after 003/006; Finance after 008; Warehouse after
  009; Catalogue after 002's cache tags exist).
- **Stream E — Accountability**: 012's history/audit surfaces depend only on the records existing;
  its notification surface is limited by DB-BLOCK-04 regardless of sequencing.

**Not artificially sequential**: 002, 011 and 012's audit surfaces do **not** need the trading spine
complete. 010's areas do not need each other.

---

## 4. End-to-end journey ownership

### Buyer journey

| Stage | Owning feature |
|---|---|
| Public discovery | 002 |
| RFQ / commercial inquiry | 002 *(persistence blocked — DB-BLOCK-02)* |
| Authentication / membership entry | 003 |
| KYB / approval | 003 (member side) + 010 (compliance decision) |
| Member dashboard | 004 |
| Private marketplace browse | 006 |
| Select permitted listing | 006 |
| Order creation | 007 |
| Checkout + atomic reservation + 20-min hold | 007 (via `checkout_order()`) |
| Manual bank-transfer payment | 008 |
| Payment proof | 008 (via `submit_payment_proof()`) |
| Finance review | 008 layer + 010 console |
| Settlement | 008 (via `admin_review_payment()`) |
| Title transfer | 008 (inside the same function) |
| Buyer inventory | 005 |
| Custody / storage | 005 |
| Delivery (if requested) | 009 *(reservation blocked — DB-BLOCK-07)* |
| Dispute flow | 012 *(freeze blocked — DB-OPEN-09)* |

**Coverage: complete** — every stage has exactly one owning feature; blocked steps are named.

### Seller journey

| Stage | Owning feature |
|---|---|
| Approved seller-capable organization (`can_sell`) | 003 (surfacing) + 010 (compliance grant) |
| Hills-origin owned inventory in approved custody | 005 |
| Eligible quantity determination | 005 (facts) + 006 (rule) |
| Create resale listing | 006 |
| Compliance / listing review | 010 (decision) + 006 (states) |
| Publish | 006 |
| Buyer partial/full order | 007 |
| Reservation | 007 (via `checkout_order()`) |
| Payment | 008 |
| Settlement + title transfer | 008 |
| Seller payout | 008 |
| Remaining quantity / partial fill / sold out | 006 |
| Audit trail | 012 |

**Coverage: complete.** Seller remains a buyer-capable member inside `/dashboard` — no separate app.

### Admin / operations journey

| Role | Stages | Owning feature |
|---|---|---|
| COMPLIANCE | KYB review, organization suspension, listing review, dispute review | 010 (screens) over 003/006/012 layers |
| WAREHOUSE | Custody oversight, shipment progression, delivery recording, reconciliation* | 010 over 005/009 layers |
| FINANCE | Payment review, settlement decision, payouts, invoices | 010 over 008's layer |
| AUDITOR | Read-only evidence* | 010 over 012's layer |
| ADMIN | Catalogue, broader administration | 010 |
| SUPER_ADMIN | Platform admins, commission/tax/shipping configuration | 010 |

\* limited by DB-OPEN-06 (auditor `audit_logs` access) and the unmodelled reconciliation/variance
entity.

**Coverage: complete**, with least privilege preserved — no universal admin role.

---

## 5. Open blockers and decisions (consolidated)

All are recorded in `docs/architecture/DATABASE-CAPABILITY-MAP.md` §8 with SRS citations. None may be
resolved by an improvised workaround; each requires the Constitution's database-change process or a
business decision.

| ID | Summary | Blocks | Release impact |
|---|---|---|---|
| DB-BLOCK-01 | No Supabase Storage bucket — no private document bytes can be stored | 003, 008, 009, 012 | **AC-08** (private KYB documents) |
| DB-BLOCK-02 | No destination for an anonymous RFQ | 002 | Public conversion path |
| DB-BLOCK-03 | Organizations/members are admin-insert only — no self-service onboarding | 003 | Membership funnel |
| DB-BLOCK-04 | Notifications can be neither created nor marked read | 004, 012 | Notification system entirely |
| DB-BLOCK-07 | Delivery request does not reserve inventory | 005, 006, 009 | **AC-04** |
| DB-OPEN-05 | `coffee_lots` member-read policy appears unsatisfiable | 005, 006 | Lot detail visibility |
| DB-OPEN-06 | Auditors cannot read `audit_logs` | 010, 012 | Auditor evidence access |
| DB-OPEN-08 | No FX/conversion storage | 011, 002 | **AC-06** conversions |
| DB-OPEN-09 | Dispute freeze has no mechanism; compliance cannot set an order `DISPUTED` | 010, 012 | MKT-07 |

### Feature-level blockers recorded during 002's planning sync

These are surfaced in `specs/002-public-website/spec.md` and constrain sub-flows only — none blocks
Feature 002 as a whole.

| ID | Summary | Severity | Blocks | Owner |
|---|---|---|---|---|
| CRM-DEST-01 | No approved CRM/email destination for RFQ hand-off | PRE-PRODUCTION BLOCKER | RFQ delivery to the business | Business (SRS §18 register) |
| CONTENT-01 | No approved content source for knowledge/editorial/legal (no CMS/article/legal table exists; SRS assigns authoring to the Catalogue/CMS admin area) | BLOCKS SUB-FLOW | `/knowledge/*`, `/legal/*` | 010 / Content-Legal |
| LIFE-01 | No alias/redirect/tombstone capability — renamed, withdrawn and never-existed are indistinguishable | BLOCKS SUB-FLOW | 301/308/410 lifecycle (200/404 is implementable) | DB capability decision |
| ABUSE-01 | No durable multi-instance abuse protection (no Redis/Upstash approved) | PRE-PRODUCTION BLOCKER | production-grade abuse defence | Infrastructure decision |
| MEDIA-01 | No Storage bucket / public file-delivery path (extends DB-BLOCK-01) | BLOCKS SUB-FLOW | real public imagery/documents | DB capability decision |
| PRICE-011 | Feature 011 unimplemented; conversions also blocked by DB-OPEN-08 | BLOCKS SUB-FLOW | numeric reference pricing | 011 |

**Business decisions still outstanding** (SRS §18 Sprint 0 register): RFQ/CRM destination; refund and
chargeback model; OPS-01 dual control for high-risk actions; member MFA enforcement policy; KYB
screening provider/policy; market-data licensing; hold-expiry and price-ingestion scheduling
infrastructure; Hills commercial quote entity; **COMMISSION-OPEN-01** — whether a MEMBER_SELLER
checkout with no matching commission tier should explicitly allow 0% commission or fail closed
(owned by Feature 008 / Business-Finance; see `docs/database/commission-capability.md` §8).

---

## 6. Production readiness

**Not production-ready.** Code completion never authorizes production trading (Constitution
"Production Readiness"; SRS Appendix F). Of the release-blocking acceptance criteria, at least
**AC-04** (delivery reservation), **AC-06** (price conversions/disclosure completeness) and **AC-08**
(private document access) cannot pass until the blockers above are resolved, independent of
implementation quality.

---

## 7. How to continue (for an agent with no prior context)

1. Read `.specify/memory/constitution.md` (v2.0.0) — the locked rules.
2. Read this roadmap and `docs/architecture/DATABASE-CAPABILITY-MAP.md` (including §8 commission and
   §9 blockers).
3. Read `specs/001-platform-foundation/AGENT-HANDOFF.md` — 001 is **built**, so its patterns
   (route guards, DAL, Server Action contract, `unstable_cache` + `revalidateTag`, `StateScreen`,
   test fixtures) are working code to copy, not proposals.
4. Pick the next feature per §3's dependency graph.
5. Read that feature's `spec.md` → `plan.md` → `tasks.md` → `contracts/`.
6. Run `/speckit-analyze` for that feature (its preflight is pending; **002 requires a re-run**
   after its 2026-09-08 planning sync).
7. Implement tasks in phase order, honouring every "standing rule" in its tasks.md.
8. Never resolve a recorded blocker with a workaround; escalate it instead.
