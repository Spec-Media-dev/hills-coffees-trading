# Contract: Unified Admin and Feature 014 Help

## Coffee Workflow

Extend existing `/dashboard-admin/coffees/new` and `/dashboard-admin/coffees/[coffeeId]` pages inside their existing catalogue route group. Do not create a Coffee/offer/stock aggregate table. The stepper is navigation over independently durable records, not a transaction spanning uploads and every screen.

| Step | Controlled operation / persisted target | Failure/resume contract |
| --- | --- | --- |
| Identity/English | `create_catalogue_coffee_intent` on first confirmed save; later `save_catalogue_step` on Coffee | Same actor/intent/payload returns same DRAFT ID; later reload never creates another Coffee |
| Arabic | Existing translation model/helper through idempotent step save | Keep English save; reopen missing Arabic and field-level errors |
| Taxonomy/origin | Existing normalized references; active-origin validation | Preserve draft; reject stale/invalid reference, no fabricated attributes |
| Media | Existing public-assets and `attach_coffee_media`/removal with stable media intent | Recover prior attach by operation result before compensating; remove only proven unattached upload owned by intent |
| Backing inventory | Read current eligible Hills position/lot/warehouse/provenance | Explicit selection, no quantity creation; unavailable handoff to Warehouse while Coffee remains saved |
| Offer / USD per kg / quantity | `create_backed_offer_intent`, or CAS save of explicitly selected offer | Re-read real owner/lot/location/stock and existing resale/hold guards; same intent cannot create duplicates |
| Featured | Idempotent editor operation on nullable Coffee Featured timestamp | Already enabled save preserves moment; no publication implication |
| Readiness/preview | Guarded fresh normalized projection | Explain content/translation/media/inventory/review/publication/purchasability separately |
| Review/publication | Existing Compliance progression + controlled publication commands | Visible permission handoff; no partial coordinated Coffee+offer result |

Every new write binds request UUID, actor, operation, target/creation intent, canonical payload and expected revision. Replay reauthorizes and matches exact payload first. Edits lock/check revision before writing; stale changes return current safe revision for reload, not silent overwrite. Creation response carries resume URL/ID and explicit selected-offer identity. Resume loads existing normalized state, not client step completion flags. Multi-offer editing requires explicit selection before commercial mutation.

### Roles and Guards

- Catalogue reads/writes use existing Platform Admin/MFA guards and database policies. A unified page does not give Finance, Warehouse, Compliance or Auditor universal catalogue writes.
- Stock remains Warehouse/domain authority; this workflow selects existing eligible position only. Verify Hills internal owner, matching Coffee/lot, warehouse/location, quantity, seller provenance, holds and variances through existing helpers/triggers. Private backing IDs remain Admin/operational, not buyer DTO fields.
- Compliance approval/rejection retains existing `requireCompliance`/database authority and offer transition graph. If a review operation changes status plus `listing_reviews`, make both atomic and retry-safe; keep existing status-history/audit triggers. Do not convert an Admin intent receipt into approval authority.
- Catalogue-only publication checks new-content readiness but does not require an executable offer. Coordinated publication requires both existing catalogue permission and the installed offer-publication authority; APPROVED is necessary, not sufficient. If the actor lacks either permission, show handoff and deny the direct RPC.

### Publication Transaction

`publish_coffee_with_approved_offer(coffee,offer,expected revisions,request)` freshly authorizes, locks Coffee then selected offer, verifies the offer belongs to it, preserves current backing/offer guards, and checks English content, Arabic name/description, active origin and usable primary image. Acquire offer before backing position; never prelock a position in a selection helper and then an offer. Publish both or neither, with existing history/audit/correlation. Catalogue-only publication performs equivalent public-readiness checks on Coffee alone.

No automatic approval and no DRAFT→PUBLISHED offer shortcut. Unpublication/Featured/translation/media mutations expire affected public tags after commit. Use actual `/dashboard/coffee` paths, not obsolete marketplace revalidation paths. Historical English-only PUBLISHED Coffees remain visible with defined fallback; incomplete drafts may save. Explicit new publication checks readiness; adding the new workflow must not automatically withdraw existing published content or rewrite its history.

### Media Compensation

Storage upload is not inside a PostgreSQL transaction. Stable media intent binds actor/Coffee/object path/type/size and attach operation. A lost attach response first checks committed association; do not delete an attached object as compensation. On known attach failure delete only that intent's verified orphan; cleanup failure reports retryable residue. Publication readiness rejects a broken primary image. No broad prefix cleanup and no private listing image copied into public-assets.

## Bank Configuration

Reuse `/dashboard-admin/payment-accounts`, new/detail and existing DAL. Add `is_default_for_currency` to its safe Admin projection and explicit default USD control calling existing `set_default_payment_account`. Account create/edit/retire remains Super Admin; default choice remains Platform Admin + MFA. Finance is a reader/reviewer, not configuration manager. Mask list values; reveal full permitted fields only inside authorized detail. Validate active USD and existing account-number/IBAN requirements and atomically enforce existing default uniqueness.

Readiness reports active valid default bank plus established shipping/tax/settings without exposing identifiers to unauthorized buyers. Changing account data affects only future issuance. Old proforma bank instructions/reference are immutable; never substitute the current account if its snapshot is absent or RLS-denied. Default-change retries/races must not create multiple defaults. Use existing audit/correlation and no duplicate bank model or speculative approval engine.

