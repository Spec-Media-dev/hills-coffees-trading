# Contract: RFQ / Commercial Inquiry

Governs FR-014, FR-015, SEC-003, SEC-004, SC-008; PS3. Constrained by **DB-BLOCK-02**
(no approved destination for an anonymous RFQ) and **CRM-DEST-01** (no approved CRM destination).

---

## 1. The boundary, stated plainly

Feature 002 implements **everything up to and including server-side validation**, and then stops.

| Implementable now | Explicitly NOT implementable |
|---|---|
| The RFQ form UI (accessible, keyboard-operable, labelled, error-associated) | Persistence to any table |
| A shared Zod schema used by client and server | A "shadow"/substitute inquiry table |
| Server-side validation at the Server Action boundary | `localStorage`/`sessionStorage`/cookie persistence of submissions |
| Explicit consent capture in the payload shape | A service-role write that bypasses RLS |
| Attribution fields carried in the payload shape | Sending to an unapproved CRM/email/webhook destination |
| Endpoint-local abuse safeguards (§4) | A success confirmation when nothing was accepted |
| A truthful **unavailable** result | Claiming "Submitted successfully" |

**The honesty rule.** A valid submission, while no approved destination exists, MUST NOT tell the
visitor their inquiry was received. It returns the documented *unavailable* outcome (§3) with an
alternative contact route. Telling a prospective buyer their inquiry was sent when it was discarded
is a commercial and reputational failure, not merely a missing feature.

---

## 2. Field shape

