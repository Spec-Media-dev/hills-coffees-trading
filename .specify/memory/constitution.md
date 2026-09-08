<!--
Sync Impact Report
==================
Version change: 1.0.0 → 2.0.0
Rationale: MAJOR bump. This amendment redefines a previously locked governance rule — Principle
XI, which named Redis/Upstash as approved caching/rate-limiting infrastructure. Per this
constitution's own Governance section, loosening/redefining a locked rule requires an explicit
MAJOR version, not a routine edit, even though the change is a simplification (removal of an
infrastructure dependency) rather than an addition of scope.

Modified principles:
  - XI. "Redis as Non-Authoritative Cache" → "Next.js-Native Caching Only (No External Cache
    Infrastructure)". The MVP architecture now explicitly excludes Redis/Upstash/any separate
    cache infra; caching is Next.js-native only, layered on Supabase/PostgreSQL (DB, Auth,
    Storage). Rate limiting now prefers Supabase-native protections plus application-level
    controls on existing infrastructure, with Redis introduction deferred to an explicitly
    approved future-scaling decision (measured load + insufficient Next.js/DB optimization +
    concrete operational need + approved cost/deployment impact).
Other updated references (non-principle-renaming, consistency edits to remove now-inaccurate
Redis/Upstash mentions):
  - Preamble/principle-index line: "Redis Non-Authoritative Caching" → "Next.js-Native Caching
    Only".
  - Principle XIV (Security & Secrets Handling): removed "Upstash credentials" example, replaced
    with a generic "Supabase credentials, and any future integration credentials" so the sentence
    does not imply Upstash is part of the current stack.
  - Principle XV (Spec-Driven Development Lifecycle): plan-quality checklist item "caching, Redis
    usage, revalidation" → "Next.js caching, revalidation".
  - Governance amendment-procedure locked-rule list: "Redis's non-authoritative role" →
    "the no-external-cache-infrastructure MVP architecture"; "selective rate limiting" now reads
    "selective rate limiting without Redis" to reflect the new locked position.
  - Principle III's existing guardrail against "replac[ing] transactional database logic with
    Redis" is left intact as a general preventive rule — it remains valid even though Redis is
    not currently part of the architecture, and pre-empts any future reintroduction from bypassing
    Postgres transactional authority.
Added sections: none (this is a content amendment within the existing structure, not a new
  principle or section)
Removed sections: none (Principle XI retitled and rewritten in place; no section deleted)
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): unchanged from v1.0.0 — original true adoption date is still
    unrecorded; ratification date remains the date this constitution was first authored
    (2026-09-07). Correct in a future PATCH if an earlier true date is confirmed.
-->

# Hills Coffee Constitution

## Preamble

This constitution governs every specification, clarification, plan, task set, implementation
pass, review, refactor, and coding agent working in this repository. It is mandatory, not
advisory. The repository must remain understandable and safely continuable by an agent with no
access to prior chat history — every decision of consequence must be discoverable from repository
artifacts (docs/, `.specify/`, git history) alone.

Hills Coffee is a Dubai-born B2B green-coffee sourcing, custody, storage, delivery, and private
authorized-trading platform serving the Arab region. Egypt is an operational office; it does not
replace Dubai as the brand origin. The platform has three distinct surfaces: the Public Website,
the Authorized Member Portal, and the Hills Operations/Admin Console. The trading product is a
private, permissioned B2B marketplace for physical Hills-sourced inventory held in Hills-approved
custody. It MUST NEVER be presented or implemented as a public exchange, anonymous trading venue,
securities marketplace, futures market, or as offering leverage, margin, derivatives, or
speculative investment functionality.

## Core Principles

### I. Project Identity & Scope Boundary

Every feature MUST reinforce, not dilute, the platform's identity as a private B2B physical-coffee
sourcing and authorized-trading platform. Features, copy, UI patterns, or integrations that make
the product resemble a public exchange, anonymous marketplace, securities venue, or leveraged/
derivative trading product are prohibited outright, regardless of design inspiration or user
demand. Rationale: regulatory exposure and brand trust depend entirely on this boundary being
held without exception.

### II. Source-of-Truth Priority (NON-NEGOTIABLE)

Before planning or implementing any feature, agents MUST inspect project sources in this fixed
authority order, and MUST resolve conflicts in this order:

1. `docs/requirements/Hills-Coffee-SRS-v1.md` — authoritative for business requirements, product
   behavior, functional requirements, operational flows, compliance, role expectations, release
   gates, and MVP scope.
