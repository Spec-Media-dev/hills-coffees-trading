# Tasks: Operations / Admin Console (010)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §14 (OPS-01, OPS-02), §3.1, §13.5.

**Status**: **Final non-payment closure run (2026-09-23) — 50 / 59.** Phase 18 ADDED (T059 fixtures + test taxonomy, COMPLETE). Still open: T013–T015, T031–T033 (Feature 008-dependent), T038, T041, T056 (tag migration awaiting reviewed apply).
**Previous status**: **Pre-Stripe UX / localization / catalogue hardening run (2026-09-24) — 49 / 58.** Phase 17 ADDED
(T056–T058, approved post-closure scope additions). T057 (admin bilingual editing UX + label/media fixes) and T058
(listing media display rule) COMPLETE. T056 (tag translations) is CODE-COMPLETE but **blocked on human review +
application of `supabase/migrations/20260924120000_tag_translations.sql`** (+ rollback + postflight) — NOT applied by
this run; until then the tag Arabic panel reports "unavailable" and public tags stay English (marked `lang="en"`).
Remaining open: T013–T015, T031–T033 (Feature 008 / Stripe-dependent), T038, T041 (Phase 12 sign-off), T056.
**Previous status**: **Catalogue media & Arabic translations live verification run (2026-09-23) — 47 / 55.** Migration
`supabase/migrations/20260923120000_catalogue_media_and_translations.sql` applied, postflight 12/12 passed.
T053 (catalogue coffee images) and T054 (Arabic catalogue content) COMPLETE and verified live end-to-end
against production Supabase (27/27 live checks passed). Remaining open tasks (8/55): T013–T015, T031–T033
(blocked by Feature 008 finance/payments) and T038, T041 (Phase 12 final integration/sign-off).
**Previous status**: **Account/media approved scope run (2026-09-22, RUN F010-ACCOUNT-MEDIA) — 41 / 51.
T047 COMPLETE (platform logo), T048 COMPLETE (Admin/Super Admin sign-in email change), T050/T051
ADDED (Phase 15, approved scope additions — avatar upload for every role; seller-owned listing media)
and COMPLETE.** One new migration, `supabase/migrations/20260922130000_feature_010_branding_avatar_
listing_media.sql` (+ rollback + postflight), **NOT applied** — every RPC this run adds
(`set_my_avatar`, `remove_my_avatar`, `set_platform_logo`, `remove_platform_logo`,
`attach_offer_media`, `remove_offer_media`, `set_primary_offer_media`, `reorder_offer_media`) is real,
tested where testable without it, and honestly blocked on human review + application otherwise.
Password change (every role) and a read-only sign-in email display (Buyer/Seller) shipped alongside
T048 as part of the SAME shared account-security work, needing no migration at all (Supabase Auth
only) — live-testable today, proven in `tests/auth/account-security.test.ts` (10/10). Remaining
closure blockers unchanged from before this run (below), plus the new migration's own review/apply
step.
**Price-administration run (2026-09-21) — 37 / 49. T049 ADDED (Phase 14, the Master Audit found no task
owning price administration) and COMPLETE**: minimal platform-ADMIN reference-price administration under
`/dashboard-admin/prices`; every successful mutation calls Feature 011's `revalidateReferencePrices()`, proven against a
running production server. No migration. Unblocks Feature 011 T013. Remaining closure blockers unchanged (below).
**Database hygiene M1 (2026-09-20) — 36 / 48. T027 and T029 COMPLETE; DB-OPEN-21 RESOLVED.** Human-approved
migration `supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql` (applied with `supabase db push --linked`; postflight 15/15 ok incl. function ownership)
gives every configuration table a DB-owned `updated_at` and an attributed audit trail (`audit_logs`, actor = `auth.uid()`);
`payment_accounts` is audited with a REDACTED payload; `platform_admins` through a `user_id`-keyed sibling function.
Live proof `tests/admin/config-attribution-live.test.ts` 10/10. `AttributionGapNotice` removed. Remaining closure blockers:
T013–T015/T031/T032 (Feature 008), T033 (Phases 3–9 — only T013–T015 still open), T047/T048, and therefore T038–T041.
**RUN J (2026-09-19) — 34 / 48.** **T010 COMPLETE**: human-approved migration
`supabase/migrations/20260919130000_feature_010_db_open_22_compliance_organization_read.sql` (applied in the SQL Editor; postflight 12/12 ok) extends `organizations_member_select`
with `OR is_compliance_operator()` and adds `trg_organizations_compliance_guard` (a compliance operator who is not a
platform admin may change only `status`, only along the console's own transitions). Pure COMPLIANCE suspension /
reinstatement is live-proven end to end. DB-OPEN-22 is **partially resolved** (organizations half); its
`file_assets` (KYB evidence bytes) and `account_status_history` halves stay OPEN. T033 still PARTIAL (T013–T015,
T027, T029 open). Remaining closure blockers: T013–T015/T031/T032 (Feature 008), T027/T029 (DB-OPEN-21), T033,
T047/T048, and therefore T038–T041.
**Dispute-unblock run (2026-09-19) — 33 / 48.** Feature 012 closed (28/28; DB-OPEN-23 resolved by the
database-authoritative `transition_dispute()` + append-only `dispute_status_history`). **T012 COMPLETE** — the
Compliance dispute review surface (`/dashboard-admin/disputes` queue + `/[disputeId]` detail, `recordDisputeTransition`
Server Action) composes ONLY Feature 012's layer; live + Chrome/axe proven. **T032** — dispute half now proven live
through the console; the task stays OPEN on `Depends: T014` (Feature 008 `decidePayment()`). **T033** — still PARTIAL
(Phases 3–9 not closed: T010, T013–T015, T027, T029); its dispute coverage is added. DB-OPEN-09 unchanged (no freeze
path anywhere). Remaining closure blockers: T010 (DB-OPEN-22), T013–T015/T031/T032 (Feature 008), T027/T029
(DB-OPEN-21), T033 (Phases 3–9), T047/T048, and therefore T038–T041.
**RUN H complete (2026-09-17) — Phase 11 T036, T037 RECORDED; Phase 12 T038–T041 VERIFIED (typecheck/build/diff-check exit 0; lint at baseline; tests 1666/1672 exit 0 after the Feature 009 stale-assertion repair) /
PROVEN / RECONCILED but NOT closable on their literal dependencies; 32 / 48.** T036 (state coverage —
`tests/admin/state-coverage.test.tsx`, 14 tests: every list page owns an honest `empty` AND `error` state,
all 16 detail pages render `not-found` for nil/malformed ids, unauthorized/forbidden/no-operational-role are
three distinct live outcomes, blocked 008/012 areas stay placeholders, the route `error.tsx` never prints the
raw error; FIX: Feature 010 reads no longer swallow PostgREST errors into empty lists — they throw internal
`_read_failed` codes and the pages render the error card; organizations distinguishes `error` from the RLS
`capability-gap`) and T037 (real Chrome + axe over 33 surfaces × 6 appearances = 198 renders, 0 violations,
EN/AR × light/dark × 390/1366/1920, one `<main>`, no overflow, text-labelled badges, keyboard row focus ring,
mobile drawer open/Escape/focus-restore, exact-field validation association on catalogue AND compliance
forms, keyboard-accessible `alertdialog` cancelled without a write; physical-CSS grep over the whole console
returns nothing — `tests/admin/console-a11y-pins.test.ts`; FIX: the console shell's member refusal was
English-only under `lang="ar"` → bilingual `AdminStateCard`). **Phase 12**: T038 commands — lint exit 1 at
the exact 273/124/149 `docs/claude-design` baseline (0 findings in any 010 file), typecheck exit 0,
`npm test` 1665/1672 passed at RUN H time with the recorded pre-existing Feature 009 failure (`tests/delivery/t013-live-proof.test.ts`); that stale assertion was repaired the same day (test-only change, scoped to the `T013_DELIVERY_ADMIN_FIXTURE` block, no production/010/DB change) and `npm test` now runs **149 files: 147 passed, 2 skipped; 1672 tests: 1666 passed, 0 failed, 6 skipped; `TEST_EXIT=0`**. `npm run build` exit 0, `git diff --check` exit 0 — recorded as readiness proof (still NOT four exit-0 results: `npm run lint` exits 1 on the pre-existing repo baseline, unchanged), **T038 stays unchecked
because `Depends: all` is unmet** (T010, T012–T015, T027, T029, T031–T033, T047, T048 open); T039 proof
recorded (`tests/admin/surface-separation.test.tsx`, 4 live tests: member refused by the shell and all 22
areas; operators without an organization refused by `/dashboard` and its marketplace guard); T040 proof
recorded (no `SERVICE_ROLE` in console code, no console cache, public catalogue cache separate); T041
reconciled (roadmap 010 row rewritten honestly; DB-OPEN-22 and SUSPEND-OPEN-01 classified in the capability
map; nothing converted to resolved; DB-BLOCK-07 still resolved by 009) — T039/T040/T041 stay unchecked on
`Depends: T038`. Disposable fixtures (SUPER_ADMIN, ADMIN) de-privileged after every live run
(`activeCapability: false`); listing-review fixture reset to PENDING_REVIEW; no DB/RLS/grant/trigger change;
no service-role path; no hard delete; no commit. **Feature 010 final closure is prevented by**: T010
(DB-OPEN-22), T012/T032 (Feature 012 + DB-OPEN-09), T013–T015/T031 (Feature 008 finance layer), T027/T029
(DB-OPEN-21, decision D2 ii), T033 (Phases 3–9 not all closed), T047/T048 (no approved branding storage /
email-change flow), and therefore T038–T041. **RUN G complete (2026-09-17) — Phase 10: T030, T034, T035 RECORDED; T031, T032, T033
PARTIAL/BLOCKED on their literal dependencies; 30 / 48.** Six new dedicated Phase 10 test files (66
live/static tests, all green): `tests/admin/access-matrix.test.tsx` (T030 — extended from two live
role fixtures to ALL SIX, full `ADMIN_AREAS` iteration per role incl. the DB's own hierarchy
(`is_compliance_operator`/`is_warehouse_operator`/`is_finance_operator`/`is_auditor` true for their
own role AND ADMIN/SUPER_ADMIN, `is_platform_admin` true for ADMIN/SUPER_ADMIN, `is_super_admin`
SUPER_ADMIN only — verified against the live function bodies), a "missing matrix entry" meta-test,
and a live cross-role "direct action invocation" block proving four representative mutating domain
functions refuse every non-owning role — not merely the page guard), `tests/admin/delegation.test.ts`
(T031 — no `admin_review_payment`/`submit_payment_proof` reference and no raw shipment/inventory
write anywhere in the console; confirms `decidePayment()` is still absent from Feature 008),
`tests/admin/decisions.test.ts` (T032 — KYB and listing decisions proven live incl. a two-operator
concurrency race for each; payment/dispute decisions proven HONESTLY ABSENT, not fabricated),
`tests/admin/no-hard-delete.test.ts` (T033 — zero `.delete()` calls in the current console; every
table the console's own code references carries no DELETE grant for `authenticated`/`anon`, derived
dynamically from the code, not a hand-maintained list; explicitly records that T010/T012/T013–T015/
T027/T029 remain open so full Phase 3–9 coverage is not claimed), `tests/admin/
catalogue-revalidation.test.tsx` (T034 — independently re-proves the T023 public-cache contract:
DRAFT not public → publish → Feature 002 public read + anonymous RLS row both flip → second publish
STALE → unpublish → both flip back → a raw anonymous write is refused → no path-purge substitute, no
shared cache), `tests/admin/auditor-readonly.test.tsx` (T035 — independently re-proves T025/T026:
zero mutation affordances render, six distinct domain mutation paths refuse AUDITOR live, a raw
table write affects zero rows, DB-OPEN-06 is honestly stated and its policy is unchanged in every
migration). **T031 stays BLOCKED** — its literal `Depends: T014` is unmet (Feature 008 still has no
`decidePayment()`, re-confirmed this run); the structural guarantee is proven and strengthened, but a
currently-empty settlement surface is not a proven delegation. **T032 stays BLOCKED** — its literal
`Depends: T014` is unmet, and dispute decisions have no domain to test (T012/Feature 012 not
started); KYB and listing halves are fully proven, payment and dispute halves are proven absent, no
fabrication occurred. **T033 stays PARTIAL** — its literal `Depends: Phases 3–9` is not fully
satisfied (T010, T012, T013–T015, T027, T029 remain open/blocked/partial), so exhaustive Phase 3–9
coverage cannot be honestly claimed even though the current-console proof (the only proof possible
today) passes cleanly. No delete path was introduced anywhere merely to give a test something to
check. **RUN F complete (2026-09-17) — Phase 9: T028, T042, T043, T044, T045 RECORDED; T027 and
T029 PARTIAL (decision D2 ii — UPDATE actor attribution is not persisted by the approved schema);
27 / 48.** Approved decisions: D1 (Feature 008's `tests/finance/rls-policy.test.ts` T005 narrowed so
Feature 010's admin-only payment-account owners — `lib/admin/payment-accounts.ts`,
`lib/admin/system-validation.ts`, `(system)/payment-accounts/**`, `components/admin/system/fields.ts`,
the copy files — are the ONLY permitted callers; every member/public/finance root stays audited and
`lib/finance` is pinned to contain no `payment_accounts` operation), D2 option (ii), H1 (disposable
`super-admin+t027-test@example.com`, role exactly SUPER_ADMIN, seed-script lifecycle, de-privileged
after every run — it is the only identity that can pass `is_super_admin()`: none existed live and
`platform_admins` is writable solely by a super admin, so the seed-time service-role creation is the
bootstrap, never a product path). **Built (no schema/RLS/grant/trigger/migration change; no service
role in product code):** `lib/admin/system-validation.ts` (CHECK vocabularies verbatim — roles,
DRAFT/ACTIVE/ARCHIVED, taxable bases, USD-only currency; tier/rate/fee bounds), `system-errors.ts`
(`requireSuperAdmin` / `requirePlatformAdmin` BEFORE `createClient()` on every path; SQLSTATE-only
mapping), `roles.ts` (T027: list/grant/change/activity, compare-and-set, self-change refused,
`created_by` on grant), `commission.ts` (T042–T045: reads/writes ONLY `commission_policies` /
`commission_tiers`; new policy = DRAFT; status only via activate/deactivate/archive/restore;
`evaluateTierCoverage` = `checkout_order`'s `min <= qty < max`, NULL open-ended; `resolveInForce`
= latest `effective_from` wins), `pricing-rules.ts` (T028: tax + shipping; `resolveInForceTaxRule`
mirrors checkout; `SHIPPING_RULES_CONSUMED_BY_CHECKOUT = false` — no function or app path reads
`shipping_rules`, verified across every migration and `lib/`), `payment-accounts.ts` (T029: read
`is_platform_admin()`, write `is_super_admin()` = the DB `WITH CHECK`; masked identifiers in lists;
no member path), the `(system)` routes (roles + new + [userId]; commission + new + [policyId];
tax/shipping + new + [ruleId]; payment-accounts + new + [accountId]), `components/admin/system/*`
(notices: future-only, attribution gap, high-risk + OPS-01, shipping-unconsumed; role panels;
status panel; coverage panel), `RecordForm` generalised (`resource: "system"`, number/datetime
kinds), EN + AR copy incl. the six mandated commission semantics, `lib/admin/areas.ts` → five system
areas `live`. **Defect found and fixed on the way:** the `checkbox` zod contract (RUN E + RUN F)
required the key to be present, but an unchecked HTML checkbox is absent from FormData — deactivating
a warehouse/rule through the browser would have failed validation; now optional (absent = false).
**Evidence:** `tests/admin/run-f-static.test.tsx` (16 green: CHECK vocabularies vs the schema report,
the six RLS policies exactly as reported + no migration touching the six tables, no service role/
cache/delete/foreign table, per-path `is_super_admin()` counts, T044 grep pin over
`src/app/dashboard-admin`, coverage rule incl. the literal `0–100` + `250–NULL` → `100–250` case,
COMMISSION-OPEN-01 cited, T029 masking/OPS-01/no member path); `tests/admin/run-f-live.test.tsx`
(10 green with REAL sessions: ADMIN, COMPLIANCE, WAREHOUSE, FINANCE, AUDITOR and a plain member each
refused by direct action (`system_not_capable`) AND by direct URL on commission/roles/tax/shipping,
anonymous unauthenticated, the ADMIN's raw `commission_policies` insert refused by RLS (42501);
T027: grant COMPLIANCE to the `no-organization` fixture with `created_by` = super admin and the
target's own `is_compliance_operator()` flipping true → change to AUDITOR once (stale repeat
refused) → `is_auditor()` true → deactivate → false; self-deactivation refused; ADMIN raw update
affects 0 rows; T042: 2099-dated policy DRAFT, bands 0–100/250–NULL, duplicate min (23505),
max ≤ min and 150% refused, page shows `100–250` gap + COMMISSION-OPEN-01 + future-only, tier edit
persists, activate once / stale repeat / deactivate / archive / restore, never in force, invisible
to ADMIN/FINANCE; T044: every `order_financials` snapshot readable by FINANCE byte-identical across
the commission mutations; T028: ZZ tax rule inactive/2099 created, edited, duplicate key + bad rate
refused, the real AE VAT rule still the in-force one and byte-identical, ZZ shipping rule created/
edited with USD-only enforced, unconsumed notice rendered; T029: ADMIN lists (masked) but its
create is refused in-app AND by RLS, SUPER_ADMIN creates/edits with `created_by`, member/FINANCE
null, anonymous redirected, ADMIN page shows the read-only + OPS-01 + high-risk statements and no
"new" link) and `tests/browser/feature010-runf.browser.mjs` (real Chrome + axe: 45 surfaces = 9
pages × EN/AR × light/dark × 390/1366/1920, ZERO violations, one <main>, no overflow, no raw error,
all six semantics rendered; ADMIN refused by URL on 7 super-admin routes and read-only on payment
accounts; a policy CREATED through the UI + two bands → gap warning; inline max ≤ min validation on
the exact field; activation confirmation with the future-only text cancelled → still DRAFT; keyboard
ring `solid 2px`). All rows removed (`--cleanup-run-f-config-rows`) and every disposable fixture
de-privileged after every run (`activeCapability: false`). **T027 / T029 PARTIAL — the exact
minimum DB change for later approval (NOT applied):** attach the EXISTING `write_audit_log()`
trigger (the same mechanism already on `coffees`, `orders`, `organizations`, `kyb_applications`,
…) to `platform_admins`, `commission_policies`, `commission_tiers`, `tax_rules`, `shipping_rules` and
`payment_accounts` — `CREATE TRIGGER trg_audit_<table> AFTER INSERT OR UPDATE OR DELETE ON
public.<table> FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();` — no new column, no new
function; alternatively an `updated_by uuid REFERENCES profiles(id)` column on `platform_admins` and
`payment_accounts` written by the console. Until one lands, a GRANT/CREATE is attributed
(`created_by`) and a role change, deactivation or account edit is not persisted with its actor;
the console states this on every affected page (`AttributionGapNotice`). **Preserved gaps:**
COMMISSION-OPEN-01 (displayed, not decided; no fallback, no checkout block; commission is live at
0% today — zero policies exist), OPS-01 (stated in-product; no maker-checker simulated),
`shipping_rules` unconsumed by any checkout/shipment path, `payment_accounts` write = SUPER_ADMIN
by DB policy while the area is `is_platform_admin()`, no SUPER_ADMIN exists in production data
(bootstrap is an operational seed act), T010/T012/T013–T015/DB-OPEN-06/DB-BLOCK-01/COMPLIANCE
`file_assets` gap/DB-OPEN-19/suspended-organization policy/T047/T048 unchanged.
**RUN E complete (2026-09-16) — Phases 7–8 T021–T026 RECORDED; 22 / 48.** The RUN E WIP
checkpoint (`9afaecb`, interrupted mid-implementation on another machine) was audited file-by-file
on a second machine, its defects fixed, the missing KYB reviewer wiring finished, and everything
then LIVE- and BROWSER-proven. **Defects inherited from the WIP and fixed:** (1) all five catalogue
CREATE pages handed the client `RecordForm` a FUNCTION prop (`successHref={(id) => …}` — the RUN B
runtime-crash class) → serialisable `successHrefTemplate`; (2) the KYB reviewer UI was NOT wired
(copy/helpers only) → `recordKybDocumentOutcome` action, `KybDocumentReviewPanel`
(ACCEPTED/REJECTED through `create_kyb_review`, reason required on rejection, bytes-not-opened
warning), review-progress summary (counts/blockers/next action from `evaluateKybApprovalReadiness`
on persisted rows), version/replacement/superseded statements, "View document" only when THIS role
can locate the file record, decision panel drops APPROVED while blocked and maps
`KYB_APPROVAL_BLOCKED`; (3) the document byte route was left mid-edit on its CSP → completed
(`default-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`, nosniff,
no-referrer, same-origin CORP, X-Frame-Options, private no-store, empty 404 on every refusal; no
`sandbox`, which breaks Chrome's PDF viewer); (4) `warehouses.owner_organization_id` is NOT NULL
in the approved schema but the WIP contract had it optional (a create without owner would have been
a 23502 → generic failure) → required; (5) `warehouses.country_code` is NULLABLE but the WIP read
did `.trim()` on it unguarded → the warehouses list rendered "Could not load this view" for a real
row (caught by the browser proof) → nullable end-to-end; (6) useless regex escape in
`kyb-documents.ts`; (7) the RUN E proof coffee (`…0044`) had never been seeded and no media record
existed → `--reset-run-e-catalogue-fixture` is an idempotent upsert of the proof coffee + ONE
metadata-only `file_assets`/`coffee_media` record (`…0045`/`…0046`, no bytes, no bucket claimed);
(8) the disposable catalogue-ADMIN and AUDITOR fixtures had been left ACTIVE by the interrupted
session → de-privileged; (9) RUN D's `warehouse-operations.test.ts` used POSIX-only paths (scanned
zero files / ENOENT on Windows) → normalised (18/18, now really scanning). **Environment blocker
resolved on this machine (no reseed):** the shared `TEST_FIXTURE_PASSWORD` had been rotated on the
unavailable machine; the 12 standing `+foundation-test` Auth users were re-pointed at this
machine's `.env.local` value through a one-off, password-only `auth.admin.updateUserById` script
(deleted afterwards) — no table, schema, policy or business row touched; `npm run test:seed` NOT
run. **Evidence:** `tests/admin/run-e-static.test.tsx` (25 green), `tests/admin/run-e-live.test.tsx`
(13 green with REAL sessions: disposable ADMIN creates/edits/publishes/unpublishes/archives/
restores; WAREHOUSE/FINANCE/COMPLIANCE/AUDITOR/member/anonymous refused by action AND by URL;
publish → Feature 002 public read returns the coffee and the anonymous RLS read sees it, second
publish STALE, unpublish → null; exact tags `public-coffees` + `public-coffee:<slug>` with
`{ expire: 0 }`; region → origin (bad status refused, INACTIVE not public, ACTIVE public,
self-parent refused) → tag → warehouse + location → deactivated warehouse hidden from member reads;
media record set primary / reordered on a real row, FINANCE refused; AUDITOR reads listings +
positions, refused by `decideListing`/`decideKybApplication`/`transitionCoffee` and a direct
`coffee_offers` write affects zero rows, audit pages render zero mutation controls, `audit_logs`
live zero-row read → DB-OPEN-06 statement, member/anonymous refused; KYB: missing evidence blocks
APPROVED with no status change/no review row, staged PENDING/REJECTED/EXPIRED TRADE_LICENSE each
block APPROVED and the page shows the same blocker while APPROVED is not offered, ACCEPTED current
evidence → APPROVED recorded; rejection without reason = field error, already-ACCEPTED document =
STALE with no ledger write, a staged PENDING document ACCEPTED through `create_kyb_review` with the
reviewer's identity appended and prior rows intact, FINANCE refused; COMPLIANCE `unlocatable` →
empty 404, FINANCE `forbidden` → empty 404, page shows the gap statement and no View link) and
`tests/browser/feature010-rune.browser.mjs` (real Chrome + axe: 70 surfaces = 14 pages × EN/AR ×
light/dark × 390/1366/1920, ZERO axe violations, one <main>, no overflow, no raw error; FINANCE
refused by direct URL on 7 catalogue/audit routes; inline validation on the exact field; publication
confirmation cancelled with no write; keyboard focus ring `solid 2px`; AUDITOR pages 0 mutation
controls; KYB detail readiness summary + 5 gap statements + 0 View links for pure COMPLIANCE;
**public-cache round trip against the running server: 404 → publish → 200 → unpublish → 404**).
All three disposable fixtures de-privileged after every run (`activeCapability: false`). **KYB
REVIEWABILITY GAP (unchanged, restated from the CURRENT policy set):** `kyb_documents` is readable by
COMPLIANCE and ADMIN; the bytes' location is `file_assets.object_path`, whose only policy
(`catalog_admin_files`: `is_platform_admin() OR uploaded_by = auth.uid() OR is_org_member(...)`)
excludes a pure COMPLIANCE role, while `storage.objects` (`kyb_storage_object_authorized`) would
admit it — so a platform ADMIN can locate and stream a file, a pure COMPLIANCE operator cannot
(live-proven: `readKybDocumentFile` → `unlocatable` → empty 404; the page shows the gap statement,
never a broken View button). Final KYB decisions REMAIN possible for COMPLIANCE while bytes are
inaccessible (the panel warns the reviewer to record an outcome only if the evidence was reviewed
through another approved channel). Minimum safe option (NOT applied — no policy change in this
run): a SELECT-only policy on `file_assets` for `is_compliance_operator()` scoped to rows referenced
by `kyb_documents.file_asset_id` (or a SECURITY DEFINER read model returning bucket/path for a
`kyb_documents.id` under the same guard). **REJECTED vs RESUBMISSION_REQUIRED:** the current domain
contract defines only the transitions and the reason requirement; no further business criterion
separates them — recorded as a business decision gap (the panel copy says so; nothing inferred).
**T025 note:** the "BLOCKED — 012 audit/history domain layer absent" prefix is superseded for the
read-only views (composed from auditor-readable listings/status-history/custody reads); no unified
timeline and no Feature 012 substitute was built. **T026 closed on its honest-gap branch:** DB-OPEN-06
stays open (`audit_admin_read = is_platform_admin()` only, re-checked). Test-only seed helpers added:
`--cleanup-run-e-created-rows`, `--stage-complete-draft-document=PENDING|REJECTED|EXPIRED|ACCEPTED`
(restored by `--reset-complete-draft-application`).
**RUN D complete (2026-09-16) — Phase 6 T016–T020 RECORDED; 16 / 48.** RUN D built the
Warehouse console as a pure orchestration layer: `lib/admin/warehouse.ts` (queues over Feature 009's
`getShipmentsForWarehouseQueue`; an operation map pinned byte-for-byte to `lib/delivery/warehouse.ts`'s
own `fromStatuses`/targets and to `SHIPMENT_TRANSITIONS`; `executeWarehouseOperation` /
`recordWarehouseDelivery` = console guard → Feature 009 input contract → the SAME-named Feature 009
function → re-read), Feature 005 read-model warehouse-oversight variants (`lib/inventory/positions.ts`,
`lib/inventory/allocations.ts` — same DTOs/mappers, cross-org by RLS), the `(warehouse)/shipments`
queue + `[shipmentId]` detail (operations panel via RUN B's `DecisionForm`, delivered-quantity form)
and `(warehouse)/inventory` + `[positionId]` (positions / allocations, "On hand (gross)" / "Reserved",
no computed third figure, T020 gap notice). Zero raw shipment/inventory writes in the console
(test-pinned), no DB change, no service role, no cache. T020 closed on its recorded-gap branch:
NO variance / reconciliation / HOLD / QUARANTINE model exists (DB-OPEN-19, AC-05 stays release-
blocking). Two RUN D live-read findings recorded (not fixed): a pure WAREHOUSE role has no read path
to `orders`/`order_items`/`organizations`/`coffee_lots` (order code, item names, owner names and lot
codes degrade to identifiers with an in-product note — DB-OPEN-20); and `inventory_warehouse_write`
would permit a raw warehouse UPDATE of `inventory_positions` that no approved domain operation owns
(deliberately unused). Proof: `tests/admin/warehouse-operations.test.ts` (18 structural/delegation
tests) + `tests/admin/warehouse-pages.test.tsx` (live WAREHOUSE/FINANCE/member/anonymous sessions
through the console's own Server Actions, 15/15 live) + `tests/browser/feature010-rund.browser.mjs`
(real Chrome + axe against the production build: 6 warehouse surfaces × EN/AR × light/dark ×
390/1366/1920 = 30 surfaces, zero axe violations, no horizontal overflow, one `<main>`, correct
lang/dir/theme, every status badge textual, no raw DB error text, kg on every quantity; FINANCE
direct-URL refusal on all three warehouse routes; operations form inline missing-reason error →
`aria-invalid` → confirmation dialog → cancelled with status unchanged; keyboard Tab reaches a queue
link with a `solid 2px` focus ring; zero console/page/request errors — run twice, identical). One
browser-found defect was fixed before closure: UUID cells used `truncate` (nowrap) inside the auto-
layout table and overflowed 1366 px (`scrollWidth 1463 > 1351`); they now wrap (`break-all`).
Regressions (live, this machine, after `npm run test:seed` with the rotated password): `tests/admin`
+ `tests/inventory` + `tests/delivery` = 402 tests → 395 passed, 6 skipped (env-gated T017/T024
PAID-order proofs), 1 failed = the PRE-EXISTING static assertion in
`tests/delivery/t013-live-proof.test.ts` (expects the seed script to contain `role: "ADMIN"`; RUN B's
`createDisposableOperatorFixture` refactor changed that literal to `platformAdminRole: "ADMIN"` —
fails identically on the untouched tree; recorded, not patched — Feature 009 test ownership). A first
full-suite reading also saw 4 transient sign-in failures (`fixture-session.ts:346`, GoTrue password-
grant limit during the 5-minute sequential run); both files pass 30/30 in isolation and the second
full reading had none. Suspended-organization mid-operation policy remains undecided; no clause of
T016–T020's literal Verify depends on it, and the console neither blocks nor continues on that basis.
Feature 005 warehouse-oversight reads are additive; Feature 009 is untouched.
**RUN C evaluated (2026-09-16) — Phase 5 T013/T014/T015 BLOCKED BY FEATURE 008.** RUN C re-audited CURRENT Feature 008 (its `spec/plan/tasks.md`, `lib/finance/*`, Server
Actions, RPC contracts, `tests/finance/*`, DTOs): 008 is at 6/39 (Phase 1 only) and its application
layer is `lib/finance/read.ts` (per-order `getPayment/getOrderFinancials/getProforma/getTaxInvoice/
getPayoutsForOrder/getPayoutsForOrganization`), `types.ts` (snapshot DTOs), `validation.ts`
(vocabularies), `errors.ts` (`mapFinanceError`) and `funding.ts` (`requestFunding` → always
`FINANCE_FUNDING_UNAVAILABLE`). There is NO payment-review queue read, NO proof-reference DTO
(`payment_proofs` is not read anywhere), NO `decidePayment` (`grep -rn decidePayment lib src
components` → nothing; 008 T017–T020 unchecked and T017 itself needs an approved DB change — 008
plan decision 4 classifies `admin_review_payment()` as B), NO payout-status write and NO tax-invoice
recording write (008 T023/T025 unchecked; invoice recording also depends on the unresolved private
Storage design, DB-BLOCK-01). Everything Phase 5 needs exists only as database tables/RLS/one
SECURITY DEFINER primitive, which is not permission for this console to own the business layer.
RUN C therefore built NO finance screen, NO second payment read domain, NO `admin_review_payment`
wrapper and NO table CRUD; it added `tests/admin/finance-delegation.test.tsx` (14 tests: static
delegation proof over `src/app/dashboard-admin`, `lib/admin`, `components/admin` — no runtime
`admin_review_payment`/`submit_payment_proof`, no finance-table write, no RPC other than the six
role attests, no money column, no service role/cache, no `.delete(`; the three finance areas stay
`blocked` on `feature-008-finance-layer` with no duplicate destination; no member Finance route;
and live direct-URL proof with real sessions — FINANCE reaches payments/payouts/invoices (blocked
state, no amount), COMPLIANCE and WAREHOUSE get `forbidden`, a plain member `no-operational-role`,
anonymous is redirected to `/admin/sign-in/`). Exact minimum 008 contracts are recorded on T013–T015.
**RUN B complete (2026-09-16) — Phase 3 T007/T008/T009 RECORDED, Phase 4 T011
RECORDED; T010 implemented but NOT closable (organization read/update policy gap for COMPLIANCE —
recorded, needs a database decision); T012 BLOCKED (Feature 012 absent). 11 / 48.** RUN A
(2026-09-15): Phase 1 (T001–T005) + Phase 2 (T006) + T046 RECORDED; T047/T048 BLOCKED (original
planned count 45; authoritative count 48). RUN B evidence: `lib/admin/{compliance,decisions,
validation}.ts`, `components/admin/compliance/*`, the `(compliance)/kyb|organizations|listings`
routes; `tests/admin/compliance-decisions.test.ts` (13 live tests incl. a two-session race) +
`tests/admin/compliance-pages.test.tsx` (12 live page tests) + `tests/browser/feature010-runb.browser.mjs`
(25 surfaces × EN/AR × light/dark × 390/1366/1920, zero axe violations, inline validation,
confirmation dialog, keyboard focus ring, direct-URL refusal). One disposable COMPLIANCE fixture
(role exactly COMPLIANCE, no membership) was human-authorized, used, and de-privileged after every
run (`activeCapability: false`, blocked + Auth-banned; immutable audit references prevented deletion).
**RUN B live-DB findings (recorded, not fixed):** (1) `organizations` has NO SELECT policy for `is_compliance_operator()` (only `organizations_member_select`: `is_org_member(id) OR is_platform_admin()`), and because an UPDATE whose WHERE references existing columns is also subject to SELECT policies, the existing `organizations_compliance_update` policy affects ZERO rows for a pure COMPLIANCE operator (verified live 2026-09-15 with an affected-row count of 0 on a no-op status write; `kyb_applications` writes affect 1). The same shape blocks `file_assets` (`catalog_admin_files`) and `account_status_history` (`account_status_history_view`) for that role. (2) `validate_offer_transition`
gates every UPDATE into APPROVED/REJECTED/PUBLISHED/SUSPENDED on `is_compliance_operator()`
(`compliance_required_for_listing_state`) — so even the privileged seed script cannot restore a
suspended fixture to PUBLISHED; the compliance session does it. (3) The trigger has no branch for
`old.status = 'SUSPENDED'`/`'ARCHIVED'`, so a suspended listing has no DB-enforced forward limit —
a seller's own ARCHIVE from SUSPENDED is not refused by the database (code reading of the live
trigger text; not exercised live). (4) A shared-primitive accessibility defect surfaced by the real
Chrome focus check: `outline-none` + `focus-visible:outline-2` under Tailwind v4 leaves
`outline-style: none` (no visible ring) on `Button`/`Input`/`Textarea`/`Checkbox`/`RadioGroup`/
`Select`/`Switch`/`Tabs` — fixed by adding `focus-visible:outline-solid` (one utility, eight files;
computed ring now `solid 2px`). Phases 3–12 remain unstarted; their
blockers are unchanged (see the Run 0 reconciliation in plan.md). RUN A evidence: the single access
matrix (`lib/admin/areas.ts`) + live guards (`lib/admin/guards.ts`) + six guarded route groups
(`(compliance)`/`(warehouse)`/`(finance)`/`(catalogue)`/`(audit)`/`(system)` with a nested
`(super)` slice) + the role-shaped shell and account menu + the real-count overview + the operator
self-account page; `tests/admin/*` (37 tests, live WAREHOUSE/FINANCE/member/anonymous sessions) and a
real Chrome + axe pass (`tests/browser/feature010-runa.browser.mjs`: 20 surfaces × EN/AR × light/dark
× 390/1366/1920, zero violations, keyboard focus ring, mobile drawer, direct-URL refusals). No
database change, no service role, no fabricated figure. Two live-DB findings recorded (not fixed):
`organizations` has no SELECT policy for COMPLIANCE (Phase 3's KYB queue cannot show organization
names through RLS as-is — a candidate DB open item for T007), and the spec's "Trading oversight"
scope has no owning task (flagged for RUN B planning, not silently added).
**Prerequisite**: 001 plus the applicable current domain capability: 003 is closed; 005 is partial;
006 supplies listing states; 008 supplies only Phase-1 finance reads; 009 is closed; 012 is not started.

> **Standing rules**: (1) every area authorizes independently server-side; (2) the console owns no
> transactional logic — settlement via 008's `decidePayment` only once 008 provides it, fulfilment
> via 009's warehouse layer;
> (3) no hard deletes of commercial/inventory/title/payment/audit records; (4) where a recorded
> blocker limits a capability, state it honestly rather than simulating it.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Access matrix & guards

- [x] T001 [PS1] Create `lib/admin/areas.ts` — the single declarative access matrix mapping every
  console area to its required role check.
  - Req: FR-002, FR-003, SC-001 | Depends: —
  - Verify: every area appears exactly once with an explicit role; no "any staff" catch-all exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: this single file defines least privilege for the entire operations surface; an over-broad entry here silently grants cross-role power.
  - **Done (2026-09-15, RUN A)**: `ADMIN_AREAS` declares 21 areas across the six groups (compliance:
    kyb/organizations/listings/disputes; warehouse: shipments/inventory; finance: payments/payouts/
    invoices; catalogue: coffees/origins/regions/taxonomy/warehouses/media; audit: audit; system:
    roles/commission/tax/shipping/paymentAccounts), each with exactly ONE `roleFunction` drawn from
    the closed union `ADMIN_ROLE_FUNCTIONS` (the six approved SECURITY DEFINER functions) and an
    honest `availability` (`planned` phase N / `blocked` with the named dependency — none is `live`
    because RUN A built no workflow). `ROLE_FUNCTION_ATTESTS` mirrors `lib/auth/dal.ts` exactly (no
    invented hierarchy); `payment_accounts` is `is_platform_admin()` while roles/commission/tax/
    shipping are `is_super_admin()` — the RLS truth. Overview/Account are `ADMIN_SHELL_ROUTES`,
    kept OUT of the matrix. Proof: `tests/admin/access-matrix.test.tsx` "T001" (unique key/href,
    every function approved, no `isStaff`/`anyRole`/membership token in the file, DAL mapping
    cross-checked, visibility shaping from attested roles only).

- [x] T002 [PS1] Implement `lib/admin/guards.ts` — per-area server-side verification helpers reading
  the matrix and calling the approved role functions.
  - Req: FR-002, SEC-001 | Depends: T001
  - Verify: each guard calls the specific role function (not a generic staff check); a member with no operational role is refused everywhere
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the enforcement half of the least-privilege model; must not drift from the declaration.
  - **Done (2026-09-15, RUN A)**: `verifyRoleFunction(fn)` issues `supabase.rpc(fn)` for the named
    approved function under the operator's own session and fails closed; `checkConsoleShellAccess`
    (anonymous → MFA step-up → no operational role, Feature 001's predicate restated) runs BEFORE
    the function call; `checkGroupAccess(group)` / `checkAreaAccess(key)` /
    `checkRoleFunctionAccess(fn)` return a typed `AdminAccess` (`forbidden` for a staff member with
    the wrong role). Never reads a membership. LIVE proof (`tests/admin/access-matrix.test.tsx`):
    the WAREHOUSE fixture is permitted in the warehouse group only and `forbidden` in the other five
    and in every non-warehouse area; the FINANCE fixture mirrors that; the approved trading member
    (`buyer-only`) is `no-operational-role` at the shell, every group and every area; an anonymous
    session is `anonymous` before any function is consulted; the WAREHOUSE operator's identity has
    `organization === null`, `organizations === []`, `isAuthorizedMember === false` (operator ≠
    member). COMPLIANCE/AUDITOR/ADMIN/SUPER_ADMIN legs are proven structurally only — no such
    fixture exists (Phase 10 T030 owns the full six-role live matrix).

- [x] T003 [PS1] Extend `src/app/dashboard-admin/layout.tsx` into the console shell (dark sidebar,
  sticky topbar, role-shaped navigation) while preserving 001's guard exactly.
  - Req: FR-001, FR-015 | Depends: T002
  - Verify: 001's guard behaviour is unchanged; navigation shows only the areas the operator's roles permit
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: edits the file enforcing the console's security boundary; chrome must not weaken it.
  - **Done (2026-09-15, RUN A)**: the three guard statements are byte-identical (`git diff
    --unified=0` touches none of them; `tests/design/uif-g.test.tsx` and `tests/auth/admin-auth.test.ts`
    still assert this); only the markup past the guard changed. The shell reuses the SAME `AppShell`
    (dark forest sidebar, sticky topbar, `MobileAppNav` drawer) — no second design system — now fed
    `buildAdminNavGroups(identity.operationalRoles)` (rewritten to derive groups/areas from the
    matrix), role badges in the topbar (`components/admin/role-badges.tsx`, text + dot), and an
    account menu (`components/admin/topbar.tsx`: avatar, name, roles, "My account" →
    `/dashboard-admin/account`, sign-out via the existing `LogoutConfirmDialog`/`signOut` action).
    Breadcrumbs/page-title use the existing `PageHeader`; the toast host is already global. The
    layout still never reads a membership. EN/AR copy added together (`lib/app/copy/{en,ar}.ts`
    `admin.*`). Real-browser proof: `tests/browser/feature010-runa.browser.mjs` — WAREHOUSE operator
    sees Overview/Warehouse/Account only, drawer at 390 px lists shipments/inventory/account and no
    finance/compliance entry, zero axe violations on every surface, Tab reaches the Shipments link
    with a visible 2 px focus ring, no console/page/request errors.

- [x] T004 Add per-area route-group layouts, each invoking its own guard.
  - Req: FR-002, SC-001 | Depends: T002, T003
  - Verify: a direct URL into a forbidden area is refused by that area's own layout, not merely absent from navigation
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: defence in depth per area; the most likely place for a missing check to hide.
  - **Done (2026-09-15, RUN A)**: `src/app/dashboard-admin/(compliance|warehouse|finance|catalogue|
    audit|system)/layout.tsx` each call `checkGroupAccess("<group>")` (its own function, live) and
    render `AdminAccessDenied` (forbidden state naming the required role; anonymous →
    `/admin/sign-in/`; step-up → `/mfa/`) instead of `children`; `(system)/(super)/layout.tsx`
    additionally calls `is_super_admin()` for roles/commission/tax/shipping while
    `(system)/payment-accounts` stays `is_platform_admin()`. Every declared area has a page under
    its group rendering `AdminAreaPlaceholder`, which re-verifies the AREA's own function and states
    honestly "not available yet (phase N)" or "waiting on a dependency (Feature 008 / Feature 012 +
    DB-OPEN-09 / DB-OPEN-06)" with no controls. Proof: `tests/admin/access-matrix.test.tsx` "T004"
    (one guarded group per matrix group; every href → a page under its group; direct invocation of
    the `(finance)` layout with the live WAREHOUSE session renders the forbidden state and never
    its children, the `(warehouse)` layout admits them; the anonymous branch redirects to the
    operator sign-in) + browser proof (WAREHOUSE at `/dashboard-admin/payments/` → forbidden;
    FINANCE at `/dashboard-admin/shipments/` and `/roles/` → forbidden; member at
    `/dashboard-admin/shipments/` → operations-access-required). `npm run build` lists all 23 console
    routes as dynamic (`ƒ`).

- [x] T005 Add non-indexable metadata for all `/dashboard-admin` routes and confirm exclusion from
  002's sitemap.
  - Req: FR-012 | Depends: T003
  - Verify: console routes are non-indexable; 002's sitemap contains none of them
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, mechanical.
  - **Done (2026-09-15, RUN A)**: the root console layout's `robots: { index: false, follow: false }`
    is inherited by every nested segment — no nested layout/page exports metadata or overrides
    robots; `robots.ts` disallows `/dashboard-admin`; `sitemap.ts` contains no console route; no
    public copy or public component links an operational route (only the authenticated account
    menus link the console root); every console page/layout reads the request identity (dynamic,
    never prerendered) and uses no cache API. Proof: `tests/admin/noindex.test.ts` (5 tests) plus
    the existing `tests/public/seo-boundary.test.ts` (still green).

---

## Phase 2 — Console overview

- [x] T006 Implement `src/app/dashboard-admin/page.tsx` — a role-shaped operations overview built from
  real queries only (no sample or estimated figures).
  - Req: FR-016, SC-008 | Depends: T004
  - Verify: every figure traces to a real query; an empty system renders empty states, not zeros presented as data
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the design system's explicit "no seeded or sample figures" rule requires judgment about what to show when there is nothing.
  - **Done (2026-09-15, RUN A)**: `lib/admin/read.ts#getAdminOverview(roles)` — each figure is one
    `select("id", { count: "exact", head: true })` under the operator's own session against a table
    whose RLS grants the SECTION's role a read (compliance: kyb_applications/coffee_offers/disputes;
    warehouse: order_shipments/inventory_positions; finance: payments/payouts; catalogue: coffees/
    origins/warehouses; audit: audit_logs — ADMIN only, DB-OPEN-06 stated for a pure AUDITOR;
    system: platform_admins — SUPER_ADMIN). Sections the roles do not unlock are absent (RLS filters
    silently, so a role without a policy would otherwise read a misleading 0). `0` renders as an
    explicit "None" tile + section empty message (`data-metric-state="empty"`), a failed read as
    "Unavailable", and money is NOT summed: Feature 008's contract defines per-order snapshots, not
    platform aggregates, so the Finance section shows counts and states that monetary totals arrive
    with Feature 008. Proof: `tests/admin/overview.test.tsx` — every metric's table/policy
    cross-checked against `database-schema-report.json`; counts only, no cache/service role; no
    sample/hardcoded figure in page or tiles; render states; LIVE: WAREHOUSE identity → warehouse
    section only with real numbers, one tile equal to a direct count under the same session;
    FINANCE → finance section only + deferred-money note; member → no section. Browser: five
    warehouse tiles (3 real values, 2 honest empties) across the appearance matrix, no money figure,
    no foreign section.