## Help Routes and Interfaces

| Route | Responsibility |
| --- | --- |
| `/dashboard/help` | Current-org recent tickets, status/category and last activity; bounded pagination |
| `/dashboard/help/new` | Category, subject/body, optional independently authorized order; stable creation intent |
| `/dashboard/help/[ticketRef]` | Reference/status/conversation/reply/history and resolved/closed next action |
| `/dashboard-admin/support` | Platform Admin/MFA inbox, reference/subject search and bounded status/category/priority filters |
| `/dashboard-admin/support/[ticketRef]` | Authorized context, reply, exact graph status controls and append-only history |
| Existing member/Admin messages routes | Authorize old UUID/reference under existing scope, then redirect to corresponding HLP/HC reference; deny before revealing redirect destination |

Accept only bounded normalized reference/search/filter inputs. Resolve both existing HLP and new HC codes via existing unique ticket code, under session access. Raw UUID compatibility is explicit and guarded, not a second unscoped lookup. Not found and unauthorized do not expose whether another tenant's reference exists.

| Proposed operation | Exact binding |
| --- | --- |
| `create_help_ticket` | Actor/current org, request, category, trimmed subject/body, priority, optional authorized order |
| `reply_help_ticket` | Actor/current org (staff separately derived), request, ticket/reference, expected relevant state, exact normalized body |
| `transition_help_ticket` | Platform Admin/MFA actor, request, ticket, expected status/revision, desired status, explicit reopen where CLOSED |
| `recover_help_operation` | Current authority + original actor/operation/request/payload; safe prior IDs/state only |

Reuse protected operation binding from M2. Same request/payload returns prior result without another message/history/notification; changed body/category/order/status conflicts. Lock one ticket before status/reply changes, re-read state and derive author/staff/time in PostgreSQL. Atomic create includes initial message/history and events; collision exhaustion rolls all back. Retain existing content length and priority validation from Feature 014; reject null/invalid enum, empty content and unsafe rendering. Do not introduce attachment/note/assignment fields.

### Database Authorization and Existing Entry Points

Member read/DAL/recovery restricts `organization_id` to the selected current organization and verifies fresh membership/active authorization. Membership-backed SELECT RLS remains a minimum independent boundary; membership in org A does not let the application display A while scoped to B. If an installed trusted active-org claim exists, align RLS with it; do not trust a writable client GUC. Controlled write RPCs validate explicit current-org against authenticated membership. Platform Admin reads/writes require existing authority/MFA, not any operational role.

Direct table message/status mutations and old RPCs must be revoked or receive equivalent authorization, graph, audit and idempotency guards; a new Help DAL alone is insufficient. Preserve old URLs/records, not an unguarded alternate write path. Derive `requester_user_id`, `author_user_id`, `is_staff`, timestamps, organization and code server-side; refuse/ignore forged fields and test direct API requests.

Optional order linkage independently proves `can_view_order` plus acting-org participation: buyer organization or actual seller represented by order items/offers. The present header-seller-only check cannot support historical multi-seller orders. Correct that check in controlled operations/validator, with negative cross-org tests; an order link grants no new access to buyer bank/proof/invoice details. Render safe permitted reference/projection only.

### History, Notification and Audit

Persist exact graph and reply-driven transitions in [data-model.md](../data-model.md), including CLOSED read-only members and explicit Admin reopen. One status transition produces one history row; same-state replay produces none. First creation records its initial status. Message/status identity and request bind deduplication.

Reuse direct transactional in-app `notifications`, not the commerce outbox whose general fanout is not implemented. Add safe event types for ticket receipt, staff reply and status change, translated at rendering from event type/reference/entity. Creator sees returned receipt confirmation; exclude actor from notification recipients, so creation may notify other authorized org members and produces no self-notification when there are none. Do not invent an external delivery obligation. Resolve recipients from fresh approved scope; no caller-supplied recipient IDs. Never embed subject/body, proof/storage paths or bank/account values. Notification link reauthorizes the ticket.

Preserve existing order/shipment/Finance notification triggers; support additions cannot replace their bindings. Generic audit hooks must be reviewed so message bodies are not duplicated into audit payload; use actor/entity/request/transition metadata. Retain original user-authored message language and append-only history. Existing HLP reference and requester/org/order identity remain immutable.

## Required Verification

Admin: repeat/uncertain first save, interrupted step reload, changed-intent conflict, concurrent edit, explicit offer selection, forged backing fields, no stock handoff, role/MFA denial, media lost response/orphan cleanup, catalogue-only publish, coordinated publish rollback, review-history exact-once, Featured lifecycle and old published fallback.

Bank: CRUD/default role split, invalid/inactive/currency denial, default concurrency, immutable old snapshot, future new snapshot, masked unauthorized projections.

Help: valid HC regex/randomness/collision retry/exhaustion, preserved HLP redirects, initial atomic rollback, every graph edge and illegal/null edge, duplicate/reused-key create/reply/status, concurrent status/reply, member resolved/waiting reopen, CLOSED denial/Admin reopen, multi-seller authorized order, another-tenant references/raw IDs, blocked/MFA/role/current-org loss, forged staff/actor, safe notification recipient/dedup/no-self/body exclusion, append-only message/history and audit metadata.