2. `docs/database/` (especially `database-schema-report.json`, `database-final-audit.json`,
   `README.md`) — the approved current database baseline governing tables, relationships,
   constraints, indexes, RLS, policies, authorization, functions, triggers, inventory integrity,
   reservations, ownership, settlement, payments, and operational-role enforcement.
3. `docs/design-guidance/Hills-Coffee-Website-Recommendations.md` — public website intent,
   homepage customization, conversion guidance, section recommendations, visual references.
4. `docs/claude-design/` — approved Hills visual implementation reference (tokens, typography,
   components, layouts, spacing, assets, interaction, responsive behavior).
5. Existing application code — an implementation baseline only. Existing code MUST NOT silently
   override approved requirements from sources 1–4.

Rationale: without a fixed authority order, agents without chat-history access will guess, and
guesses on business/financial/authorization semantics are unacceptable per Principle XV.

### III. Database Authority

`docs/database/database-schema-report.json` is newer and more authoritative than any older SQL
snapshot (e.g., `supabase/trading_schema.sql`) where they disagree. Agents MUST NOT: redesign the
approved database casually, rename tables for stylistic reasons, replace database workflows with
frontend logic, simplify inventory or settlement flows, bypass RLS, remove constraints, or replace
transactional database logic with Redis. Any schema change requires, in order: (1) an explicit
approved requirement, (2) a migration, (3) a backward-compatibility review, (4) an authorization/
RLS review, (5) an integrity review, (6) a database audit/revalidation. Rationale: the database
baseline passed a formal GO/NO-GO audit (PASS, 0 issues); casual edits invalidate that audit
silently.

### IV. Locked Next.js Root Architecture

`src/app/page.tsx`, `src/app/layout.tsx`, and `src/app/globals.css` are LOCKED IN PLACE. Agents
MUST NOT relocate them, MUST NOT move the homepage into a route group merely to reorganize the
project, and MUST NOT replace the root App Router architecture without an explicitly approved
architecture decision recorded in a spec/plan. The homepage remains `src/app/page.tsx` at route
`/`. Rationale: root-file churn breaks continuity for agents working from repository state alone
and has no product benefit.

### V. Application Surface Separation

The platform has exactly three surfaces, each with a fixed root route and purpose:

- **Public Website** (`/`): SEO-optimized, low client-JS, publicly cacheable content — homepage,
  coffee, origins, sourcing, knowledge, reference pricing where approved, RFQ/commercial inquiry,
  membership entry, authentication entry.
- **Member Portal** (`/dashboard`): ONE portal for both Buyer and Seller organizations. Do NOT
  build separate Buyer/Seller applications. Seller capability is additive — seller modules
  (listings, sales, payouts) appear inside the same portal only for organizations with approved
  `can_sell`. UI visibility is never a substitute for server/database authorization.
- **Operations/Admin Console** (`/dashboard-admin`): a separate protected application with its own
  layout, navigation, authorization guards, and workflows for SUPER_ADMIN, ADMIN, COMPLIANCE,
  WAREHOUSE, FINANCE, and AUDITOR roles. Not every staff user is a universal admin — least
  privilege is preserved per role.

Rationale: conflating these surfaces reintroduces exactly the "public exchange" framing Principle
I forbids, and blurs authorization boundaries that must stay crisp per Principle VIII.

### VI. Buyer/Seller Capability Model

Buyer: `can_buy = true`, `can_sell = false`. Seller: `can_buy = true`, `can_sell = true`.
Registration alone never authorizes trading — trading requires the approved organization state and
KYB state defined by the database/SRS baseline. Client-side role checks are never sufficient by
themselves. Rationale: this is a compliance-load-bearing rule; any weakening enables unauthorized
trading.

### VII. Public vs. Private Data Boundary

Public visitors must never receive private trading data: member marketplace listings, member
inventory, ownership/custody positions, private warehouse operational data, orders, reservations,
payments, payouts, settlement records, private documents, KYB information, or member-specific
commercial information. Reference benchmark pricing, Hills executable/commercial quotes, member
resale listing prices, and executed trade prices are four conceptually distinct categories and
MUST NOT be merged in code, UI, or copy merely because all four are "a price." Rationale: pricing
conflation is a recurring source of both compliance risk and user confusion in B2B commodity
platforms.

### VIII. Server/Database-Side Authorization (NON-NEGOTIABLE)