Derived from SRS §6.1 (RFQ/quote stage: quantity, currency, unit, Incoterm, delivery/storage choice,
validity), C.1 step 4, and the design-guidance RFQ row ("buyer/company type, country, estimated
volume, coffee/origin preference, timing, delivery location, contact details"). **Only fields
traceable to an authoritative source appear here.**

| Field | Required | Constraint | Source |
|---|---|---|---|
| `companyName` | yes | 1–200 chars | design guidance (RFQ row) |
| `buyerType` | yes | enum: roaster / importer / distributor / other | design guidance ("buyer/company type") |
| `countryCode` | yes | ISO-3166-1 alpha-2 | design guidance ("country") |
| `estimatedVolumeKg` | yes | positive number, sane upper bound | design guidance ("estimated volume") |
| `coffeePreference` | no | ≤ 200 chars; free text or a public coffee/origin slug | design guidance |
| `timing` | no | ≤ 120 chars | design guidance ("timing") |
| `deliveryLocation` | no | ≤ 200 chars | design guidance ("delivery location") |
| `incoterm` | no | ≤ 20 chars | SRS §6.1 |
| `contactName` | yes | 1–120 chars | design guidance ("contact details") |
| `contactEmail` | yes | valid email format, ≤ 254 chars (RFC max) | design guidance |
| `contactPhone` | no | ≤ 40 chars | design guidance |
| `message` | no | ≤ 2000 chars | conventional free-text field |
| `consent` | **yes** | must be explicitly `true`; unchecked = validation failure | design guidance rule #5 (consent), SRS privacy posture |

**Length limits exist for a reason**: they bound the request body an anonymous endpoint will parse,
which is part of the abuse posture (§4) — not merely UI polish. The Server Action rejects
over-length input before any other processing.

### Attribution

Captured in the payload shape so an approved destination can consume it the day one exists:
referrer, landing path, and UTM parameters if present, plus submission timestamp. Attribution is
**best-effort, never required**, and is never used to identify or track an individual beyond the
submission itself.

### Explicitly NOT specified

- **Disposable-email detection is NOT part of this contract.** No authoritative source approves a
  disposable-domain policy; inventing one would silently reject legitimate buyers. Format validation
  only. (The 002 spec's earlier edge case asserting disposable-email rejection was unsupported and
  has been corrected.)
- No lead scoring, enrichment, or third-party validation service.
- No CAPTCHA vendor — introducing one is a third-party/privacy decision, not a developer choice.

---

## 3. Result shape

The action returns 001's `ServerActionResult<T>` shape (`lib/types/server-action.ts`). Three
outcomes:

| Outcome | Result | What the visitor sees |
|---|---|---|
| **Invalid input** | `{ ok: false, error, fieldErrors }` | Inline field errors; entered data preserved; nothing sent |
| **Rejected by abuse safeguard** | `{ ok: false, error }` (generic) | A neutral "please try again shortly" message that does not disclose thresholds or counters |
| **Valid, but no approved destination (current state)** | `{ ok: false, error }` with the documented *unavailable* copy | An honest statement that online submission is not yet available, **plus a working alternative** (published Hills commercial contact route). Entered data preserved so nothing is lost |

There is deliberately **no `ok: true` path in Feature 002.** A success outcome becomes implementable
only when DB-BLOCK-02 *and* CRM-DEST-01 are resolved, at which point the owning feature adds it —
along with the persistence test that is forbidden today.

**Error mapping**: no raw database or framework error text ever reaches the client (SEC-003, and
001's Server Action contract step 5).

**Untrusted input** (SEC-004): submitted content is untrusted for its whole life. It is never
rendered unescaped, never interpolated into HTML/JSON-LD, and — when an operational view is built
later by Feature 010 — must be escaped there too. This obligation travels with the data.

---

## 4. Abuse safeguards — what is honestly achievable

**No Redis, no Upstash, no external cache or rate-limit service** (Constitution Principle XI).

**Do not describe process-local state as distributed rate limiting.** A Next.js server may run as
several instances; an in-memory counter is per-instance and resets on deploy. It raises the cost of
casual abuse and nothing more.

Implementable now (all endpoint-local, all honest):

1. **Server-side input-size bounds** — reject over-length fields before processing (§2).
2. **Shape rejection** — anything failing the schema is discarded early, before any I/O.
3. **A per-instance, in-memory throttle** on the RFQ action, documented in code as
   *best-effort, single-instance, non-durable*.
4. **A timing-neutral, non-disclosing rejection** — never reveal thresholds, counters or remaining
   attempts.
5. **No amplification** — the action performs no outbound request, so it cannot be used to attack a
   third party.

Recorded as **ABUSE-01 — PRE-PRODUCTION BLOCKER**: durable, multi-instance abuse protection is not
achievable with the approved infrastructure. Before production the platform needs either an approved
edge/WAF capability or an approved durable counter. Feature 002 must not claim to have solved it.

---

## 5. Server Action discipline

Anonymous RFQ is **not** an authenticated member Server Action, so 001's identity step does not
apply — but every other step of the Server Action contract does:

1. **Validate** (Zod, server-side, authoritative — the client schema is UX only)
2. **~~Authenticate~~** — n/a; the endpoint is deliberately anonymous. It must therefore **never**
   call `getRequestIdentity()` to vary behaviour, and never read or write member data
3. **Abuse safeguard** (§4) — the anonymous endpoint's substitute for an authorization gate
4. **Controlled data access** — *currently none*; the boundary stops here (§1)
5. **Safe error mapping** (§3)
6. **Revalidation** — none; nothing is cached about a submission, and the RFQ action MUST NOT
   revalidate any public cache tag

---

## 6. Verification

| Check | Expectation |
|---|---|
| Invalid input | Field errors; no persistence attempt; no outbound call |
| Missing consent | Rejected as a validation failure |
| Over-length field | Rejected before processing |
| Valid input, current state | The *unavailable* outcome — never "submitted successfully" |
| Abuse safeguard | Repeated submissions are throttled; the message discloses nothing |
| Persistence | **No test asserts persistence while DB-BLOCK-02 stands** |
| Static analysis | No `SERVICE_ROLE`, no shadow-table write, no browser-storage persistence, no unapproved outbound destination in the RFQ path |
| Escaping | A submitted `<script>` payload is never rendered unescaped anywhere it is echoed back |
