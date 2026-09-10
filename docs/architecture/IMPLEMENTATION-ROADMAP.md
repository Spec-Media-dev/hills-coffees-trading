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
| 002 | Public Website | Public `/`, Member `/dashboard` shell, Admin `/dashboard-admin` shell | Planning re-synchronised (59 tasks / 13 phases / 7 contracts) · **Implement IN PROGRESS — 20 / 59 (Phases 1–5, 7 verified)** · **Phase 5.5 Full Product UI Foundation — IMPLEMENTED / VERIFIED — 58 / 58 UIF tasks, all 9 blocks (A–I) closed 2026-09-10** · reference-pack + GSAP amendment reconciled 2026-09-09 (ASSET-REF-01, MOTION-GSAP-01, both still true and unresolved) · Member/Admin application shell (`components/app/*`) and its own copy root (`lib/app/copy`, `CONTENT-AR-01` scope) are new, reusable component inventory for Features 003–012 · Phase 6 (RFQ) NOT started | [spec](../../specs/002-public-website/spec.md) · [plan](../../specs/002-public-website/plan.md) · [tasks](../../specs/002-public-website/tasks.md) · [Phase 5.5 plan](../../specs/002-public-website/PHASE-5.5-UI-FOUNDATION-PLAN.md) · [Phase 5.5 tasks](../../specs/002-public-website/PHASE-5.5-TASKS.md) · [Phase 5.5 handoff](../../specs/002-public-website/PHASE-5.5-IMPLEMENTATION-HANDOFF.md) |
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

## 1.1 Phase 5.5 — frozen visual system and component inventory (UIF-051)

Closed 2026-09-10. All 58 UIF tasks (`UIF-001`–`UIF-058`, blocks A–I) are `[x]` in
`specs/002-public-website/PHASE-5.5-TASKS.md`, each after its exact Verify condition passed. This is
a **presentational foundation freeze**, not a business-feature completion — see §5 below for what
remains genuinely open.

**Tokens and primitives** (`src/app/globals.css`, `components/ui/*`): the complete Hills type,
colour, radius, elevation, motion and layout contract from UIF-001–UIF-014, plus the Member/Admin
application-shell tokens added in UIF-035 (`--sidebar-w` 264px / `--sidebar-w-collapsed` 76px /
`--topbar-h` 64px). One design system across all three surfaces (contract §1) — Public "editorial",
Member "application", Admin "operational" density, never a second token set.

**Public feature components** future features may reuse as-is: the whole `components/public/*` tree
(header/footer/hero/mega-menus/catalogue filter/origins showcase/interactive story/traceability/
process journey/final CTA), `components/motion/*` (Reveal, Presence, HoverLift, `useGsapTimeline`,
`GsapScrollReveal`), and the bilingual chrome pattern (`components/locale/bilingual.tsx`).

**Member/Admin application shell** (new in UIF-035–041, the component inventory Features 003–012
build on): `components/app/{app-shell,sidebar,topbar,page-header,mobile-app-nav,module-page,
detail-page,filter-bar,action-bar,member-navigation,admin-navigation,foundation-overview}.tsx`, fed
by its own copy root `lib/app/copy/*` (a second CONTENT module on the SAME i18next instance — see
that module's header comment for why it is not `lib/public/copy`). `AppShell` is the one shell both
`/dashboard` and `/dashboard-admin` mount; there is no second design system and no
`/buyer-dashboard`/`/seller-dashboard`. The seller-additive navigation path and the full role-scalable
admin module catalogue are real, tested code paths (`buildMemberNavGroups({canSell:true})`,
`buildAdminNavGroups(roles)`) that are **not** wired to any live route — Feature 004 and Feature 010
own turning them on with real capability/role data.

**Client-island set** (contract §16, amended by UIF-047): 12 documented islands total — the original
9 Public (theme, locale, mobile nav, search, motion wrappers, form controls, `AnimatedHero`,
`InteractiveStorySection`, `OriginsShowcase`) plus `CatalogueFilter` (UIF-030, previously
undocumented) plus `MobileAppNav` (UIF-035, Member/Admin's one new island) — plus the still-absent
conditional `ProcessJourneySection` (UIF-056 shipped static; that island does not exist in the
current build). No page tree (`page.tsx`/`layout.tsx`) is a Client Component anywhere in the product.

**Blockers reconciled unchanged** — none resolved or hidden by Phase 5.5: `MEDIA-01`, `CONTENT-01`,
`PRICE-011`, `DB-BLOCK-02`, `CRM-DEST-01`, `LIFE-01`, `ABUSE-01` all retain their true severity.
`CONTENT-AR-01`: the public design convergence pass (2026-09-10) supplied faithful Arabic renderings
for every `lib/public/copy` and `lib/app/copy` key — Content/Legal sign-off of the wording is the one
remaining step, recorded in each module's own header comment. `I18N-ROUTE-01` unchanged (no locale
routing; preference lives in `localStorage`, applied pre-paint). `ASSET-REF-01` and `MOTION-GSAP-01`
remain true and in force exactly as recorded 2026-09-09 — no reference-board asset is rendered, GSAP
is approved and Lenis stays uninitialised (`grep -rn "lenis" src components` — empty). `T033`,
`T034`, `T035`, `T036` remain `[ ]`, untouched by this phase, exactly as the plan requires.

**Verification evidence**: `npm run typecheck` / `npm test` (**122/122**) / `npm run build` all pass
on final source; product lint (`src components tests scripts lib`) zero findings; the historical
`docs/claude-design`-only baseline unchanged at **124 errors / 148 warnings**. Real-browser evidence
on one clean production server: `verify-uif-b.mjs` **508/508**, `verify-uif-c.mjs` **117/117**,
`verify-uif-d.mjs` **408/408** (Public, all themes/directions/breakpoints, long-Arabic injection,
GSAP 20-cycle leak check), `ui-foundation.browser.mjs` (token/contrast-AA/RTL/responsive/GSAP
lifecycle fixtures), `tests/design/uif-fg.browser.mjs` (24 authenticated Member/Admin scenarios + 8
anonymous/cross-surface denial cases against REAL Supabase sessions), `tests/design/
uif-h-closure.browser.mjs` (keyboard-only drawer open/focus-trap/close/focus-restore, heading order).

**Exact next task**: Feature 002 Phase 6 (RFQ) — NOT started by this phase. Before that, or before
Feature 003/004/010 begin consuming this inventory, re-run the Analyze pass 002's planning
artefacts already call for (§ note below the feature index).

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