Authorization MUST be enforced server-side and/or database-side. Hidden buttons, disabled form
fields, client-side role state, route menu visibility, and React conditionals are NEVER treated as
authorization. Every sensitive action must independently validate: authenticated user,
organization membership, organization status, user/account status, relevant role/capability, and
relevant business-state transition. RLS is an enforcement boundary and MUST NOT be disabled for
convenience. Rationale: this is the platform's core security invariant; any exception collapses
the trust model the entire trading product depends on.

### IX. Supabase/PostgreSQL Transactional Authority

Supabase/PostgreSQL is the authoritative transactional source of truth for organizations, KYB
authorization, inventory, warehouse custody, reservations, listings, orders, payments, settlement,
ownership, title transfer, payouts, delivery state, disputes, and audit history. Use approved
database functions/workflows where they exist; do not reproduce critical transaction logic
independently in application code. The Supabase service-role key MUST NEVER reach browser code.
Use `@supabase/supabase-js` and `@supabase/ssr` per their supported patterns for the installed
versions. Rationale: duplicating transactional logic in the application layer creates drift from
the audited database baseline.

### X. Inventory & Transactional Integrity

The approved database model's inventory positions, active reservations, listing reservations,
ownership events, storage allocations, partial fills, and settlement-driven title transfer rules
MUST be preserved. The approved atomic checkout/reservation flow must not be bypassed. UI
availability is advisory only — the database always performs the authoritative availability
check, and stale UI data must never cause overselling. Ownership transfers only after the approved
settlement condition; ownership events are append-only. Critical workflows must be retry-safe and
idempotent where designed. Rationale: overselling or premature title transfer is a direct
financial-integrity failure, not a cosmetic bug.

### XI. Next.js-Native Caching Only (No External Cache Infrastructure)

The current MVP architecture MUST NOT require Redis, Upstash, or any other separate cache
infrastructure. The application relies on Supabase/PostgreSQL (as the authoritative database,
Auth, and Storage provider) together with Next.js's own native caching and revalidation
mechanisms for the installed Next.js version — nothing more. Use Next.js caching selectively for
suitable read-heavy data: public coffee/catalog data, origins, public content, reference-price
presentation, repeated safe public queries, and other slow-changing read models. Caching remains
deliberate, not automatic. Inventory availability shown in the UI may be cached/read-optimized
where safe, but every transactional action MUST perform a fresh, authoritative PostgreSQL
validation regardless of what a cache shows. Cached data is NEVER authoritative for inventory
quantity, ownership, reservation state, checkout, orders, payments, settlement, title transfer,
KYB authorization, or delivery state. Never use unsafe shared/public caching for user-specific
data, organization-private data, KYB, private documents, order/payment details, settlement data,
or ownership information. Relevant mutations MUST revalidate/invalidate affected cached reads
using APIs supported by the installed Next.js version — do not copy deprecated caching patterns
from older Next.js releases. Rate limiting: do NOT introduce Redis solely for rate limiting;
prefer existing Supabase-native protections (especially Supabase Auth) where applicable, and add
application-specific abuse controls (RFQ, contact forms, uploads, search, or similar endpoints)
only when actually required, using infrastructure already available to the application. Do not
introduce a paid external infrastructure dependency solely for speculative future scaling. Redis
or another external cache MAY be reconsidered later, but only if: real measured load demonstrates
a need, Next.js caching/database optimization proves insufficient, there is a concrete operational
requirement, and cost/deployment impact are explicitly approved — it is NOT part of the current
MVP architecture. This amendment does not change any PostgreSQL transactional rule; Supabase/
PostgreSQL remains the sole authoritative source for transactional/business state. Rationale: an
unused cache layer is an unjustified paid dependency, an extra failure mode, and an extra
authorization-leakage surface; Next.js's native caching plus the already-audited Postgres baseline
are sufficient for MVP scale, and introducing external cache infrastructure is deferred until a
measured, approved need exists.

### XII. Rendering & Server Action Discipline

Use Server Components by default; minimize `"use client"` and never convert large page trees to
Client Components merely for convenience. Keep authentication, authorization, data loading,
protected business logic, and privileged mutations server-side. Every sensitive Server Action must:
validate input, authenticate, authorize (org/role/capability/state), call controlled data-layer/
database operations, handle failures safely, return safe errors, and never expose privileged
secrets — Server Actions do not replace database authorization. Use Zod for boundary validation and
React Hook Form for interactive client forms; client-side validation improves UX but never replaces
server/database validation. Use only caching APIs supported by the installed Next.js version;
invalidate affected safe read caches after mutations and avoid accidental global caching of private
data. Rationale: this keeps the security-critical path server-side and testable, consistent with
Principle VIII.

