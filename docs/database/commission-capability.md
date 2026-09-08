# Commission Capability (Verified Database Behaviour)

**Status**: DATABASE CAPABILITY — **IMPLEMENTED** in the approved baseline.
**Verified against**: `docs/database/database-schema-report.json` (audit `database-final-audit.json`
= PASS / 0 issues), read directly from the current approved production database.
**Authority**: this document *describes* behaviour that already exists. The schema report remains
authoritative (Constitution Principle III); if the two disagree, the report wins and this file is the
thing to fix.

**Who consumes this**
| Concern | Owner |
|---|---|
| Commission calculation & snapshot | **The database** (`checkout_order`) — never reimplemented in application code |
| Financial workflow / presentation / payout surfacing | **Feature 008** — Payments, Settlement, Invoices & Payouts |
| Admin management UI for policies & tiers | **Feature 010** — Operations/Admin Console (PLANNED, not implemented) |
| Public website | **Nothing.** Commission configuration is private commercial data and must never appear on a public surface (Feature 002 §Cross-feature boundaries) |

---

## 1. Objects

| Object | Kind | Role |
|---|---|---|
| `public.commission_policies` | table | A named, dated, status-controlled commission policy |
| `public.commission_tiers` | table | Quantity bands belonging to one policy |
| `public.order_financials` | table | Per-order financial truth, including the commission **snapshot** |
| `public.payouts` | table | Member-seller payout amounts derived from the snapshot |
| `public.checkout_order(uuid)` | function | Selects the policy/tier and **writes the snapshot** |
| `public.admin_review_payment(uuid, boolean, text)` | function | Settlement; **reads the snapshot** to compute payouts |

### `commission_policies`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | NOT NULL |
| `status` | text | NOT NULL, default `ACTIVE`. CHECK: `DRAFT` \| `ACTIVE` \| `ARCHIVED` |
| `effective_from` | timestamptz | NOT NULL, default `now()` |
| `effective_until` | timestamptz | NULL = open-ended (no end date) |
| `created_by` | uuid | NOT NULL → `profiles(id)` |
| `created_at` | timestamptz | NOT NULL |

### `commission_tiers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `policy_id` | uuid | NOT NULL → `commission_policies(id)` **ON DELETE CASCADE** |
| `min_quantity_kg` | numeric | NOT NULL. CHECK `>= 0` |
| `max_quantity_kg` | numeric | NULL = open-ended top band. CHECK `NULL OR > min_quantity_kg` |
| `percentage` | numeric | NOT NULL. CHECK `>= 0 AND <= 100` |

**UNIQUE (`policy_id`, `min_quantity_kg`)** — one band per lower bound within a policy. Note the
database does **not** enforce that a policy's tiers are gapless or non-overlapping; only that each
lower bound is unique and each band is internally well-formed. Coverage is an operational
responsibility of whoever manages policies (Feature 010), and its absence is why
`COMMISSION-OPEN-01` (below) matters.

**Relationship**: one policy has many tiers; deleting a policy cascades its tiers.

---

## 2. Tier semantics — total-quantity, not progressive

`checkout_order` first computes the order's **total quantity** as the sum of `order_items.quantity_kg`
for the order, and its **base subtotal** as the sum of the line amounts.

It then selects **one** policy/tier pair:

- Policy must have `status = 'ACTIVE'`
- Policy must be in force at checkout time: `effective_from <= now()` **AND**
  (`effective_until IS NULL` **OR** `effective_until > now()`)
- Tier must match the **total** order quantity:
  - `min_quantity_kg <= total_quantity_kg` — **minimum is inclusive**
  - `max_quantity_kg IS NULL` **OR** `total_quantity_kg < max_quantity_kg` — **maximum is exclusive**
- Ordering / tie-break: most recent `effective_from` first, then highest matching `min_quantity_kg`
  first; exactly one row is taken.

### This is TOTAL-QUANTITY tiering, not marginal/progressive tiering

The single selected percentage is applied to the **whole** applicable base. It is **not** applied
band-by-band.

> **Worked example.** Policy with tiers `0–100 kg = X%` and `100–250 kg = Y%`.
> A **200 kg** order selects the `100–250 kg` band and uses **Y%** for the entire applicable base.
> It does **not** charge X% on the first 100 kg and Y% on the next 100 kg.

Boundary behaviour follows directly from inclusive-min / exclusive-max:

| Total quantity | Band selected (tiers `0–100`, `100–250`, `250–NULL`) |
|---|---|
| 0 kg | `0–100` |
| 99.999 kg | `0–100` |
| **100 kg** | **`100–250`** (100 is excluded from the lower band, included in the upper) |
| 249.999 kg | `100–250` |
| **250 kg** | **`250–NULL`** |
| 10 000 kg | `250–NULL` (open-ended top band has no upper limit) |

---

## 3. Effective-date semantics

- A policy is eligible only while `effective_from <= now() < effective_until` (or forever, when
  `effective_until IS NULL`).
- Eligibility is evaluated **at checkout time**, against `now()` at that moment — not at order
  creation, not at payment, not at settlement.
- Overlapping active policies are not prevented by the schema. If two are simultaneously in force,
  the one with the **later `effective_from`** wins. Feature 010's UI should make overlap visible
  rather than relying on this tie-break as a design feature.

---

## 4. Mutation ownership — SUPER_ADMIN only

RLS on both tables:

| Table | Policy | Command | Predicate |
|---|---|---|---|
| `commission_policies` | `commission_admin` | ALL | `is_super_admin()` (USING **and** WITH CHECK) |
| `commission_tiers` | `tiers_admin` | ALL | `is_super_admin()` (USING **and** WITH CHECK) |

Consequences:

- `ADMIN` is **not** sufficient — `is_super_admin()` is strictly narrower than `is_platform_admin()`.
- There is **no** member-facing or public read path. Neither table is in the publicly readable set
  (see `DATABASE-CAPABILITY-MAP.md` §4).
- Any UI managing these tables must enforce the same rule **server-side in the application as well
  as relying on RLS** (Constitution Principle VIII, defence in depth). RLS must not be weakened to
  make a console screen convenient.

---

## 5. Snapshot at checkout — where commission becomes immutable

`checkout_order` writes financial truth into `order_financials` (PK `order_id`). The
commission-relevant fields are:

| Field | Meaning |
|---|---|
| `total_quantity_kg` | The total quantity the tier decision was based on |
| `commission_policy_id` | FK to the policy that was in force **at that moment** (nullable) |
| `commission_percentage_snapshot` | The tier percentage actually applied (nullable in schema; written as a concrete number) |
| `commission_amount` | The money amount, `round(base_subtotal * rate / 100, 2)` |
| `seller_net_amount` | `base_subtotal - commission_amount` |
| `base_subtotal` | The base the commission was computed on |
| `calculated_at` | When the snapshot was taken |

Two properties matter downstream:

1. **The commission base is the order's base subtotal** — shipping and VAT are separate fields and
   are not part of the commission base.
2. **`checkout_order` is idempotent.** A retried checkout on an order already in
   `HOLD`/`PAYMENT_PROOF_SUBMITTED`/`PAYMENT_UNDER_REVIEW` with an ACTIVE reservation returns the
   existing result rather than re-snapshotting. Feature 008/007 must not add an application-level
   path that forces a re-snapshot.

---

## 6. Settlement and payout use the snapshot — never the current tier

`admin_review_payment(payment_id, approved, reason)` reads
`order_financials.commission_percentage_snapshot` for the order and, for every order item whose
`seller_type_snapshot` is `MEMBER_SELLER`:

- computes the line base from the reserved quantity × the snapshotted unit price,
- computes the line commission from the **snapshotted percentage**,
- inserts/accumulates a `payouts` row of `line_base - line_commission` for that seller organization
  (`UNIQUE (order_id, seller_organization_id)`, accumulated via upsert across the order's lines).

It does **not** re-read `commission_policies`/`commission_tiers`. There is no settlement-time
recalculation path anywhere in the approved baseline.

`HILLS`-sourced lines produce no payout row — payouts exist only for member sellers.

---

## 7. Historical immutability — the rule this capability imposes

**Changing a commission policy or tier affects eligible FUTURE checkouts only.**

A later edit — activating a new policy, archiving one, editing a tier percentage, changing an
effective date — MUST NOT change:

- previous `order_financials` rows,
- historical `commission_amount` values,
- previous `seller_net_amount` values,
- existing `payouts`.

This is a property of the design (snapshot at checkout + settlement reads the snapshot), and it is
what makes historical commercial records auditable and defensible. Therefore:

- No feature may add a "recalculate historical orders" action as a normal operation.
- No feature may recompute commission from current tiers when displaying a historical order.
- Feature 008 displays the snapshot; Feature 010 edits the configuration. Neither crosses over.
- Any genuine correction of a historical financial record is an exceptional, separately-approved
  process — not a UI button, and outside the scope of features 002–012 as currently planned.

---

## 8. Open decision — `COMMISSION-OPEN-01`

**Status**: OPEN — requires a **Business/Finance decision before production trading**. Not a code
defect to be silently "fixed", and **no database change is proposed here**.

**Observed behaviour**: `checkout_order` initialises the commission rate to zero and coalesces to
zero when the tier lookup matches nothing. If no ACTIVE, in-force policy has a tier band covering
the order's total quantity, checkout still succeeds and records:

- `commission_percentage_snapshot = 0`
- `commission_amount = 0`
- `seller_net_amount = base_subtotal` (the seller is paid the entire base)

Because the schema does not enforce gapless tier coverage (§1), a configuration gap — or simply no
active policy at all — silently yields **0% commission** rather than an error.

**The question, for MEMBER_SELLER checkout:**

- **Option A** — Explicitly allow 0% commission when no tier matches (treat "no policy" as "no
  commission"), and make that intent visible in the admin UI.
- **Option B** — Fail closed with a commission-configuration error, refusing checkout until a
  covering tier exists.

**This document does not choose.** Both options are defensible and the choice has direct revenue
consequences. Record the decision through the Constitution's process before production trading; if
Option B is chosen it implies a database change, which must then go through the approved
database-change process.

**Ownership**: Feature 008 / Business-Finance. This is **not** a Feature 002 concern and must not
block Feature 002 implementation.

---

## 9. What application code must never do

- Never recompute a commission percentage or amount in TypeScript.
- Never read `commission_policies`/`commission_tiers` to display or derive a historical order's
  commission — read `order_financials`' snapshot fields.
- Never expose commission configuration, rates or per-order commission snapshots on a public
  surface.
- Never call `checkout_order` a second time to "refresh" pricing.
- Never weaken the `is_super_admin()` RLS predicate to simplify an admin screen.