---

## Phase 3 — Compliance: KYB

- [x] T007 [PS2] Implement the KYB queue (`(compliance)/kyb/page.tsx`) with status, organization,
  submission time and outstanding items.
  - Req: FR-002, PS2 | Depends: T004
  - Verify: only compliance-permitted roles reach it; queue reflects real application states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: queue list over an existing domain layer.
  - **Done (2026-09-16, RUN B)**: `lib/admin/compliance.ts#listKybApplications` (real
    `kyb_applications` rows under the operator's session; "awaiting action" = SUBMITTED /
    UNDER_REVIEW / RESUBMISSION_REQUIRED, or all statuses via `?view=all`; oldest submission first;
    outstanding items from Feature 003's own `checkKybCompleteness` over the readable
    `kyb_documents`; expired-document count) rendered by `(compliance)/kyb/page.tsx` through the
    server-safe `TableCardList` (desktop table + 390 px cards). **Organization column**: the
    organization id always, the display name only when the operator's role can read `organizations`
    — for a pure COMPLIANCE operator it is stated as unavailable with the recorded gap note, never
    fabricated (see the RUN B findings above; this is the DB decision the queue needs before names
    can appear for that role). Live proof (`tests/admin/compliance-pages.test.tsx`): the COMPLIANCE
    fixture sees the real UNDER_REVIEW fixture row, real status badges, the gap note and no invented
    name; the actionable view contains only actionable statuses; WAREHOUSE by direct URL → forbidden
    naming `Required role: Compliance`; anonymous → `/admin/sign-in/`; FINANCE/member refused at
    the guard (`access-matrix` + `compliance-decisions`). Browser: zero axe violations across the
    five appearances, loading/empty/error states wired (`AdminStateCard`).