### XIII. Design System Fidelity

`docs/claude-design/` is the concrete Hills visual implementation reference;
`docs/design-guidance/Hills-Coffee-Website-Recommendations.md` governs section-level adaptation.
Approved UI stack: Tailwind CSS, shadcn/ui (used as editable source components, never left as
default shadcn styling), Base UI primitives, Lucide, Motion, GSAP, Lenis. Motion handles normal UI
transitions/reveals/hover/layout/micro-interactions; GSAP is reserved for complex timelines and
scroll storytelling with justification; Lenis is used only when smooth scrolling meaningfully
improves UX. Do not combine animation engines on the same interaction. Respect
`prefers-reduced-motion`; animation must never harm accessibility, usability, SEO, Core Web
Vitals, or load performance. External websites referenced in design guidance are inspiration only
— never copy their code, branding, layouts, text, photography, or distinctive identity. Where
design guidance conflicts with the SRS/database model, the approved business/database model wins;
visual inspiration never creates a new product requirement. Rationale: an unrestrained visual
identity or an inspiration-driven feature request can silently reintroduce scope or compliance
violations barred by Principles I and VII.

### XIV. Security & Secrets Handling

No secrets may be committed; use environment variables (e.g., Supabase credentials, and any future
integration credentials), documented but never committed with real values. Never log passwords, access/refresh tokens,
service-role keys, private KYB contents, sensitive financial data, or confidential documents.
Private uploaded documents (KYB, payment proof, commercial documents, dispute evidence, invoices)
must use controlled, authorization-checked access — never expose a private file URL merely because
the UI knows the object path. Sensitive features require negative-path security tests. Rationale:
this is a private financial platform handling KYB and payment data; secret or document leakage is
a compliance failure, not just a bug.

### XV. Spec-Driven Development Lifecycle & Ambiguity Rule

Substantial work follows the Spec Kit lifecycle: Constitution → Specify → Clarify → Plan → Tasks
→ Analyze → Implement → Converge (repeating Implement → Converge until genuinely converged). Do
not jump from a broad product request directly to uncontrolled implementation. Specs define WHAT
and WHY plus observable behavior, requirements, acceptance criteria, and scope — not low-level
implementation choices (those belong in plan.md). Plans must explicitly address architecture,
routes, server/client boundaries, database interaction, authorization, Next.js caching,
revalidation, Server Actions, validation, error/loading states, accessibility, responsive behavior,
testing, and security. Tasks must be implementation-sized and traceable, showing dependencies,
parallel-safe tasks, affected files/domains, and expected verification; a task is not complete
unless its work and required verification were actually performed. Agents MUST NEVER silently
guess when ambiguity materially affects financial behavior, permissions, RLS, organization roles,
KYB, inventory, custody, pricing semantics, payment, settlement, title transfer, legal/compliance,
or delivery ownership — such ambiguity MUST be surfaced during clarification or planning, not
resolved by assumption. Rationale: this is the mechanism that keeps the repository
self-continuable per the Preamble and prevents unrecoverable guesses on financially material
questions.

## Engineering Standards

**Code quality.** Use strict TypeScript; avoid `any` unless an external boundary genuinely
requires it, with the reason documented inline. Prefer small focused functions, clear names, and
domain boundaries. Avoid premature abstraction, unnecessary wrappers, giant components, duplicated
business logic, and speculative infrastructure. Keep shared shadcn primitives in `components/ui/`;
group domain components logically (e.g., `marketing/`, `coffee/`, `dashboard/`, `trading/`,
`inventory/`, `admin/`); do not place unrelated business logic inside large `page.tsx` files.

**Dependency discipline.** Before adding a dependency, determine why it is necessary, whether the
approved stack already solves the problem, and its client-bundle/server/maintenance/security
impact. Do not add dependencies merely because they are popular.

**Testing.** Every substantial feature plan defines appropriate unit, integration, authorization
(including negative-permission), state-transition, data-integrity, and end-to-end tests as
warranted. Critical transaction flows require explicit verification for unauthorized access,
concurrent requests, duplicate submissions, retry/idempotency, stale data, expired reservations,
reservation conflicts, insufficient inventory, partial fills, invalid state transitions, and
duplicate settlement/title transfer. A feature is not complete because its happy-path UI works.
The database baseline's audit PASS is not the same as application production readiness — actual
application/database interaction (RLS, functions) must still be integration-tested.

**Accessibility & responsiveness.** Interactive UI must support semantic markup, keyboard
navigation, labels, focus states, accessible forms, adequate contrast, appropriate ARIA usage, and
reduced-motion preferences from the start of implementation, not as a final pass. The Public
Website, Member Portal, and Admin Console must all be responsive; desktop-only screens are not
complete.

**Performance & SEO.** Public pages prioritize Core Web Vitals, optimized images, server
rendering, minimal unnecessary JavaScript, effective caching, and stable layout; use dynamic/lazy
loading for heavy optional interactions rather than shipping large libraries to every route.
Public discoverable content follows SRS SEO requirements; private portal routes must not become
indexable, and private marketplace data must never be exposed to create SEO content.

**Auditability & non-destructive data handling.** Critical actions preserve the approved audit
model: correlation IDs, idempotency, history tables, ownership events, status histories, and
dispute evidence must not be bypassed by direct UI-side mutation. Commercial, inventory, payment,
ownership, settlement, and audit data follow the approved non-destructive-deletion approach —
state transitions and history, not destructive client-accessible deletion.

**Production readiness.** Code completion never authorizes production trading by itself.
Production readiness remains gated by the SRS's legal approval, KYB policy, agreements, warehouse
reconciliation, finance/tax approval, market-data licensing, security review, backup/restore
validation, and end-to-end acceptance testing.

## Multi-Agent Continuity & Handoff

No critical project knowledge may exist only in chat history. Before changing code, an agent must
inspect: `.specify/memory/constitution.md`, the active `spec.md`, `plan.md`, and `tasks.md`,
relevant `docs/`, relevant existing code, `git status`, and the current diff where applicable.
Agents must not assume a previous agent finished work merely because code exists — verify actual
state. At any point, a future agent must be able to determine from repository artifacts and Git
state alone: the active feature, approved requirements, locked decisions, completed work,
remaining work, known issues, tests actually run, and validation actually performed. Historical
completed specs remain available and are not deleted when later work extends them.

Large features are implemented in bounded phases; avoid uncontrolled repository-wide rewrites.
After meaningful phases, run relevant lint, typecheck, tests, build, and security checks, and
resolve failures or explicitly document blockers before progressing. Inspect `git status` before
substantial work; do not silently overwrite unrelated user changes; avoid destructive Git
operations unless explicitly requested; commits represent understandable milestones where the
workflow calls for them. Every applicable feature plans for loading, empty, error, unauthorized,
suspended, rejected, stale, reserved, expired, partial-fill, unavailable, and retrying states, per
approved design references.

## Governance

This constitution supersedes conflicting ad hoc practices, prior undocumented conventions, and
individual agent preferences. It does not supersede the fixed source-of-truth order in Principle
II — the SRS and approved database baseline remain the authoritative business/data sources this
constitution exists to protect.

**Amendment procedure.** Amendments are made by editing this file directly, followed by a Sync
Impact Report (prepended as an HTML comment) recording the version change, modified/added/removed
sections, and any deferred TODOs. Amendments must not weaken, omit, or reinterpret the
locked rules concerning: source priority (Principle II); database authority (Principle III);
`src/app/page.tsx` and `src/app/layout.tsx` preservation (Principle IV); `/dashboard` and
`/dashboard-admin` architecture (Principle V); the Buyer/Seller capability model (Principle VI);
PostgreSQL transactional authority (Principle IX); the no-external-cache-infrastructure MVP
architecture (Principle XI); selective rate limiting without Redis (Principle XI); caching
isolation (Principle XI); server/database-side authorization and RLS (Principle VIII);
multi-agent continuity (Multi-Agent Continuity & Handoff); and the Spec Kit lifecycle
(Principle XV). Loosening any of these requires an explicit MAJOR version bump with recorded
rationale, not a routine edit.

**Versioning policy.** Semantic versioning applies to this constitution:
- **MAJOR** — backward-incompatible governance/principle removal or redefinition, including any
  loosening of the locked rules listed above.
- **MINOR** — a new principle or section added, or materially expanded guidance.
- **PATCH** — clarifications, wording, typo fixes, or non-semantic refinements.

**Compliance review.** Every spec, plan, and task set must be checked against this constitution
before implementation begins, and every implementation pass must be checked against it before
being marked complete. Where a plan or task set conflicts with a locked rule, the plan/task set is
corrected — this constitution is not reinterpreted to fit the plan.

**Version**: 2.0.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-09-07