- [x] T008 [PS2] Implement the application detail view: evidence list, document expiry and history,
  using 003's live KYB-document seam for Compliance reads. State honestly that non-KYB evidence bytes
  remain outside that seam.
  - Req: FR-006, FR-017, PS2 | Depends: T007
  - Verify: an authorized Compliance reviewer can use the approved KYB-document path; a non-KYB
    evidence limitation is explained rather than silently broken
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: reviewer-facing accuracy plus honest handling of a blocked capability.
  - **Done (2026-09-16, RUN B)**: `(compliance)/kyb/[applicationId]/page.tsx` over
    `getKybApplicationDetail`: application identity/status/timestamps/fields, documents through
    003's approved seam (`kyb_documents_member_select` includes `is_compliance_operator()`) with
    type, status, version, expiry (expired ones flagged `data-document-expired="true"` + a text
    badge via the shared `isDocumentExpired` rule), outstanding items, application-level decisions
    (`kyb_reviews`), document-level decisions (`kyb_review_items`, 003's append-only ledger),
    organization status history, and the decision panel. **Honest limits stated in-product**: file
    name/MIME/size are unavailable to a pure COMPLIANCE role (`file_assets` has no compliance read
    path), so document bytes are NOT openable from this console and NO download control is rendered
    (`data-document-bytes-note`); payment/delivery/dispute evidence is stated to be outside the KYB
    seam (Features 008/009/012); the organization row and its status history are stated
    unavailable for that role (`data-organization-gap`, `data-history-unavailable`). Live proof:
    the COMPLIANCE fixture renders the seeded APPROVED application with its real document row and
    every section; no `a[download]`/storage link exists; unknown id → not-found state. Browser: zero
    axe violations, EN/AR/RTL, 390/1366/1920.

- [x] T009 [PS2] Implement KYB decision actions (`APPROVED`, `REJECTED`, `RESUBMISSION_REQUIRED`,
  `SUSPENDED`) recording `kyb_reviews` (reviewer, decision, reason) and the application status change.
  - Req: FR-006, SEC-003, SC-003 | Depends: T008
  - Verify: each decision records a review row and changes status once; a decision requiring a reason is refused without one; non-compliance roles refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the decision that unlocks trading for an organization — attribution and correctness are compliance-critical.
  - **Done (2026-09-16, RUN B)**: `lib/admin/decisions.ts#decideKybApplication` (+ `startKybReview`
    for SUBMITTED → UNDER_REVIEW, no review row) behind the live `is_compliance_operator()` guard:
    zod-validated input (reason mandatory for REJECTED / RESUBMISSION_REQUIRED / SUSPENDED, 5–2000
    chars, inline `fieldErrors.reason`), a compare-and-set UPDATE on `kyb_applications`
    (`status IN <permitted sources>`, stamping `decided_by`/`decided_at`/`rejection_reason`), then
    the `kyb_reviews` row with the server-derived reviewer id, then the organization follow-through
    reported honestly as `applied | unavailable | not-required`. Server Actions
    (`(compliance)/kyb/actions.ts`) + `KybDecisionPanel` (radio options shaped by current status,
    reason field beside the action, `AlertDialog` confirmation for REJECTED/SUSPENDED, Sonner
    outcome, no raw DB text). LIVE proof with the COMPLIANCE fixture
    (`tests/admin/compliance-decisions.test.ts`): RESUBMISSION_REQUIRED, REJECTED (after
    startReview) and APPROVED each change status exactly once with a `kyb_reviews` row carrying the
    reviewer, decision and reason; a repeat is `kyb_decision_stale` with no second row; every
    reason-required decision without a reason is refused before any write; a TWO-SESSION race on the
    same SUBMITTED application yields exactly one effect, exactly one review row and one STALE loser;
    prior history rows are untouched. WAREHOUSE / FINANCE / member → `compliance_not_capable` and, at
    the database layer, their direct writes affect 0 rows / are refused; anonymous → unauthenticated.
    **Recorded**: for a pure COMPLIANCE operator the APPROVED decision's organization activation is
    `unavailable` (the organizations policy gap), so `organization_can_buy()` stays false until a
    platform admin activates the organization — stated in-product, never bypassed. Concurrency
    beyond the two-session race remains T032's.

- [x] T010 [PS2] Implement organization status/suspension actions with reason capture.
  - Req: FR-006, PS2 | Depends: T009
  - Verify: suspension is reflected for the member on their next request (003/004); reason recorded
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: immediate suspension (AUTH-02) must take effect platform-wide without destroying history.
  - **Implemented but NOT closable (2026-09-16, RUN B) — BLOCKED on a database decision.**
    `lib/admin/decisions.ts#setOrganizationStatus` (suspend ACTIVE→SUSPENDED / reinstate
    SUSPENDED→ACTIVE through the approved `organizations_compliance_update` policy, mandatory reason
    recorded as a `kyb_reviews` row against the current application — the only reason-bearing
    compliance record the schema offers; `account_status_history` is written by the trigger with no
    reason), `(compliance)/organizations/{page,[organizationId]/page}.tsx` + `OrganizationStatusPanel`
    (confirmation always, the undecided in-flight-operations policy stated, never simulated).
    **Why unchecked**: the literal Verify needs a real suspension to land and be felt by the member
    on their next request. `organizations` has NO SELECT policy for `is_compliance_operator()` (only `organizations_member_select`: `is_org_member(id) OR is_platform_admin()`), and because an UPDATE whose WHERE references existing columns is also subject to SELECT policies, the existing `organizations_compliance_update` policy affects ZERO rows for a pure COMPLIANCE operator (verified live 2026-09-15 with an affected-row count of 0 on a no-op status write; `kyb_applications` writes affect 1). The same shape blocks `file_assets` (`catalog_admin_files`) and `account_status_history` (`account_status_history_view`) for that role. The only role that can drive this path today is
    ADMIN/SUPER_ADMIN, for which no fixture is authorized in RUN B; the pure COMPLIANCE fixture is
    refused up front with `organization_access_unavailable` and NOTHING is written (live-proven,
    including that the member's `organization_can_buy` is unchanged). **Exact DB decision needed**:
    grant `is_compliance_operator()` a SELECT path on `organizations` (e.g. extend
    `organizations_member_select`'s USING with `OR is_compliance_operator()`), which also makes the
    existing UPDATE policy effective; optionally the same for KYB-linked `file_assets` and
    `account_status_history`. Security effect: COMPLIANCE would read every organization row
    (legal/tax/contact fields) — consistent with the SRS compliance role; no write widening beyond
    the UPDATE policy that already exists. Until then this surface renders the recorded gap for
    COMPLIANCE (`data-admin-state="capability-gap"`) and is expected to work for a platform admin.
  - **RUN J (2026-09-19) — COMPLETE (literal Verify met, live).** Pre-migration review found that a SELECT path
    alone would make `organizations_compliance_update` EFFECTIVE with no column or transition limit (all 16
    columns, any status, via raw REST); the human chose "SELECT + narrow guard". Migration `supabase/migrations/20260919130000_feature_010_db_open_22_compliance_organization_read.sql`
    (applied; postflight 12/12): `organizations_member_select` USING = `is_org_member(id) OR is_platform_admin()
    OR is_compliance_operator()` (roles/command unchanged) + `trg_organizations_compliance_guard` →
    `guard_organization_compliance_update()` (SECURITY DEFINER, pinned search_path, no EXECUTE for anon/
    authenticated): for a compliance operator who is NOT a platform admin, only `status` may change, only
    PENDING_KYB→UNDER_REVIEW|ACTIVE|REJECTED, UNDER_REVIEW→ACTIVE|REJECTED, ACTIVE→SUSPENDED, SUSPENDED→ACTIVE.
    `organizations_compliance_update`, `organizations_admin_all`, the MFA gate, grants, `account_status_history`
    and `file_assets` policies unchanged. **Verify**: (1) "suspension is reflected for the member on their next
    request (003/004)" — `tests/admin/organization-suspension.test.ts` (12/12, pure COMPLIANCE, through the
    console's own Server Action): after ACTIVE→SUSPENDED the SAME member session's next `getRequestIdentity()`
    has `isAuthorizedMember=false`, `canBuy=false`; Feature 007's `createOrder` → `buyer_not_capable`;
    `organization_can_buy` and `is_authorized_member` both false; reinstatement restores all three. (2) "reason
    recorded" — the mandatory reason is persisted in `kyb_reviews` (decision SUSPENDED / APPROVED, reviewer =
    the operator, exact reason, linked by `application_id` to the organization's application) and, on
    suspension, as `kyb_applications.rejection_reason`; `account_status_history` gains exactly one attributed
    row per change (ACTIVE→SUSPENDED, SUSPENDED→ACTIVE, `changed_by` = operator; that table's `reason` column is
    not written by its trigger — the reason-bearing record is the review row, no second history model was
    invented). Also proven: stale/repeated change refused (`organization_status_stale`, nothing recorded);
    unrelated member, own member, WAREHOUSE, FINANCE, AUDITOR → `compliance_not_capable`, anonymous →
    `profile_auth_required`, and their raw UPDATEs change nothing; the guard refuses raw COMPLIANCE writes to
    legal_name / tax_number / can_sell / email / mixed writes (`organization_compliance_update_scope`) and
    ACTIVE→CLOSED|REJECTED|PENDING_KYB|UNDER_REVIEW (`organization_compliance_transition_refused`); INSERT 42501,
    DELETE 0 rows; ADMIN and SUPER_ADMIN still edit a non-status column (unchanged); anonymous / WAREHOUSE /
    FINANCE / AUDITOR read no organization, an unrelated member reads only its own; no history row deleted; every
    other organization byte-identical. Console fixes found by the live proof: KYB detail no longer infers
    "status history readable" from "organization readable" (asks `is_platform_admin()`, the history policy's own
    operator clause — else it would have said "no change recorded" when history exists); organization names
    fall back to the stored legal name when `display_name` is null (two real organizations), instead of claiming
    "not readable by your role"; stale gap copy reworded (EN/AR). Browser: `tests/browser/feature010-t010.browser.mjs`
    — 24 surfaces (EN/AR × light/dark × 390/1366 × list, detail, not-found), 0 axe violations (two consecutive
    clean runs), visible focus ring, reason-field validation, alertdialog explaining the next-request effect,
    Escape = no write (DB snapshot unchanged), confirmed suspension and reinstatement recorded.

---

## Phase 4 — Compliance: listings & disputes

- [x] T011 [PS5] Implement the listing review queue and decision actions (`APPROVED`, `REJECTED`,
  `SUSPENDED`) recording `listing_reviews` and the status change.
  - Req: FR-006, PS5, SC-003 | Depends: T004, 006's layer
  - Verify: decisions record reviewer/decision/reason; suspension stops member actionability (006); non-compliance roles refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: controls what is tradable in the marketplace; must cooperate with the offer-transition trigger.
  - **Done (2026-09-16, RUN B)**: `listListingsForReview` / `getListingReviewDetail` (PENDING_REVIEW +
    live + suspended `coffee_offers` under `offers_compliance_read`, the persisted `listing_reviews`
    and trigger-written `listing_status_history`), `(compliance)/listings/{page,[offerId]/page}.tsx`
    (Feature 006's `ListingStatusBadge`, quantities always in kg, prices always with currency) and
    `decideListing` (compare-and-set on `coffee_offers` — APPROVED/REJECTED from PENDING_REVIEW,
    SUSPENDED from PUBLISHED/PARTIALLY_FILLED; `rejection_reason` set so the DB trigger copies the
    reason into `listing_status_history`; then the `listing_reviews` row). The database's own
    `validate_offer_transition` remains the authority (it independently requires
    `is_compliance_operator()` for these targets — live-confirmed). Two HILLS listing fixtures were
    added to the seed script for this (`offerPendingReview`, `offerReviewLive`, each on its own lot)
    with a restore command. LIVE proof: APPROVED changes status once + review row (repeat →
    `listing_decision_stale`); REJECTED without a reason is refused, with one the reason lands on
    the listing AND in `listing_status_history` with `changed_by` = the reviewer; SUSPENDED from
    PUBLISHED sets `is_visible=false`, the listing disappears from a real buyer's RLS read, and a
    real buyer's `addOrderItem` against it is refused by Feature 007's own path — member
    non-actionability proven at the domain/DB layer, not by hiding a button. WAREHOUSE/FINANCE/member
    → `compliance_not_capable`; WAREHOUSE's direct status write affects 0 rows. **Recorded**: no
    approved compliance vocabulary lifts a suspension (`listing_reviews.decision` has no
    "reinstated"), so a suspended listing stays suspended — stated in-product; and the trigger's
    missing SUSPENDED branch (findings above) means the DB does not refuse a seller ARCHIVE from
    SUSPENDED (code reading, not exercised).

- [x] T012 [P] Implement the dispute review surface (queue +
  status transitions) only by composing 012's domain layer.
  - Req: FR-006 | Depends: T004, 012's layer
  - Verify: dispute status changes record reason and actor; only compliance-permitted roles may act;
    no parallel 010 dispute engine or freeze path exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: composition over 012's layer with an authorization constraint.
  - **Re-checked 2026-09-16 (RUN B): still BLOCKED.** Feature 012 is 0/28 with no `lib/disputes`
    domain layer, no dispute status-transition function and no compliance freeze path (DB-OPEN-09).
    The console keeps the honest blocked placeholder at `/dashboard-admin/disputes` (guarded by the
    compliance group + area guard) and contains no dispute mutation (`tests/admin/compliance-pages
    .test.tsx` asserts no `from("disputes")` write exists in `lib/admin`). **Feature 012 must supply**
    a dispute read DTO + a reviewed transition function that records actor and reason, and the
    approved freeze mechanism, before T012 can be composed.
  - **Dispute-unblock run (2026-09-19) — COMPLETE (literal Verify met).** Feature 012 now supplies the read DTOs
    (`listDisputesForCompliance`, `getDisputeForCompliance`, `getDisputeEvidenceForOperator`,
    `getDisputeStatusHistoryForOperator`) and six named transition operations backed by the database's
    `transition_dispute()` (compliance + MFA, reason required, compare-and-set, approved graph, write-once
    resolution, one `dispute_status_history` row with actor = `auth.uid()`). The console composes ONLY that layer:
    `src/app/dashboard-admin/(compliance)/disputes/page.tsx` (queue, awaiting-action/all, order reference stated
    unreadable for a pure COMPLIANCE role), `…/[disputeId]/page.tsx` (record, member text via `UntrustedText`,
    evidence notes, the database-written transition history, record-only freeze note), `…/actions.ts`
    (`recordDisputeTransition` — the chosen next status selects exactly one named Feature 012 operation; anything
    else is a validation error; `expectedStatus` always passed) and `components/admin/compliance/dispute-decision-panel.tsx`
    (options = Feature 012's `DISPUTE_TRANSITIONS[status]`, passed from the server page; reason required, 10–2,000;
    outcomes/closing confirmed). `disputes` area flipped to `live`; the stale `feature-012-dispute-layer` blocker
    and its copy removed. **Verify**: (1) "status changes record reason and actor" — live, `tests/admin/decisions.test.ts`
    + `tests/admin/disputes-console.test.tsx` (history rows: actor, from→to, exact reason, time; rendered as
    "Changed by: You"); (2) "only compliance-permitted roles may act" — member/unrelated member/WAREHOUSE/FINANCE/
    AUDITOR/anonymous → `compliance_not_capable` through the action, WAREHOUSE/FINANCE/AUDITOR `forbidden` and member
    `no-operational-role` on the page, and the database function refuses them (`forbidden`); (3) "no parallel 010
    dispute engine or freeze path exists" — `tests/admin/compliance-pages.test.tsx` pins no `.from(`/`.rpc(`/
    `createClient`/service role/order-shipment-payment-inventory import in any console dispute file, and the
    fixture business snapshot is byte-identical after every decision. **DB-OPEN-09 stays OPEN**: the Verify asks
    that NO freeze path exists (met); an approved freeze MECHANISM still does not exist, and the console says so
    (FROZEN is a record label only) — nothing is simulated. Browser: `tests/browser/feature010-t012.browser.mjs`
    — 32 surfaces (EN/AR × light/dark × 390/1366 × queue, all, FROZEN detail, not-found), 0 axe violations, keyboard
    ring, reason-field validation, alertdialog (Escape cancels, confirm records), no console/page/request errors.

---

## Phase 5 — Finance

- [ ] T013 [PS3] **BLOCKED — 008 Phase 1 has no queue read (re-checked RUN C, 2026-09-16).** Implement the payment review queue with
  order, amount, currency, proof reference and hold status through 008's finance layer.
  - Req: FR-002, PS3 | Depends: T004, 008's layer
  - Verify: only finance-permitted roles reach it; amounts match `order_financials` exactly
  - RUN C audit: `lib/finance/read.ts` reads ONE order at a time by `orderId` (`getPayment`,
    `getOrderFinancials`); nothing lists payments awaiting review across orders, nothing reads
    `payment_proofs`, and no DTO carries a proof reference or the order's hold status. Building
    that list in `lib/admin` would be a second payment read domain, which this task forbids, so
    the `payments` route keeps the honest `blocked` placeholder (`AdminAreaPlaceholder`) and the
    overview keeps RUN A's count-only figures. **Minimum 008 contract to unblock**:
    `listPaymentsForReview({ statusIn?, page? })` (FINANCE-scoped, `payments_finance_read` +
    `payment_proofs_finance_read` via RLS, no service role) returning
    `{ paymentId, orderId, orderCode, amount, currency, paymentStatus, orderStatus (hold status),
    proof: { reference, submittedAt, fileAssetId } | null, buyerTotalAmount (from
    `order_financials.buyer_total_amount`, currency) }`, plus `getPaymentReviewContext({ paymentId })`
    for the detail. Values must be the stored snapshots — 008 must not compute them.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: money-facing queue where display fidelity matters.

- [ ] T014 [PS3] **BLOCKED — 008 has not supplied `decidePayment`.** Implement the settlement decision UI calling **008's `decidePayment`** — never
  `admin_review_payment` directly — with confirmation and reason capture.
  - Req: FR-004, SC-002, PS3 | Depends: T013
  - Verify: `grep -rn "admin_review_payment" src/app/dashboard-admin lib/admin` returns nothing; approval completes settlement exactly once; expired-reservation approval fails clearly
  - RUN C audit (2026-09-16): **FEATURE 008 BLOCKER — `decidePayment()` missing.** `grep -rn
    decidePayment lib src components` returns nothing; 008 T017 (approved post-funding settlement DB
    contract — requires a DB change, 008 plan decision 4), T018 (`lib/finance/settlement.ts` as the
    only caller), T019 (error mapping) and T020 (typed guarded interface for 010) are all unchecked.
    The first Verify clause is satisfied and pinned by `tests/admin/finance-delegation.test.tsx`
    (runtime grep over `src/app/dashboard-admin`, `lib/admin`, `components/admin`, comments
    stripped), but the task is NOT closable from that alone: no decision UI was built, no
    `admin_review_payment` wrapper, compatibility shim or copied settlement logic exists in 010.
    **Minimum 008 contract to unblock**: `decidePayment({ paymentId, decision: "APPROVED" |
    "REJECTED", reason, expectedStatus })` in `lib/finance/settlement.ts` (server-only, session
    identity, `is_finance_operator()` re-verified in the DB), returning `ActionFeedbackResult` with
    controlled codes for `FINANCE_NOT_CAPABLE`, `PAYMENT_STALE` (compare-and-set on the current
    payment status), `PAYMENT_ALREADY_DECIDED` (idempotent, exactly-once effects),
    `RESERVATION_EXPIRED` (approval refused clearly), `FUNDING_NOT_TRUSTED` (the DB-enforced
    precondition from T017), `VALIDATION_ERROR` (reason required on rejection); never a raw
    Postgres/RLS/provider message; audit attribution recorded by 008.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the console's most consequential action; routing around 008's guards would defeat AC-03 protections.

- [ ] T015 [P] **BLOCKED — 008 has not supplied payout management or invoice recording.** Implement
  payout management and tax invoice recording surfaces (finance-only).
  - Req: FR-002, FR-006 | Depends: T004, 008's layer
  - Verify: payout status changes and invoice records are finance-only; no member path exists
  - RUN C audit (2026-09-16), reported separately:
    **PAYOUT GAP** — 008 exposes only `getPayoutsForOrder`/`getPayoutsForOrganization` (per
    order/organization reads); there is no finance-wide payout list and no status-transition
    write (`PENDING_PAYOUT → PROCESSING → PAID`, `VOID`) — 008 T023/T025 unchecked, and plan
    decision 7 says a payout record must never claim money movement without provider evidence
    (provider-dependent). Minimum contract: `listPayouts({ statusIn?, page? })` (FINANCE) and
    `transitionPayout({ payoutId, to, paymentReference?, expectedStatus })` with the approved
    vocabulary, compare-and-set, attribution and controlled codes; no amount edit, no delete.
    **TAX INVOICE GAP** — 008 exposes only `getTaxInvoice({ orderId })`; there is no
    `recordTaxInvoice` write, and `tax_invoices.file_asset_id` requires a private document that the
    unresolved Storage design (DB-BLOCK-01) does not yet provide, so a reference-only record would
    be a fake. Minimum contract: `recordTaxInvoice({ orderId, invoiceNumber, fileAssetId, issuedAt })`
    (FINANCE, one per order, immutable once recorded, attribution) after the Storage decision.
    Neither portion was implemented as raw table CRUD in 010; `payouts` and `invoices` keep the
    `blocked` placeholder. The "no member path" clause is pinned now (`finance-delegation` test:
    no `src/app/dashboard/{payments,payouts,invoices,settlement,finance}` segment and no member-side
    finance-table write), but the task stays open until the write surfaces exist.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: finance-only write surfaces with clear scoping.

---

## Phase 6 — Warehouse

- [x] T016 [PS4] Implement shipment queues (requested / in-progress / dispatched) for warehouse roles.
  - Req: FR-002, PS4 | Depends: T004, 009's layer
  - Verify: only warehouse-permitted roles reach it; queues reflect real shipment states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: operational queue over an existing layer.
  - **Done (2026-09-16, RUN D)**: `lib/admin/warehouse.ts#WAREHOUSE_QUEUES` declares five queues over
    Feature 009's live 13-value vocabulary, each non-DRAFT status exactly once — `requested`
    (`REQUESTED`), `inProgress` (`CAPACITY_CONFIRMED`/`READY`/`RESERVED`/`PICKING`/`BOOKED`),
    `dispatched` (`DISPATCHED`/`PARTIALLY_DELIVERED`), `held` (`DISPUTED` = FREEZE, `FAILED` — no
    forward transition, DB-OPEN-18/Feature 012) and `closed` (`DELIVERED`/`CANCELLED`); `DRAFT` is
    the buyer's unsubmitted plan and is never a warehouse queue. `listWarehouseQueue` reads through
    Feature 009's own `getShipmentsForWarehouseQueue` (RLS `shipments_view`'s
    `is_warehouse_operator()` branch is the boundary) plus ONE batched read-only `shipment_items`
    read for per-shipment planned/delivered kg totals (presentation sums of the items' own stored
    plan/progress values — not an inventory figure). `(warehouse)/shipments/page.tsx` re-verifies
    `checkAreaAccess("shipments")` itself, renders code / order / status badge / method / destination
    / planned kg / delivered kg / updated / open, 50 rows per page, `TableCardList` (table ≥ lg,
    cards below). **Honest read gap (recorded, not bypassed)**: a PURE `WAREHOUSE` role has no read
    path to `orders` (`orders_view` = `can_view_order(id)`), `order_items` or `organizations`
    (`organizations_member_select`), so the order reference / item names / buyer name degrade to
    identifiers with an in-product note (ADMIN/SUPER_ADMIN see them) — the same shape RUN B recorded
    for COMPLIANCE. Proof: `tests/admin/warehouse-operations.test.ts` (queue definition ↔ vocabulary,
    read delegation) + `tests/admin/warehouse-pages.test.tsx` (LIVE: a freshly requested shipment of
    another organization renders in `requested` and not in `dispatched`; FINANCE → `forbidden`,
    plain member → `no-operational-role`, anonymous → `/admin/sign-in/` redirect on the queue AND the
    detail route, no shipment code/contact leaks). COMPLIANCE refusal is the RUN A/B matrix proof
    (`tests/admin/access-matrix.test.tsx`; live COMPLIANCE fixture → warehouse group `forbidden`).

- [x] T017 [PS4] Implement operational transition controls calling **009's warehouse layer** — never
  raw shipment updates — with the affordances driven by the documented transition map.
  - Req: FR-005, SC-002, PS4 | Depends: T016
  - Verify: `grep -rn "order_shipments" src/app/dashboard-admin lib/admin` shows reads only; each transition succeeds/refuses per the database's map
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: physical-goods authority; a raw update path would bypass the role split and state machine.
  - **Done (2026-09-16, RUN D)**: `lib/admin/warehouse.ts#WAREHOUSE_OPERATIONS` maps the eight named
    Feature 009 transitions (`confirmCapacity`/`markReady`/`reserve`/`startPicking`/`book`/
    `dispatch`/`fail`/`cancel`) to EXACTLY the `fromStatuses`/target literals each
    `lib/delivery/warehouse.ts` function attempts (test-pinned by parsing that file) and cross-checks
    every pair against Feature 009's `SHIPMENT_TRANSITIONS`; `displayableOperations(status)` is the
    UI hint only (empty for `DRAFT`/`FAILED`/`DISPUTED`/`DELIVERED`/`CANCELLED`).
    `executeWarehouseOperation` runs the console's own live `is_warehouse_operator()` guard, validates
    through Feature 009's `ShipmentIdInput`/`FailShipmentInput`/`CancelShipmentInput` (mandatory
    reason for `fail`/`cancel` — validated, never written: `order_shipments` has no reason column,
    Feature 009's recorded gap), then calls the SAME-named Feature 009 function with the shipment id
    only; no caller-supplied status exists anywhere. UI: `ShipmentOperationsPanel` reuses RUN B's
    `DecisionForm` (one radio choice, irreversible ops need reason + `AlertDialog`, Sonner outcome per
    Feature 009 code — `WAREHOUSE_NOT_CAPABLE`/`SHIPMENT_ORDER_NOT_SETTLED`/`SHIPMENT_NOT_EDITABLE`/
    `SHIPMENT_RESERVATION_UNAVAILABLE`/`SHIPMENT_SAVE_FAILED`; no console vocabulary). **Raw-write
    audit**: `grep -rn "order_shipments" src/app/dashboard-admin lib/admin` → reads/comments only
    (`lib/admin/read.ts` counts, `lib/admin/warehouse.ts` comments); the warehouse slice issues no
    `.update/.insert/.delete/.upsert` at all (test-pinned). **Live** (`tests/admin/warehouse-pages.test.tsx`,
    through the console's Server Action): `markReady` REQUESTED → READY succeeds pre-payment with
    trigger-set `ready_at`; `confirmCapacity` and `reserve` on an unsettled order are refused by the
    database with `SHIPMENT_ORDER_NOT_SETTLED` (settlement gate intact, pre-payment READY intact);
    `dispatch` from REQUESTED refused; unknown operation / reason-less cancel refused at validation;
    `cancel` with reason REQUESTED → CANCELLED then any further operation refused; FINANCE and plain
    member → `WAREHOUSE_NOT_CAPABLE`, anonymous → `PROFILE_AUTH_REQUIRED`; the warehouse-oversight
    inventory snapshot is byte-identical before/after every attempt (no drift, no duplicate
    reservation). Settlement-gated positive edges (`reserve`/`startPicking`/`book`/`dispatch` on a
    PAID order) are Feature 009's own recorded live evidence (`t024-transition-matrix-live`, T013
    18/18) — reused, not re-derived. **Suspended-organization policy**: not required by this Verify;
    the live trigger consults no organization status and no approved policy exists — the console
    neither blocks nor auto-continues (in-product note; spec Open items).

- [x] T018 [PS4] Implement delivered-quantity recording through 009's layer (warehouse-only,
  monotonic).
  - Req: FR-005, PS4 | Depends: T017
  - Verify: recording works for warehouse; decrease attempts and non-warehouse attempts are refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: irreversible custody reduction.
  - **Done (2026-09-16, RUN D)**: `lib/admin/warehouse.ts#recordWarehouseDelivery` → console guard →
    Feature 009's `RecordDeliveryInput` (absolute per-item totals, never a delta) → Feature 009's
    `recordDelivery` ONLY (which issues the guarded `shipment_items` write the database's
    `validate_shipment_item` decides: `only_warehouse_can_record_delivery`,
    `delivered_quantity_cannot_decrease`, `delivered_quantity_exceeds_plan`,
    `delivery_reservation_requires_settled_order`, and performs the position/allocation decrement
    itself), then RE-READS items + status so the UI shows exactly what persisted. Server Action
    `recordShipmentDelivery` forwards only `items[<id>]` rows the operator filled in (blank =
    untouched). UI: `RecordDeliveryForm` (one input per item, inline validation for shape / below
    current delivered / above plan, `AlertDialog` confirmation, Sonner per Feature 009 code incl.
    `SHIPMENT_ITEM_QUANTITY_INVALID`; rendered only for `DISPATCHED`/`PARTIALLY_DELIVERED`, an honest
    not-applicable statement otherwise). No console file writes `shipment_items`,
    `inventory_positions`, `inventory_reservations` or `storage_allocations` (test-pinned).
    **Live** (ordinary fixtures): member and FINANCE → `WAREHOUSE_NOT_CAPABLE`; WAREHOUSE on a
    not-yet-dispatched shipment → `SHIPMENT_NOT_EDITABLE`; negative/empty → `VALIDATION_ERROR`;
    delivered stays 0 and no position moves. **Reused Feature 009 live evidence** for the PAID-order
    legs (the literal decrease/over-plan refusals, partial stays partial, full → `DELIVERED` with zero
    stranded reservation): `tests/delivery/t017-record-delivery-live.test.ts` and
    `scripts/t013-delivery-live-proof.ts` scenarios 9–10 (recorded in DB-BLOCK-07's resolution) — the
    console adds no arithmetic that would need re-proving; delegation is pinned by
    `tests/admin/warehouse-operations.test.ts` (mocked Feature 009: exact parsed call, refusal codes
    pass through unchanged).

- [x] T019 [PS4] Implement custody/inventory oversight views (cross-organization, warehouse-only),
  rendering the live, database-owned delivery-reservation facts without recomputation.
  - Req: FR-017, PS4 | Depends: T004, 005's layer
  - Verify: positions render for warehouse roles only; delivery-reserved quantity comes from the
    approved 009/database contract; no substitute figure or arithmetic is computed
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the honest-capability judgment plus a cross-tenant read surface that only warehouse may have.
  - **Done (2026-09-16, RUN D)**: Feature 005's read model gained two WAREHOUSE-OVERSIGHT variants in
    its own files — `lib/inventory/positions.ts#getInventoryPositionsForWarehouseOversight` /
    `getInventoryPositionForWarehouseOversight` and
    `lib/inventory/allocations.ts#getStorageAllocationsForWarehouseOversight` — same DTOs, same
    lot/warehouse/order-context mappers, same pagination, no org filter (RLS `inventory_owner_read` /
    `storage_owner_read`'s `is_warehouse_operator()` branch is the boundary; a member calling them
    gets only its own rows — live-proven). Feature 005's own structural guards still hold (no
    quantity arithmetic, no third quantity, no write). `(warehouse)/inventory/page.tsx` (positions /
    allocations views, 50/page) and `inventory/[positionId]/page.tsx` re-verify
    `checkAreaAccess("inventory")`, label `available_quantity_kg` **"On hand (gross)"** and
    `reserved_quantity_kg` **"Reserved"** (the stored subset, which now includes Feature 009's live
    delivery reservation — DB-BLOCK-07 resolved; no stale copy), state that the free-to-trade figure
    is computed by the database at checkout and is deliberately NOT recomputed, show
    `storage_allocations` with the approved `STORED`/`RELEASED`/`DELIVERED` vocabulary, and are
    read-only (no adjustment control exists — no approved operation owns such a write, although
    `inventory_warehouse_write` would technically permit a raw UPDATE; deliberately not used).
    **Honest read gaps**: pure `WAREHOUSE` has no read path to `organizations` (owner name),
    `coffee_lots` (`catalog_admin_lots` = platform admin; `member_read_trade_lots` = authorized member
    + DB-OPEN-05) or `orders`/`order_items` (order code) — identifiers + in-product note; ADMIN sees
    the values. **Live** (`tests/admin/warehouse-pages.test.tsx`): WAREHOUSE (member of no
    organization) renders Org A's and Org B's seeded positions with `743.271 kg` on hand / `88.654 kg`
    reserved exactly as stored, no `654.617 kg` difference anywhere, both stored allocation quantities
    and statuses; the warehouse read returns byte-identical quantities to the member's own org-scoped
    read and spans >1 organization; FINANCE → `forbidden`, member → `no-operational-role`, anonymous →
    redirect; the member's call of the cross-org read never returns Org A's position (RLS).

- [x] T020 Confirm the variance/reconciliation model before building any reconciliation screen; the
  current authoritative finding is that no variance/reconciliation/HOLD/QUARANTINE representation
  exists, so retain an honest capability-gap record rather than inventing one.
  - Req: FR-017, spec Open items | Depends: T019
  - Verify: either screens are built on real fields, or the gap is recorded in the capability map and spec
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: AC-05 reconciliation is release-blocking; pretending to support it would be worse than recording the gap.
  - **Done (2026-09-16, RUN D) — GAP CONFIRMED AND RECORDED; NO SCREEN BUILT.** Exact investigation
    (test-pinned in `tests/admin/warehouse-operations.test.ts`): the live schema report
    (`docs/database/database-schema-report.json`, 68 tables, 0 views, 0 enums) has NO table, column,
    constraint or function matching variance / discrepancy / reconciliation / quarantine / stock- or
    cycle-count / write-off / shrinkage / warehouse-hold / inventory-adjustment (the only "variant"
    is `order_items.variant_name_snapshot`); `storage_allocations.status` is exactly
    `STORED`/`RELEASED`/`DELIVERED`; `inventory_positions` has only `available_quantity_kg` /
    `reserved_quantity_kg`; the only `HOLD` is `orders.status` (a payment hold) and the only `FROZEN`
    is `disputes.status`; `inventory_ownership_events.event_type` lists `ADJUSTMENT`, but the table
    has no INSERT policy for `is_warehouse_operator()` (`ownership_admin` is SELECT-only; the
    `prevent_ownership_event_mutation` trigger makes it append-only) and the ONLY writer is
    `admin_review_payment` — so no warehouse adjustment path exists; every applied migration
    (2026-09-09 → 2026-09-14) adds none of these. Recorded as **DB-OPEN-19** in the capability map,
    in spec.md Open items and in-product (`ReconciliationGapNotice` on the inventory area: no form,
    button or input). **AC-05 (reconciliation) remains release-blocking.** Minimum future capability:
    an approved, append-only inventory adjustment/variance record (position, warehouse, counted vs.
    recorded quantity, reason, actor, correlation) plus a warehouse-only decision path applied by the
    database, through the Constitution's database-change process. Closed on the Verify's second
    branch ("the gap is recorded in the capability map and spec").

---

## Phase 7 — Catalogue management

- [x] T021 [PS6] Implement coffee management (create/edit/publish/unpublish) with
  `is_platform_admin()` enforcement.
  - Req: FR-002, PS6 | Depends: T004
  - Verify: non-admin roles refused; status transitions respect `coffees_status_check`
  - RUN E continuation (2026-09-16): implemented (list/create/edit + the four named operations
    publish/unpublish/archive/restore, compare-and-set, DRAFT-only create, no status field on the
    form, no delete path, `is_platform_admin()` re-verified per write and per page). Static proof
    GREEN (`run-e-static`: vocabulary = `coffees_status_check`, non-admin refusal path, no generic
    setter). LIVE proof (disposable ADMIN allowed; WAREHOUSE/FINANCE/COMPLIANCE/AUDITOR/member/
    anonymous refused by action and URL; create/edit/publish/unpublish against real rows) is written
    in `run-e-live.test.tsx` — EXECUTED 2026-09-16, green (13/13) after the fixture-password rotation; browser
    proof green. **RECORDED.**
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: CRUD over an admin-scoped table.

- [x] T022 [P] [PS6] Implement origin, region, taxonomy and warehouse management surfaces.
  - Req: FR-002, PS6 | Depends: T004
  - Verify: each respects its status vocabulary; non-admin refused
  - RUN E continuation (2026-09-16): origins (ACTIVE/INACTIVE/ARCHIVED = `origins_status_check`),
    regions (no status), taxonomy (five explicit kinds → fixed tables, varieties bound to a coffee
    type, no generic table editor), warehouses (code/name/country/city/address/owner/is_active —
    reference fields only, no inventory/custody/shipment write) + named locations. Static proof
    GREEN; live proof EXECUTED green (region/origin/tag/warehouse+location created, edited, attributed;
    bad origin status refused; owner NOT NULL and nullable country_code corrected from the schema).
    **RECORDED.**
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: repetitive CRUD across several small tables.

- [x] T023 [PS6] Implement `lib/admin/catalogue.ts` — every catalogue mutation revalidates the
  corresponding 002 public cache tag.
  - Req: FR-007, SC-005 | Depends: T021, T022
  - Verify: publishing a coffee makes it publicly visible after revalidation; unpublishing 404s it
  - RUN E continuation (2026-09-16): `lib/admin/catalogue.ts` re-verified against CURRENT Feature
    002 — `lib/public/cache.ts` tags reused verbatim (`public-coffees`, `public-coffee:<slug>`,
    `public-origins`, `public-origin:<slug>`, `public-taxonomy`), `revalidateTag(tag, { expire: 0 })`
    (Feature 001's pinned call), old AND new slug on rename, no `revalidatePath` of any public
    route, warehouses revalidate nothing public; `lib/public/coffees.ts` still caches with exactly
    those tags and filters `status = PUBLISHED`. Static proof GREEN. The END-TO-END proof this Verify
    requires (publish through the console → public route 404→200; unpublish → 404, against a
    running server, plus the anonymous RLS read and `__fetchCoffeeDetailUncached`) is written in
    `run-e-live.test.tsx` + `feature010-rune.browser.mjs` — EXECUTED: unit (public read null → coffee →
    null, anonymous RLS read, exact tags) and REAL server round trip 404 → 200 → 404. **RECORDED.**
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the one place the console touches the public surface; a missed tag leaves the public site stale.

- [x] T024 [P] Implement media management for published content (subject to DB-BLOCK-01 for uploads).
  - Req: FR-017 | Depends: T021
  - Verify: media records manageable; upload path remains inert with an honest explanation
  - RUN E continuation (2026-09-16): `coffee_media` records readable per coffee and across the
    catalogue; primary flag + sort order manageable (no insert, no delete, `file_assets` never
    written); `CATALOGUE_MEDIA_UPLOAD_AVAILABLE = false` — the only Storage bucket in the approved
    schema is the private `kyb-evidence` one, no catalogue bucket/policy/seam exists (DB-BLOCK-01 for
    public media); the panel states this with no file input and no fake success. No avatar/logo/
    favicon/branding (T047 + account-avatar gap remain separate). Static proof GREEN; live proof
    EXECUTED on the seeded metadata-only record (set primary, reorder, FINANCE refused, missing
    record NOT_FOUND, page shows the upload gap with no file input). **RECORDED.**
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: bounded surface with a known blocked seam.

---

## Phase 8 — Audit area

- [x] T025 [PS7] **RUN E: read-only views CLOSED without a 012 layer (see status).** Implement read-only auditor views
  by composing that layer with dedicated read-only components (no disabled buttons — the affordance
  never exists).
  - Req: FR-009, SC-007, PS7 | Depends: T004
  - Verify: auditor fixture sees data with zero mutation controls; every mutation attempt is refused
  - RUN E continuation (2026-09-16): the blocker note above is superseded for the READ-ONLY views
    (no Feature 012 substitute was built — no unified timeline, no dispute/history logic):
    `lib/admin/audit.ts` composes only auditor-readable reads (`coffee_offers`,
    `listing_status_history`, `inventory_positions`, `storage_allocations` — verified against the
    schema report's `is_auditor()` branches) through the existing RUN B/RUN D read functions;
    `(audit)/audit` + `audit/listings/[offerId]` import no Server Action, no decision/record form,
    no mutation hook (test-pinned); `audit` area is `live` on `is_auditor`. Static proof GREEN.
    The Verify's AUDITOR-fixture proof (reads succeed; direct `decideListing`/`decideKybApplication`/
    `transitionCoffee` refused; direct table write affects zero rows; member/anonymous refused) EXECUTED
    green; browser: 3 audit surfaces × 5 appearances with 0 mutation controls. **RECORDED.**
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "read-only by construction" is a stronger guarantee than "disabled in the UI" and must be built that way.

- [x] T026 [PS7] Handle `audit_logs` access honestly per DB-OPEN-06 (auditors may be unable to read
  it) — explain rather than error.
  - Req: FR-017, spec Open items | Depends: T025
  - Verify: with an auditor fixture, the audit-log area explains the limitation and cites the open item
  - RUN E continuation (2026-09-16): DB-OPEN-06 re-checked against the CURRENT schema report —
    `audit_logs` has exactly one policy, `audit_admin_read` = `is_platform_admin()`; no auditor
    branch → still OPEN, no policy change made. `probeAuditLog` reads under the caller's own session
    (zero rows / permission error → the honest gap; no service role); `AuditLogPanel` renders the
    DB-OPEN-06 statement (`data-capability-gap="db-open-06"`) with no raw RLS/Postgres text —
    render-proven statically AND live with the AUDITOR fixture (zero-row `audit_logs` read → the
    DB-OPEN-06 statement, no raw policy text) and in Chrome. **RECORDED on the honest-gap branch.**
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: honest capability reporting on a policy gap the SRS expects to be closed.

---

## Phase 9 — System configuration (SUPER_ADMIN)

- [x] T027 [PS8] Implement platform-admin role management (SUPER_ADMIN only).
  - Req: FR-002, PS8, SEC-003 | Depends: T004
  - Verify: ADMIN is refused; SUPER_ADMIN succeeds; changes are attributable
  - RUN F (2026-09-17) — **PARTIAL (D2 ii)**: implemented and live-proven (ADMIN + every other role
    refused by action and URL; SUPER_ADMIN grants/changes/deactivates with compare-and-set; self-change
    refused). "Changes are attributable" holds for the GRANT (`created_by`) but NOT for a role change or
    deactivation — `platform_admins` has no `updated_by` and no audit trigger (schema fact, test-pinned).
    Stays unchecked until the recorded minimum DB change (status block) is approved and applied.
  - **Database hygiene M1 (2026-09-20) — PREPARED, NOT APPLIED; T027 stays unchecked.** Human decisions taken:
    `platform_admins` is audited by a sibling function keyed on `user_id` (no `id` column — the shared
    `write_audit_log()` would raise on every write), `updated_at` becomes DB-owned by trigger and `lib/admin/roles.ts` no
    longer sets it. Migration `supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql` (+ rollback under `supabase/rollback/`, postflight under
    `supabase/maintenance/`); static contract `tests/admin/config-attribution-migration.test.ts`; live proof
    `tests/admin/config-attribution-live.test.ts` (role grant/change/deactivation → one audit row each with the SUPER_ADMIN as
    actor, `updated_at` advances). Closure = apply → postflight → live proof → remove `AttributionGapNotice` and update the two
    RUN F tests that pin the gap.
  - **Database hygiene M1 (2026-09-20) — COMPLETE (literal Verify met, live).** Migration `supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql`
    applied; postflight 15/15. **Verify**: (1) "ADMIN is refused" — `run-f-live` (direct action and URL; raw ADMIN update affects 0 rows) and
    `config-attribution-live` (ADMIN/finance/member/anonymous refused with the same codes, **no audit row**); (2) "SUPER_ADMIN
    succeeds" — grant, role change and deactivation live; (3) "changes are attributable" — each operation wrote exactly ONE
    `audit_logs` row keyed on the operator's `user_id`, actor = the SUPER_ADMIN's `auth.uid()`: grant → INSERT (new row incl.
    `created_by`), role change → UPDATE COMPLIANCE→AUDITOR, deactivation → UPDATE `is_active` true→false; `updated_at`
    advances on each (and a raw attempt to backdate it is overridden by the trigger). The console no longer writes
    `updated_at`. `AttributionGapNotice` removed from every page; the role-change form now states that changes are recorded.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this surface grants operational power to people — the highest-privilege action in the system.

- [x] T028 [P] [PS8] Implement tax rule and shipping rule configuration (SUPER_ADMIN only), with
  clear indication that changes affect future snapshots only. *(Commission configuration is T042 —
  split out because it carries its own immutability and coverage semantics.)*
  - Req: FR-002, PS8 | Depends: T004
  - Verify: ADMIN refused; existing order snapshots are unaffected by later configuration changes
  - RUN F (2026-09-17) — RECORDED: ADMIN refused by action and URL; `order_financials` snapshots
    byte-identical across rule changes (live); future-only stated on every tax form; shipping rules
    carry the honest "not applied by any checkout/shipment path yet" notice (no consumer exists).
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: misunderstanding snapshot semantics here could retroactively distort commercial records.

- [x] T042 [PS8] Implement **commission configuration** inside the existing `/dashboard-admin`
  surface, managing the existing `commission_policies` and `commission_tiers` tables — no parallel
  or shadow commission tables, no schema change. Behavioural reference:
  `docs/database/commission-capability.md`.
  **Scope**: list policies with `name`, `status` (`DRAFT`/`ACTIVE`/`ARCHIVED`), `effective_from`,
  `effective_until`; create and manage policies within the approved schema; add/edit a policy's
  tiers (`min_quantity_kg`, `max_quantity_kg`, `percentage`); activate/deactivate by moving `status`
  between the CHECK-approved values only.
  **Semantics the UI must convey**: tier selection is by **total order quantity**, minimum
  inclusive, maximum exclusive, and `max_quantity_kg = NULL` means an open-ended top band; the
  selected percentage applies to the whole applicable base (not progressive banding); overlapping
  ACTIVE policies resolve to the latest `effective_from`.
  - Req: FR-002, PS8 | Depends: T004
  - Verify: `ADMIN` (non-super) is refused in the application **and** by RLS; `SUPER_ADMIN` succeeds; the screens read/write only `commission_policies`/`commission_tiers`; `grep -rn "commission" src/app/dashboard src/app/\(public\)` shows no member or public commission surface
  - RUN F (2026-09-17) — RECORDED: live (ADMIN `system_not_capable` in-app and 42501 by RLS; SUPER_ADMIN create/tiers/named status operations), static (`.from()` set = exactly the two tables; no member/public commission surface).
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a configuration screen that silently mis-states tier semantics would cause every future order to be priced on a rate the operator did not intend.

- [x] T043 [PS8] Enforce the commission authorization boundary in the application layer as well as
  RLS: every commission read/mutation path verifies `is_super_admin()` server-side before calling
  the database, and the existing `commission_admin` / `tiers_admin` RLS policies are left unchanged.
  - Req: FR-001, FR-002, SEC-003 | Depends: T042
  - Verify: an `ADMIN`, `COMPLIANCE`, `WAREHOUSE`, `FINANCE`, `AUDITOR` and plain member fixture are each refused — by direct URL and by direct action invocation; no migration or policy edit appears in the diff
  - RUN F (2026-09-17) — RECORDED: all six refused live by action and URL; every `commission.ts` export calls `requireSuperAdmin()` before `createClient()` (count-pinned); `commission_admin`/`tiers_admin` exactly as reported; `supabase/` untouched.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: defence in depth on the highest-privilege commercial configuration in the platform; RLS alone is the backstop, not the only gate.

- [x] T044 [PS8] Make historical immutability explicit in the commission UI: state that **"Changes
  apply to eligible future checkouts only"** at the point of change, and provide **no** normal
  action — button, bulk operation, or menu item — that recalculates, restates or re-snapshots
  historical orders, commission amounts, seller net amounts or payouts.
  - Req: FR-002, PS8 | Depends: T042
  - Verify: the copy is present on both policy and tier mutations; `grep -rniE "recalculat|re-?snapshot|restate|backfill" src/app/dashboard-admin` returns nothing that acts on historical financial records.
  - RUN F (2026-09-17) — RECORDED: future-only copy on the policy form, both tier forms and the status confirmation (EN/AR); the grep's only hits are statements of absence (comments/copy) — none on an action, button or query (test-pinned); live: `order_financials` unchanged across mutations. The current 008 Phase-1 foundation has no T032 evidence, so historical-snapshot integration verification remains an explicit 008 dependency rather than an unsatisfied claim in 010; 010 verifies its own UI has no restatement action.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the one place a well-meaning "fix historical commissions" feature would plausibly be added — its absence must be deliberate and visible.

- [x] T045 [PS8] Surface tier **coverage gaps** to the operator: show, for a policy, which quantity
  ranges have no covering band, because an uncovered total quantity currently yields a **0%**
  commission at checkout rather than an error (`COMMISSION-OPEN-01`). Present this as an
  operational warning; do **not** implement either resolution option — the fallback decision is
  Business/Finance's, owned by Feature 008.
  - Req: FR-002, PS8, spec Open items | Depends: T042
  - Verify: a policy with bands `0–100` and `250–NULL` visibly warns about the uncovered `100–250` range; the UI neither blocks checkout nor silently "fixes" the gap; `COMMISSION-OPEN-01` is cited in the surface or its handoff notes
  - RUN F (2026-09-17) — RECORDED: the literal case proven statically, live (real rows) and in Chrome (`data-coverage-gap="100-250"`, COMMISSION-OPEN-01 cited on the panel); no fallback rate, no checkout block exists in the commission layer.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: makes a silent revenue-affecting misconfiguration visible without pre-empting an open business decision.

- [x] T029 [P] [PS8] Implement payment-account configuration (`is_platform_admin()`), flagged as a
  high-risk action pending the OPS-01 dual-control decision.
  - Req: FR-002, SEC-003, spec Open items | Depends: T004
  - Verify: member paths remain absent; changes are attributable; the dual-control gap is noted in-product
  - RUN F (2026-09-17) — **PARTIAL (D2 ii)**: implemented and live-proven (no member path — static + live;
    OPS-01 + high-risk notices on every page; ADMIN read-only / SUPER_ADMIN write = the DB `WITH CHECK`).
    "Changes are attributable" holds for creation (`created_by`) but NOT for an edit/deactivation — no
    `updated_by`, no audit trigger on `payment_accounts`. Stays unchecked pending the recorded DB change.
  - **Database hygiene M1 (2026-09-20) — PREPARED, NOT APPLIED; T029 stays unchecked.** `payment_accounts` gets a REDACTED audit
    (decision 1): `write_audit_log_payment_accounts()` stores an allow-list only — last four characters of `account_number` /
    `iban` plus `account_number_changed` / `iban_changed` flags, never the values (no hash either); the generic
    `write_audit_log()` (which copies the whole row) is deliberately NOT attached to this table. Same migration, tests and
    closure steps as T027 (see there). The dual-control (OPS-01) statement in the product is unchanged.
  - **Database hygiene M1 (2026-09-20) — COMPLETE (literal Verify met, live).** **Verify**: (1) "member paths remain absent" —
    static (no member file references the table or its console lib) + live (member/anonymous read nothing, refused by RLS and by the
    domain layer, unchanged); (2) "changes are attributable" — `payment_accounts` create → INSERT, edit (bank name + account
    number) → UPDATE, deactivation → UPDATE, each ONE audit row with the SUPER_ADMIN as actor and `updated_at` advancing;
    (3) "the dual-control gap is noted in-product" — unchanged (`HighRiskNotice` / OPS-01 on every page). **Redaction proven**:
    across all four audit rows of the proof account (incl. the service-role cleanup DELETE) neither account numbers, nor the
    IBAN (with or without spaces, any case) appear anywhere; the rows carry only `account_number_last4` / `iban_last4`
    (`****` + last four), `account_number_changed` / `iban_changed` flags and `metadata.redaction = last4_only`.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: bank-detail changes are explicitly called out as high-risk in the SRS; the missing maker-checker must be visible.

---

## Phase 10 — Automated tests

- [x] T030 Write `tests/admin/access-matrix.test.ts` — iterate `lib/admin/areas.ts` × all six role
  fixtures + a member-without-role, asserting allowed areas render and forbidden areas are refused by
  direct URL and direct action invocation.
  - Req: FR-002, SEC-001, SC-001, SC-004 | Depends: T001, T004
  - Verify: `npm test -- admin/access-matrix` passes for every combination; adding an area without a role entry fails the test
  - RUN G (2026-09-17) — RECORDED: all six live role fixtures (WAREHOUSE/FINANCE standing;
    COMPLIANCE/ADMIN/AUDITOR/SUPER_ADMIN disposable) × every declared area (not a sample) + member +
    anonymous; a dedicated meta-test proves the matrix check itself catches a missing/invalid role
    entry; a live cross-role "direct action" block proves four real domain functions (warehouse,
    KYB decision, catalogue, commission) refuse every non-owning role, not merely the page.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the definitive proof of least privilege across the whole console, and the guard against future drift.

- [ ] T031 [P] Write `tests/admin/delegation.test.ts` — the console contains no direct
  `admin_review_payment` call and no raw shipment/inventory write.
  - Req: FR-004, FR-005, SC-002 | Depends: T014, T017
  - Verify: `npm test -- admin/delegation` passes; greps are part of the assertion
  - RUN G (2026-09-17) — **BLOCKED (Depends: T014 unmet)**: `tests/admin/delegation.test.ts` created
    and green — no `admin_review_payment`/`submit_payment_proof` reference and no raw shipment/
    inventory write anywhere in the console (T017 half, complete); Feature 008's `decidePayment()`
    is re-confirmed absent, so there is no settlement decision UI to prove delegates correctly. Stays
    unchecked.
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: structural guarantee that the console never becomes a second transactional engine.

- [ ] T032 [P] Write `tests/admin/decisions.test.ts` — every KYB/listing/payment/dispute decision
  records reviewer, decision and reason and changes status exactly once, including under concurrent
  operators.
  - Req: FR-006, SC-003 | Depends: T009, T011, T014
  - Verify: `npm test -- admin/decisions` passes, including the concurrency cases
  - RUN G (2026-09-17) — **BLOCKED (Depends: T014 unmet)**: `tests/admin/decisions.test.ts` created
    and green — KYB and listing decisions proven live (reviewer/decision/reason recorded, exactly
    once, INCLUDING a two-operator concurrency race for each); payment decisions proven honestly
    absent (no `decidePayment`); dispute decisions proven honestly absent (Feature 012/T012 not
    started, `disputes` area still `blocked`). Nothing fabricated. Stays unchecked.
  - **Dispute-unblock run (2026-09-19) — dispute half PROVEN; task still BLOCKED (Depends: T014 unmet).** The
    "honestly absent" dispute test is replaced by six LIVE tests through the console's own `recordDisputeTransition`:
    a valid review → resolve → close path records actor/from/to/exact reason/time once per change (resolution
    written once, `resolved_at` = the history row's time) and a repeat is refused `dispute_stale` with nothing
    recorded; member, unrelated member, WAREHOUSE, FINANCE, AUDITOR and anonymous → `compliance_not_capable`; an
    unapproved pair refused by the console AND by `transition_dispute()` directly (`invalid_dispute_transition`),
    an unknown status / missing observed status / short reason → validation error; a stale decision refused; two
    independent COMPLIANCE sessions (per-request session binding) racing the same OPEN dispute → exactly one
    success, one history row, loser `dispute_stale`; zero order/shipment/payment/reservation/history/custody change.
    `npm test -- admin/decisions` → 11/11. The payment half remains honestly absent (no `decidePayment()`); per the
    literal `Depends: T014`, T032 stays UNCHECKED.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: attribution and single-effect semantics for irreversible operational decisions.

- [ ] T033 [P] Write `tests/admin/no-hard-delete.test.ts` — no console path deletes commercial,
  inventory, title, payment or audit rows.
  - Req: FR-008, SC-006 | Depends: Phases 3–9
  - Verify: `npm test -- admin/no-hard-delete` passes; grep for `.delete(` across console code returns only non-commercial cases
  - RUN G (2026-09-17) — **PARTIAL (Depends: Phases 3–9 unmet)**: `tests/admin/no-hard-delete.test.ts`
    created and green — zero `.delete(` calls anywhere in the CURRENT console, and every table the
    console's own code references carries no DELETE grant for `authenticated`/`anon` (derived
    dynamically, not hand-maintained). This is the honest, exhaustive proof available today; it
    cannot cover surfaces that do not exist (T010/T012/T013–T015/T027/T029 remain open). Stays
    unchecked pending those.
  - **Database hygiene M1 (2026-09-20) — still PARTIAL (Depends: Phases 3–9 unmet).** T027 and T029 are now closed, so the ONLY
    open Phase 3–9 tasks are T013–T015 (Feature 008). `tests/admin/no-hard-delete.test.ts` updated accordingly.
  - **RUN J (2026-09-19) — still PARTIAL (Depends: Phases 3–9 unmet).** T010 closed, so the open list is now
    T013–T015 (Feature 008) and T027/T029 (DB-OPEN-21). The organization status surface is scanned with the rest
    of the console (no `.delete(`; `organizations` has no DELETE grant; the RUN J guard refuses a COMPLIANCE
    delete path anyway — live: 0 rows). `tests/admin/no-hard-delete.test.ts` updated accordingly (5/5).
  - **Dispute-unblock run (2026-09-19) — still PARTIAL (Depends: Phases 3–9 unmet).** Feature 012's closure removes
    T012 from the open list only: the console dispute surface and the Feature 012 files it composes are now scanned
    (no `.delete(`), `disputes`/`dispute_evidence` carry no DELETE grant, and the `dispute_status_history` migration
    grants SELECT only. Still open: T010, T013–T015, T027, T029 — so exhaustive Phase 3–9 coverage cannot be claimed.
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: OPS-02 compliance across a broad surface.

- [x] T034 [P] Write `tests/admin/catalogue-revalidation.test.ts` — publish/unpublish reflects on the
  public site after revalidation.
  - Req: FR-007, SC-005 | Depends: T023
  - Verify: `npm test -- admin/catalogue-revalidation` passes
  - RUN G (2026-09-17) — RECORDED: `tests/admin/catalogue-revalidation.test.tsx` created and green,
    independently re-proving T023's public-cache contract (DRAFT not public → publish → public
    visible with exact tags `public-coffees`+`public-coffee:<slug>` and `{ expire: 0 }`, no path
    purge, no shared cache → second publish STALE → unpublish → public 404/null again → a raw
    anonymous write is refused).
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature cache correctness with a clear assertion.

- [x] T035 Write `tests/admin/auditor-readonly.test.ts` — auditor surfaces expose zero mutation
  affordances and refuse all mutations.
  - Req: FR-009, SC-007 | Depends: T025
  - Verify: `npm test -- admin/auditor-readonly` passes
  - RUN G (2026-09-17) — RECORDED: `tests/admin/auditor-readonly.test.ts` created and green,
    independently re-proving T025/T026 (zero mutation affordances render for AUDITOR on the audit
    list AND listing-detail pages; six distinct domain mutation paths — listing, KYB, catalogue,
    warehouse, roles, commission — refuse AUDITOR live; a direct raw table write affects zero rows;
    DB-OPEN-06 is honestly stated from a live zero-row read and its policy is unchanged in every
    migration; no service-role fallback).
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: read-only-by-construction must be proven, not assumed.

---

## Phase 11 — States, accessibility, RTL

- [x] T036 State coverage across all console areas (loading, empty, error, unauthorized, forbidden,
  not-found, plus domain states).
  - Req: FR-014 | Depends: Phases 3–9
  - Verify: each state renders; empty queues show honest empty states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.
  - **RUN H (2026-09-17) — RECORDED, Verify met over every CURRENT surface** (`tests/admin/state-coverage.test.tsx`,
    14 tests: 8 static + 6 live with the disposable SUPER_ADMIN, de-privileged after). Matrix: **loading** — route
    `loading.tsx` (`StateScreen loading`); **error** — route `error.tsx` renders the generic screen and never
    `error.message`/`stack`/`cause` (rendered with a fabricated 42501 message → no raw text), PLUS an inline `error`
    card on every list page whose read Feature 010 owns (17 list pages: catalogue ×6, system ×5, KYB queue, listing
    queue, organizations, audit ×3 — proven live with a proxied client whose DOMAIN tables return a PostgREST error
    while identity tables pass through); **not-found** — all 16 detail pages × {nil UUID, malformed id} render
    `not-found`, no form, no fabricated record; **empty** — the three configuration lists that are genuinely empty
    live (shipping rules, payment accounts, commission policies) render the honest `empty` card; **unauthorized**
    (anonymous → `/admin/sign-in/`), **forbidden** (WAREHOUSE on a super-admin area), **no-operational-role**
    (member) are three distinct live outcomes on the same page; **blocked** — payments/payouts/invoices (Feature 008)
    and disputes (Feature 012) stay `AdminAreaPlaceholder` (`blocked`, no table, no sample rows); **capability-gap /
    domain states** — DB-OPEN-06 audit-log card, organizations gap (now distinguished from a read ERROR), KYB
    readiness/document gaps, coffee media upload unavailable, publication not-operable, commission coverage gaps,
    every system notice (`data-system-notice`). **Fixes made**: Feature 010 reads swallowed PostgREST errors and
    rendered EMPTY lists (dishonest) — `lib/admin/{catalogue,commission,pricing-rules,payment-accounts,roles,
    compliance}.ts` now throw internal `<domain>_read_failed` codes (writes untouched); the five system list pages
    catch → `SystemLoadError`; the organizations page distinguishes `error` (probe failed) from `capability-gap`
    (RLS filtered every row). **Recorded, not changed**: the warehouse queues/custody surfaces compose Feature
    009/005 read layers whose contract degrades a database error to an empty result — they render the honest empty
    state and never raw text; an inline error there needs the owning features' read contract. Dependency note:
    `Depends: Phases 3–9` is not fully closed (T010, T012–T015, T027, T029 open); coverage is over every surface
    that EXISTS today, and the surfaces those open tasks would add do not exist to have states — marked per the
    RUN H directive ("if the literal Verify clauses pass, mark COMPLETE").

- [x] T037 Accessibility, RTL and responsive pass for the console (dense tables, keyboard traversal,
  drawer behaviour, dot+label badges, monospace codes).
  - Req: FR-015 | Depends: Phases 3–9
  - Verify: a11y check clean; grep for physical CSS properties returns nothing; tables usable by keyboard
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: dense operational tables are the hardest accessibility surface in the product.
  - **RUN H (2026-09-17) — RECORDED, all three Verify clauses met.** (1) **a11y check clean**: real Chrome (CDP) +
    axe-core with colour-contrast on, `tests/browser/feature010-runh.browser.mjs` against `next dev` on :3230 —
    **33 surfaces × 6 appearances = 198 renders, 0 axe violations**, exactly one `<main>` and an `h1` each, correct
    `lang`/`dir`/theme, no horizontal overflow and no element past the viewport, every status badge text-labelled,
    no raw error text. Scenarios: en-light-1366, en-dark-390, ar-light-1920, ar-dark-1366, ar-light-390,
    en-dark-1920. Surfaces: overview, account; compliance KYB queue + detail, organizations, listing queue +
    detail, disputes (blocked); warehouse shipments queue + detail, inventory, position detail; catalogue coffees,
    coffee detail, coffee create, warehouses, warehouse detail, media, taxonomy; audit listings, custody, log;
    system roles, role detail, tax, shipping (empty), payment accounts; finance payments/payouts/invoices
    (blocked); not-found ×3 (KYB, coffee, commission); member `no-operational-role` (EN + AR); anonymous →
    `/admin/sign-in/`. Responsive: desktop `<table>` shown at 1366/1920 and hidden at 390 (card list) on the KYB
    queue and coffees — 12 checks. Keyboard: Tab reaches a row link with a visible 2px solid focus ring on the KYB
    queue AND the roles list. Drawer (390, AR): trigger `aria-expanded`, opens a `role="dialog"` with focus inside
    and 23 navigation links, Escape closes and focus returns to the trigger. Forms: coffee create — empty name →
    `aria-invalid="true"`, `aria-describedby` → `role="alert"` on the exact field, label associated, no navigation;
    listing decision — missing reason → exact-field alert; with a reason → `alertdialog` (labelled, focus inside,
    0 axe violations), Escape cancels, listing still PENDING_REVIEW (no write). (2) **grep for physical CSS returns
    nothing**: `tests/admin/console-a11y-pins.test.ts` scans every file under `src/app/dashboard-admin`,
    `components/admin`, `lib/admin` for physical-direction Tailwind utilities (`ml-/mr-/pl-/pr-/left-/right-/
    text-left/text-right/border-l/border-r/rounded-l/rounded-r/float-…`) and inline styles — 0 offenders; the
    repo-wide pin in `tests/design/hills-tokens.test.tsx` still holds. (3) **tables usable by keyboard**: real
    `<table>` + `<caption>` at `lg:`, card list below, row links reachable by Tab (above). **Fix made**: the
    console shell's member refusal (`src/app/dashboard-admin/layout.tsx`) used the string-only `StateScreen`
    and therefore rendered ENGLISH under `lang="ar"` — replaced with the bilingual `AdminStateCard`
    (`no-operational-role`, the same state the per-area guard renders). Dependency note as T036.

---

## Phase 12 — Verification & closure

- [ ] T038 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - **RUN H (2026-09-17) — verification recorded as readiness proof (typecheck/build/diff-check exit 0; lint and test exit non-zero for recorded pre-existing reasons); NOT closable: `Depends: all` is unmet** (T010, T012, T013,
    T014, T015, T027, T029, T031, T032, T033, T047, T048 open). Results: `npm run lint` → exit 1, **273 problems
    (124 errors, 149 warnings) = the recorded repo baseline exactly** (272 in `docs/claude-design/` + 1
    pre-existing unused-import warning in `tests/listings/manage-page.test.tsx`, untouched by 010); zero findings
    in any file Feature 010 touched. `npm run typecheck` → exit 0. `npm test` (RUN H time) → 149 files: 146 passed, 1 failed, 2 gated-skipped; 1672 tests: 1665 passed, 1 failed, 6 skipped; 1943.65 s; exit NON-ZERO — the single failure was the RECORDED pre-existing static assertion in `tests/delivery/t013-live-proof.test.ts` (expected the seed script to contain the literal `role: "ADMIN"`, which RUN B's `createDisposableOperatorFixture` refactor renamed to `platformAdminRole: "ADMIN"`; fails identically on the untouched tree since RUN B, first recorded in RUN D — Feature 009 test ownership, not patched by 010; neither that file nor the seed script changed in RUN H). **REPAIRED same day (Feature 009 stale-test repair, test-only change to `tests/delivery/t013-live-proof.test.ts`, scoped to the `T013_DELIVERY_ADMIN_FIXTURE` block; no production code, no Feature 010 file, no DB/RLS/grant/trigger change): `npm test` now → 149 files: 147 passed, 2 gated-skipped; 1672 tests: 1666 passed, 0 failed, 6 skipped; 1524.96 s; `TEST_EXIT=0`.** Every Feature 010 suite passed both times (23 files under `tests/admin/`, incl. the four RUN H files: 14 + 6 + 4 tests). This does NOT close T038 — `npm run lint` still exits 1 on the pre-existing repo baseline (273/124/149) and `Depends: all` remains unmet (T010, T012, T013, T014, T015, T027, T029, T031, T032, T033, T047, T048 open)
    `npm run build` → exit 0 (compiled, 67/67 static pages, every `/dashboard-admin/*` route dynamic ƒ). `git diff --check` → exit 0 (only autocrlf LF→CRLF notices). **So even apart from dependencies, the literal Verify "four exit-0 results" is NOT met: `npm run lint` (baseline) and `npm test` (the recorded 009 assertion) exit non-zero.** Green tests do not satisfy the
    missing task dependencies; the checkbox stays open.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [x] T039 Confirm `/dashboard-admin` authorizes independently of `/dashboard` and that neither
  implies the other.
  - Req: FR-001, SC-004 | Depends: T038
  - Verify: an approved trading member with no operational role is refused everywhere in the console; an operator with no organization is refused member trading routes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the Constitution-locked surface-separation guarantee, checked from both directions.
  - **Done, Verified (2026-09-23, Provider-Independent Final Verification).** Surface-separation guarantee proven
    end-to-end: (1) `dashboard-admin` authorization is strictly enforced server-side via `src/app/dashboard-admin/layout.tsx`
    calling `getRequestIdentity()` (`lib/auth/dal.ts`) and per-area route-group layouts invoking `lib/admin/guards.ts`
    (`checkGroupAccess`/`checkRoleFunctionAccess`) — not dependent on UI hiding; (2) non-admin users (Buyer/Seller
    trading members with no operational role) are refused by `checkConsoleShellAccess()` and ALL 22 declared
    `ADMIN_AREAS` with `no-operational-role`, rendering `<AdminStateCard kind="no-operational-role">` without `{children}`
    or navigation; (3) mutating Server Actions across all areas re-verify operational roles server-side and reject
    non-admin users with controlled error codes (`ACTION_FEEDBACK.ADMIN_FORBIDDEN`, `compliance_not_capable`, etc.) before
    any DB call; (4) no unsafe shared auth state exists — session identity is resolved per-request via `auth.getUser()`
    under request-scoped cookies, and React `cache()` de-duplicates solely within a single render pass without cross-request
    persistence; (5) no accidental permission inheritance — role checks end in discrete database SECURITY DEFINER functions
    (`is_compliance_operator`, `is_warehouse_operator`, `is_finance_operator`, `is_auditor`, `is_platform_admin`,
    `is_super_admin`) reflecting the approved hierarchy; (6) an operator with no organization is admitted to `/dashboard-admin`
    but denied member trading routes (`/dashboard` renders onboarding; `/dashboard/coffee` marketplace guard refuses);
    (7) verified live in `tests/admin/surface-separation.test.tsx` (4/4 tests passed: 70.69s) and `tests/admin/access-matrix.test.tsx` (T030).

- [x] T040 Confirm no service-role usage and no public/shared caching of operational data.
  - Req: SEC-002, SEC-005, FR-011 | Depends: T038
  - Verify: `grep -rn "SERVICE_ROLE" src/app/dashboard-admin lib/admin` returns nothing; operational reads are uncached
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.
  - **Done, Verified (2026-09-23, Provider-Independent Final Verification).** Verified across production code, build output,
    environment boundaries, and cache usage: (1) no Supabase service-role secret exists in client bundles or public build
    artifacts — `git grep -i "SERVICE_ROLE"` in `src/`, `components/`, `lib/` yields 0 code hits (only a comment in
    `lib/admin/catalogue.ts` noting database-only privilege); search across `.next/static/**/*.js` confirms zero instances of
    `SUPABASE_SERVICE_ROLE_KEY` or service-role secret strings; `SUPABASE_SERVICE_ROLE_KEY` is exclusively consumed by test
    seeding (`scripts/seed-test-fixtures.ts`); (2) browser and client components use exclusively `createClient()` from
    `lib/supabase/client.ts` built on `NEXT_PUBLIC_*` publishable credentials; (3) privileged server code remains server-only
    via `next/headers` cookie binding in `lib/supabase/server.ts`; (4) no shared caching can leak data between sessions —
    `unstable_cache`, `"use cache"`, `cacheTag`, and `cacheLife` are completely absent from `src/app/dashboard-admin`,
    `components/admin`, and `lib/admin`; (5) every operational read is per-request, session-scoped under RLS; (6) authenticated
    admin routes are completely dynamic — `next build` confirms all 57 `/dashboard-admin/*` routes are server-rendered on demand
    (`ƒ Dynamic`), zero static prerendering (`○`); (7) public cache usage is strictly limited to genuinely public data
    (`lib/public/{coffees,origins,taxonomy}.ts`, `lib/pricing/{sources,differentials}.ts`) queried via anonymous session-free
    client `createPublicReadClient()`; console mutations invalidate public cache via `revalidateTag(tag, { expire: 0 })`.
    Verified with static and live tests (`tests/admin/catalogue-revalidation.test.tsx`, `tests/admin/price-admin-static.test.ts`,
    `tests/admin/no-hard-delete.test.ts`).

- [ ] T041 Update the roadmap for 010 and confirm OPS-01 dual control, DB-OPEN-06, DB-OPEN-09,
  evidence-byte scope, the suspended-operation policy, and the variance-model question all remain
  accurately classified. Confirm DB-BLOCK-07 remains recorded as resolved by 009.
  - Req: spec Open items | Depends: T038
  - Verify: roadmap accurate; every unresolved item is visible both in the capability map and to operators where relevant
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the console is where operators would otherwise assume capabilities exist; honest representation is a governance requirement.
  - **RUN H (2026-09-17) — RECONCILED, task NOT closed (Depends: T038).** `docs/architecture/IMPLEMENTATION-
    ROADMAP.md`: the Feature 010 row (stale "implementation not started") now states 32/48 IN PROGRESS / NOT
    closed, what is built, and every open item BY CAUSE; the blockers table gains DB-OPEN-19, DB-OPEN-21,
    DB-OPEN-22, SHIP-OPEN-01, SUSPEND-OPEN-01. `docs/architecture/DATABASE-CAPABILITY-MAP.md` gains two
    CLASSIFICATION rows (IDs assigned for tracking, nothing resolved): **DB-OPEN-22** — the COMPLIANCE
    reviewability gap (`organizations`/`file_assets`/`account_status_history` unreadable by
    `is_compliance_operator()`; suspension UPDATE affects 0 rows; KYB bytes unlocatable for that role → T010 open)
    and **SUSPEND-OPEN-01** — the suspended-organization mid-operation policy (business decision). Classification
    confirmed unchanged: OPS-01 OPEN (business/security; stated on payment accounts and role pages); DB-OPEN-06
    OPEN (auditor audit-log card); DB-OPEN-09 OPEN (disputes blocked); DB-OPEN-19 OPEN (no variance model; stated on
    inventory); DB-OPEN-21 OPEN (attribution notice on every configuration page; T027/T029 PARTIAL); SHIP-OPEN-01
    OPEN (shipping page notice); COMMISSION-OPEN-01 OPEN (coverage-gap warning; 0% fallback undecided); DB-BLOCK-01
    resolved for KYB scope only (delivery/payment/dispute/public-media bytes still open); **DB-BLOCK-07 remains
    RESOLVED by Feature 009** (unchanged). Open tasks preserved: T010, T012, T013–T015, T027, T029, T031, T032,
    T033, T047, T048. Every unresolved item is visible in the capability map AND in-product where an operator would
    otherwise assume the capability exists (`data-system-notice`, `capability-gap` cards, blocked placeholders).

---

## Phase 13 — Admin-global account & platform identity (ADDED in RUN A, 2026-09-15)

> Added because the product owner's admin-global requirements (operator self-account, avatar,
> email/password change, platform branding) were not covered by T001–T045. Scope is appended,
> never hidden inside T001–T006. Original planned count 45 → authoritative count 48.

- [x] T046 Operator self-account page (`/dashboard-admin/account`) composed ONLY from existing
  Feature 003 authority: profile name/phone/company via the SAME `ProfileSettingsForm` +
  `updateMyProfile` (`update_my_profile()` RPC, which needs no organization); sign-in email
  DISPLAYED from the server-verified user; password change LINKED to the existing reset flow
  (`/reset-password/` → emailed link); two-factor status from `auth.mfa.listFactors()` linking the
  existing `/mfa/` enrol/verify page; profile image = initials (no approved upload path); sign-out
  via the shared confirm dialog + real `signOut` action. Reachable from the shell's account menu.
  - Req: FR-001, FR-010, FR-015 | Depends: T003
  - Verify: an operator with no organization can read/save their own profile and see their real
    email + MFA status; no password value is accepted on the page; no new table, bucket, RPC or
    auth flow exists; the page never reads `identity.organization`
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: operators without a member organization had NO self-account surface (`/dashboard/settings`
    is membership-gated); composing the existing authority closes that without inventing any.
  - **Done (2026-09-15, RUN A)**: `src/app/dashboard-admin/account/page.tsx` +
    `components/admin/sign-out-button.tsx`; browser proof (WAREHOUSE operator, no organization):
    real email rendered, `data-totp-enrolled="false"` read live, zero `input[type=password]`, zero
    axe violations across EN/AR × light/dark × 390/1366/1920; `tests/admin/noindex.test.ts` covers
    the route's dynamic/non-indexable status.

- [x] T047 Platform identity / branding management (logo). Scope narrowed to logo only — favicon,
  platform display name, and other admin branding assets remain out of scope (this run's own
  explicit "keep scope limited to logo/basic branding, do NOT build a general CMS" instruction).
  - Req: spec Open items (new) | Depends: human decision
  - Verify: no settings table, branding table, bucket or hardcoded workaround exists in the diff;
    the gap is recorded in spec.md Open items and the capability map
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: a fake branding manager would be worse than an honest gap.
  - **Done, Live Verified (2026-09-22, RUN F010-ACCOUNT-MEDIA).** Migration applied to production
    Supabase project; postflight passed 14/14 checks (overall_status = ALL CHECKS PASSED). Live verified
    via `scripts/live-verify-feature010.ts`: Admin upload/replace/remove logo tested live; `platform_settings`
    holds `logo_object_path`; anonymous public read via `getPlatformLogoPath()` renders live; removing
    logo restores fallback; non-admin mutation refused with `forbidden` / `ADMIN_FORBIDDEN`. Fully evidenced
    and production-ready.

- [x] T048 Operator (Admin/Super Admin) sign-in email change.
  - Req: spec Open items (new) | Depends: human decision on the auth flow
  - Verify: once approved, the change uses the authentication provider's own flow, never a profile
    table; until then no email mutation control exists in the console
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: "Do NOT invent new auth flows" — the owner's request is recorded, not improvised.
  - **Done, Live Verified (2026-09-22, RUN F010-ACCOUNT-MEDIA).** The approved auth flow (`auth.updateUser({ email })`)
    is verified live. `changeMyEmail` (`src/app/dashboard/settings/actions.ts`) refuses every non-Admin/Super-Admin session
    (Seller/Buyer and non-admin operators) with `EMAIL_CHANGE_FORBIDDEN` before any Auth call (10/10 in
    `tests/auth/account-security.test.ts` + live session refusal in `scripts/live-verify-feature010.ts`).
    Admin own email change reaches Supabase Auth's double-confirmation email dispatch flow. Password change
    flow (`changeMyPassword`, `auth.updateUser({ password })`) tested and verified live with instant restoration.
    No profile-table write of any kind. Fully evidenced and production-ready.

---

## Phase 14 — Reference-price administration (ADDED 2026-09-21)

> Added because no existing Feature 010 task owned price administration, although spec.md
> (Catalogue scope), plan.md (Catalogue write surface: "price tables") and Feature 011 FR-011 /
> PS6 / plan decision 7 all place it in this console. Found by the Master Audit; it blocks Feature
> 011 T013. Scope is appended here, never hidden inside T021–T024. Count 48 → 49.

- [x] T049 [PS6] Implement minimal reference-price administration in the `(catalogue)` area
  (`/dashboard-admin/prices`, `lib/admin/prices.ts`, `lib/admin/price-validation.ts`): view price
  sources, observations and differentials; create/edit sources (incl. licence status and activity);
  record new observations (append-only — no observation is edited or deleted); create differentials
  and change their lifecycle (active flag, effective-until, notes). Platform ADMIN only
  (`is_platform_admin()` re-verified live per page and per write; RLS `price_*_admin` is the
  backstop). Every SUCCESSFUL mutation calls Feature 011's `revalidateReferencePrices()` exactly
  once; a refused or failed mutation never does. No migration, no DELETE, no service role, no
  currency conversion (DB-OPEN-08): values/units/currencies are stored exactly as entered, and only
  the benchmark commodity types Feature 011 displays can be recorded.
  - Req: FR-002, FR-007, FR-010, FR-017, SEC-002; Feature 011 FR-011, SC-006, PS6 | Depends: T004, T023; unblocks Feature 011 T013
  - Verify: (a) non-admin roles (COMPLIANCE, WAREHOUSE, FINANCE, AUDITOR, member) are refused by
    direct URL and direct action invocation, anonymous is refused as unauthenticated, and no row is
    written; (b) a platform ADMIN creates/edits a source, records an observation and
    creates/changes a differential against the live database; (c) each successful mutation
    revalidates exactly the `reference-prices` tag with `{ expire: 0 }` and a failed one revalidates
    nothing; (d) against a running production server, a public homepage value that is demonstrably
    cached (a direct database write does not appear) changes to the new stored value immediately
    after the console mutation — without waiting for the 300s TTL — and a licence restriction
    removes it; (e) stored decimals equal the entered text (only the column's scale pads it), and
    no FX observation can be recorded.
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the one place the console mutates public market-reference data; licence gating and exact
    values are legal/commercial boundaries, and a missed revalidation leaves the public site wrong.
  - **Done (2026-09-21, functional run — no design polish; no migration, no DB/RLS/grant change)**:
    `lib/admin/prices.ts` (reads + five writes, each `safeParse` → live `is_platform_admin()` →
    session client under RLS → `saved()` = the ONE `revalidateReferencePrices()` call),
    `lib/admin/price-validation.ts` (DB CHECK vocabularies; observation commodities bound to Feature
    011's `REFERENCE_COMMODITIES`; no exchange-rate source/observation; ≤ 6 decimals as TEXT; UTC
    instants; no future observation), `src/app/dashboard-admin/(catalogue)/prices/**` (list, source
    new/detail + observation form, differential new/detail, `actions.ts`), `components/admin/catalogue/
    price-{fields,parts}.{ts,tsx}`, the shared `RecordForm` gained a `prices` resource, area `prices`
    (catalogue group, `is_platform_admin`) in `lib/admin/areas.ts`, EN/AR copy. Evidence per Verify
    clause: (a)(b)(c)(e) `tests/admin/price-admin-live.test.tsx` 12/12 (real sessions/RLS: five roles
    + member refused by every write and by direct URL on all five pages, anonymous → sign-in, RLS
    backstop refuses raw writes, ADMIN create/edit/approve/restrict/deactivate/observe/differential,
    exactly `[{ tag: "reference-prices", options: { expire: 0 } }]` per success, zero on nine distinct
    failure kinds, stored `187.432100` / `0.000001` / `-1.250000` equal the entered text, `FX`
    refused, DELETE still `42501`) and `tests/admin/price-admin-static.test.ts` 22/22 (gate-before-
    client ordering, revalidation only in the final success return, append-only observations,
    immutable fixed facts, no delete/service role/RPC/shared cache/arithmetic); (d)
    `tests/browser/feature010-price-admin.browser.mjs` against `next start` on the final build — a
    direct database write stayed invisible on `/` for 4 requests (cached), the console observation
    was visible on the NEXT request (194 ms after save; TTL 300 s), a RESTRICTED licence hid the
    source on the next request; WAREHOUSE/FINANCE refused by URL, anonymous → `/admin/sign-in/`;
    16 surfaces (EN/AR × light/dark × 1366/390) 0 axe violations; `F010P-` rows removed and the
    disposable ADMIN de-privileged. Regression: `tests/admin` 26 files green in batches;
    `tests/pricing` 162/162.

---

## Phase 15 — Account/media approved scope additions (ADDED 2026-09-22, RUN F010-ACCOUNT-MEDIA)

> Added because neither capability was originally part of Feature 010's own task list — recorded here
> explicitly, per this run's own instruction ("if one of the approved requirements is not originally
> part of Feature 010: record it explicitly as an approved scope addition. Do not pretend it was an
> original task"). Both were explicitly approved product decisions in this run's own prompt. Count
> 49 → 51.

- [x] T050 [PS-new] Self-service avatar upload/replace/remove for every role (Admin, Super Admin,
  Seller, Buyer) — own avatar only. Prefers existing architecture: `profiles.avatar_path` (an
  existing, previously-unwritten column — Feature 003 T027's own comment named this exact gap) and
  the SAME `file_assets`-adjacent bucket+RPC shape `DB-BLOCK-01` established for KYB, extended with a
  NEW, genuinely-required public bucket (`public-assets` — never reusing `kyb-evidence`).
  - Req: approved product decision (Part 4) | Depends: human decision (given by this run's own prompt)
  - Verify: own avatar only; authorized MIME types and a reasonable size limit; replacement/removal
    with old-asset Storage cleanup; no binary/base64 in the database; no cross-user mutation; EN/AR.
  - Recommended: Codex — Medium | Why: bounded, well-understood upload feature.
  - **Done, Live Verified (2026-09-22, RUN F010-ACCOUNT-MEDIA).** Migration applied to production
    Supabase project; postflight passed 14/14 checks (overall_status = ALL CHECKS PASSED). Live verified
    via `scripts/live-verify-feature010.ts`: avatar upload, replace, and remove flows tested live;
    Storage upload to `public-assets/avatars/{auth.uid()}/...` succeeds; `set_my_avatar()` validates prefix
    and updates `profiles.avatar_path`; replace cleans up superseded storage asset; remove cleans up asset
    and restores `avatar_path = null`; cross-user avatar path mutation rejected by both Storage RLS and RPC;
    anonymous upload refused. `AvatarUploadField` mounted in shared `ProfileSettingsForm`. Fully evidenced
    and production-ready.

- [x] T051 [PS-new] Seller-owned listing media (upload/delete/set-primary; drag-reorder deliberately
  deferred — see the migration's own header). BEFORE state: the existing `coffee_media`/`coffees`
  pairing is admin-curated CATALOGUE reference media with NO seller/organization ownership column
  anywhere in its chain (`coffees.created_by` is an admin/staff curator, not a seller) — structurally
  incompatible with "a seller owns their own listing's images", proving a new linking table is
  genuinely required rather than merely completing `coffee_media`'s own upload gap
  (`CATALOGUE_MEDIA_UPLOAD_AVAILABLE = false`, DB-BLOCK-01, untouched by this task).
  - Req: approved product decision (Part 6) | Depends: human decision (given by this run's own prompt)
  - Verify: seller-of-record only, admin also authorized; public/member visibility matches
    `coffee_offers`' own existing member-only boundary exactly (never wider); MIME/size/count limits;
    stable ordering; primary image; delete without orphaning; reuses `file_assets`.
  - Recommended: Codex — High | Why: new ownership model, cross-cutting authorization.
  - **Done, Live Verified (2026-09-22, RUN F010-ACCOUNT-MEDIA).** Migration applied to production
    Supabase project; postflight passed 14/14 checks (overall_status = ALL CHECKS PASSED). Live verified
    via `scripts/live-verify-feature010.ts`: image upload, renders via `getOfferMedia()` with signed URLs;
    set primary image switches primary flag; delete image cleans up row and Storage object and auto-promotes
    survivor to primary; max 8 image limit enforced by RPC; invalid MIME type (application/pdf) rejected;
    non-owner seller and buyer mutation refused by RPC (`forbidden`) and Storage RLS; cross-offer path rejected
    (`offer_media_object_path_invalid`); unauthenticated writes refused; draft/private listing media completely
    hidden from unauthorized members; published listing media readable by authorized members; bucket privacy
    verified live (direct public URL to `listing-media` blocked). `ListingMediaManager` mounted on seller listing
    detail page. Deliberate scope boundary: drag-to-reorder deferred (`reorder_offer_media()` RPC exists); admin
    manages media via RPC-level authorization. Fully evidenced and production-ready.

## Phase 16 — Content / media / account UX hardening (ADDED 2026-09-23)

> Approved scope additions from the 2026-09-23 hardening run prompt — none was an original Feature 010
> task, so they are recorded here explicitly rather than ticked against older tasks. Count 51 → 55. The
> public hero redesign from the same run belongs to Feature 002 and is recorded there.

- [x] T052 [PS-new] Avatar consistency on every surface representing the signed-in user.
  - Done: `RequestProfile.avatarPath` (DAL reads `profiles.avatar_path` per request); the ONE
    `UserAvatar` (shared `publicAssetUrl`, Base UI fallback on load error) now receives it in the
    Operations Console topbar/menu (every operational role), Member Portal topbar/menu (Buyer/Seller),
    public header account menu + mobile drawer, and the admin account page. Avatar upload/remove
    revalidate the root layout; each upload writes a new object path (no stale cache).
  - Verify: `tests/auth/avatar-surfaces.test.tsx` (9/9). No migration.
- [x] T053 [PS-new] Catalogue coffee image management (`/dashboard-admin/coffees/[coffeeId]`): upload
  (multiple, one request per image), preview, set primary, move earlier/later + exact order, replace,
  remove; primary image on public cards/detail and admin list/media pages. Reuses `coffees`/`coffee_media`/
  `file_assets` + the existing `public-assets` bucket under `catalogue/{coffeeId}/` (no new bucket).
  - Migration applied: storage-policy `catalogue` branch (platform admin only), one-primary unique
    index, `attach_coffee_media` / `remove_coffee_media` SECURITY DEFINER RPCs (MIME jpeg/png/webp,
    ≤ 5 MiB, ≤ 12 images, path prefix), `public_coffee_images` security_barrier view. Postflight 12/12 passed.
  - Verify: `tests/admin/catalogue-media-translations.test.ts` (15/15), `tests/admin/run-e-static.test.tsx` (25/25),
    live end-to-end suite `scripts/live-verify-catalogue-media-translations.ts` (27/27 live checks passed,
    upload/storage-scope/metadata/admin-query/upload-second/switch-primary/reorder/remove-promotes-survivor/12-cap/invalid-mime/non-admin-refusal/public-render/draft-isolation).
- [x] T054 [PS-new] Arabic catalogue content: coffee name/description, origin name/description, region,
  coffee type, variety, processing method, packaging type (tags have no translation store). Base columns
  = English (canonical); `locale='ar'` rows in the existing `coffee_translations`/`origin_translations`
  plus five new `*_translations` tables; single writer `set_catalogue_translation` (blank name clears).
  Admin: English-badged record form + separate RTL Arabic panel on coffee/origin/region/taxonomy pages.
  Public: `LocalizedContent` — Arabic when present, otherwise English marked `lang="en" dir="ltr"`.
  - Verify: `tests/public/bilingual-content-hero.test.tsx` (10/10), `tests/admin/catalogue-media-translations.test.ts` (15/15),
    live end-to-end suite `scripts/live-verify-catalogue-media-translations.ts` (27/27 live checks passed,
    EN/AR non-overwrite, 6 taxonomy tables, RTL/LTR, empty name clearing, missing Arabic fallback).
- [x] T055 [PS-new] Two-factor management: shared `TwoFactorPanel` on `/dashboard-admin/account` and
  `/dashboard/settings` — Enabled / Disabled / Enrollment pending / Unknown status, verified-factor list,
  removal gated by ownership + a fresh TOTP code (`removeMyMfaFactor` → `challengeAndVerify` →
  `unenroll`); `/mfa/` now discards abandoned unverified factors before enrolling (fixes accumulation),
  shows a manual-key label and links back to the account. Login AAL2 enforcement unchanged (already
  complete). Limitation documented in-product: Supabase TOTP has no recovery codes — none are invented.
  - Verify: `tests/auth/mfa-management.test.ts` (13/13). No migration.

## Phase 17 — Pre-Stripe catalogue / localization / media hardening (ADDED 2026-09-24)

> Approved post-closure additions from the 2026-09-24 "pre-Stripe UX / localization / catalogue / public experience
> hardening" prompt. None re-opens or re-ticks an older task. Count 55 → 58. The public-page redesigns from the same
> run belong to Feature 002 and are recorded there (T059–T063).

- [ ] T056 [PS-new] Arabic TAG names ("Characteristics"). Tags were the one public, admin-managed catalogue label
  without an Arabic store. Migration `20260924120000_tag_translations` (**APPLIED** — confirmed Feature 013 T002, 2026-09-24): `tag_translations`
  (select-only, public read), `set_catalogue_translation` re-declared verbatim + a `tag` branch; rollback restores the
  previous writer; postflight 13 checks. App: `TRANSLATION_KINDS` + `tag`, taxonomy tag pages get the Arabic tab, the
  public DTO reads tag Arabic in its OWN tolerant query (a missing table degrades only tags).
  - Verify so far: `tests/admin/pre-stripe-hardening.test.tsx` (migration pins, validation, DTO). Operator postflight
    `supabase/maintenance/20260924_tag_translations_postflight.sql` (2026-09-24): **13/13 true** (evidence:
    `specs/013-bank-transfer-commerce-core/PREFLIGHT-REPORT.md` §T002). **Remaining**: live EN/AR tag proof.
- [x] T057 [PS-new] Admin bilingual editing UX + catalogue admin fixes: `BilingualEditor` (EN canonical / AR tabs, both
  panels mounted, per-language unsaved marker cleared by the form's own save event, beforeunload guard, WAI-ARIA
  tablist) on coffee/origin/region/taxonomy detail; optional RTL Arabic fields on every catalogue CREATE form, written
  through the same writer only after the English record exists; FIX: catalogue forms labelled `name` "Location name"
  (label-dictionary precedence); FIX: media-card sort input kept a stale value after move earlier/later (re-keyed);
  media cards re-laid out (max two per row, readable sort field).
  - Verify: `tests/admin/pre-stripe-hardening.test.tsx` (17/17); admin coffee/origin/new visually checked EN/AR,
    light/dark, 1440/1280/375 (2026-09-24).
- [x] T058 [PS-new] Listing media display rule — "primary outside, gallery inside" for SELLER listings
  (`coffee_offer_media`, never catalogue media): marketplace cards and the seller's own listings table show ONE signed
  primary image (primary, else first by sort order; placeholder otherwise) via batched `getPrimaryOfferImages`; the
  buyer listing detail shows every member-visible image in the shared `MediaGallery`, opening on the primary.
  - Verify: `tests/public/media-display-rule.test.tsx` (17/17). Live: no listing currently has media, so the
    image-bearing listing state is proven by tests only; the placeholder state was checked visually.

---

## Phase 18 — Final non-payment closure: fixtures & test taxonomy (ADDED 2026-09-23)

Payment/Stripe/Feature 008 untouched. `20260924120000_tag_translations.sql` reviewed (GO for separate security
review) but NOT applied — T056 stays open until a reviewed operator applies it and runs the postflight.
T038 and T041 stay open (Phase 12 sign-off still includes the Feature 008-blocked areas).

- [x] T059 [PS-new] Fixture cleanup + stale test taxonomy.
  - Disposable coffee `run-e-created-coffee-proof-live-media` (DRAFT, no media) removed via the existing exact-slug
    fixture cleanup (`--cleanup-run-e-created-rows`, extended with `RUN_E_CREATED_ROWS.liveMediaCoffeeSlug`) after a
    project-identity check (`hillscoffees-trading`); the live-verify script now uses the same constant.
  - Disposable admin `catalogue-admin+t021-test@example.com`: already blocked, no active capability, no memberships —
    no further action; Auth user deliberately NOT deleted (manual decision).
  - `public-test-*` coffee/origin fixtures: NOT archived — the canonical live suites (status-lifecycle, canary-leakage,
    json-ld, seo) require them in the same project that serves production. OPEN PRODUCT DECISION: separate test
    project or a non-public fixture mechanism.
  - Branding page is a singleton settings page, not a list page: `state-coverage.test.tsx` taxonomy corrected with
    focused branding assertions (no fake empty/error states added to production).
  - `run-f-static.test.tsx`: the applied T047 branding migration and its two admin-gated logo RPCs admitted by exact
    name (were failing since e22173e).
  - NOT changed (payment boundary): `tests/admin/finance-delegation.test.tsx` fails for the same stale reason
    (`set_platform_logo` not in its RPC allowlist) — left for an explicit decision.

## Dependencies & parallelisation

- Phase 1 blocks everything.
- Phases 3–9 are largely parallel by area once Phase 1 lands (different route groups, different
  domain layers) — the natural multi-agent split for this feature.
- Phase 9's commission set (T042 → T043/T044/T045) is sequential within itself: T043–T045 all extend
  the surface T042 creates, so none is `[P]`.
- Phase 10's tests: T031–T035 parallel; T030 must follow the areas it iterates.
- Phase 12 depends on everything.

**Structurally parallel-safe tasks once their prerequisites exist**: T012, T015, T022, T024, T028,
T029, T031, T032, T033, T034 (10 of 45). **Current availability supersedes this marker**: T012 and
T015 are blocked by 012 and 008 respectively, and downstream test tasks remain blocked until their
surfaces exist.

**Commission ownership note**: this feature owns the **Admin management UI** for the existing
`commission_policies`/`commission_tiers` tables inside the existing `/dashboard-admin` surface
(Phase 9, SUPER_ADMIN only). It does **not** own commission calculation — that is implemented in the
database (`docs/database/commission-capability.md`) — and it does **not** own the financial workflow
or payout presentation, which is Feature 008. The `COMMISSION-OPEN-01` fallback decision belongs to
Business/Finance via Feature 008 and must not be pre-empted by a UI behaviour here.
