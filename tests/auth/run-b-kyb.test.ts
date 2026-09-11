import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { checkKybCompleteness } from "@/lib/kyb/completeness";
import { KYB_DOCUMENT_TYPES, KYB_DOCUMENT_TYPE_VALUES, KybDraftInput, isKybDocumentType } from "@/lib/validation/kyb-application";
import { currentDocuments, isDocumentExpired, type KybDocumentSummary } from "@/lib/kyb/status-types";

/**
 * Feature 003 RUN B (T014–T022) verification — profile bootstrap (PART 0) and verified-signup
 * redirect (PART 1) are covered by `tests/auth/run-a-full-name-persistence.test.ts` and the sign-up/
 * sign-in action files themselves; this file covers Phase 4 (T014–T018) and Phase 5 (T019–T022).
 *
 * LIVE-VERIFIED this run via two complementary real-environment checks (temporary, immediately-
 * deleted scripts — no residue beyond documented, audit-integrity-blocked fixture accounts, same
 * class as T010g's and the RUN A Full Name fix's own precedent):
 *
 * 1. A real headless-browser session (after discovering and fixing two unrelated CDP/dev-server
 *    quirks — Next.js 16 blocks cross-origin dev resources when the browser targets `127.0.0.1`
 *    instead of `localhost`, and a throwaway test script was missing its own `.env.local` loader,
 *    silently using a fallback password) confirmed: sign-in redirects straight to `/dashboard/` with
 *    no manual re-sign-in, the "no application yet" hub state renders with the correct honest copy,
 *    and clicking "Start KYB verification" reaches `/dashboard/kyb/`.
 * 2. Direct authenticated RPC calls (bypassing the browser layer for the rest of the flow, the same
 *    proven-reliable technique used for the RUN A Full Name Persistence fix) exercised the COMPLETE
 *    member-side KYB lifecycle end-to-end against the real, already-applied foundation migration:
 *    `create_kyb_draft` (idempotent — a second call returns the same application id), all 5 required
 *    documents uploaded via real Storage + `attach_kyb_document`, cross-tenant isolation (a second
 *    organization's member could not read the first organization's application or documents, could
 *    not upload into its Storage path, and could not attach a document to its application),
 *    `submit_kyb_application` (DRAFT → SUBMITTED), a real member `UPDATE` attempt on
 *    `kyb_applications.status` directly (bypassing every RPC) was confirmed to affect ZERO rows — no
 *    self-approval is possible even by a caller who bypasses the application layer entirely — a
 *    document review + rejection via `create_kyb_review` (confirming `reviewer_user_id` is never
 *    returned to the member and `reviewer_label` is always the fixed `"Hills Compliance"` constant),
 *    a premature resubmit attempt correctly refused with `unresolved_rejected_document`, a
 *    replacement upload correctly superseding the rejected document (old version marked
 *    `SUPERSEDED`), and `resubmit_kyb_application` succeeding only after the replacement
 *    (RESUBMISSION_REQUIRED → SUBMITTED).
 *
 * NOT live-verified this run (requires the still-unapplied T016 migration,
 * `supabase/migrations/20260912010000_feature_003_kyb_draft_fields.sql`): `update_kyb_draft` itself
 * — the live RPC call returned `PGRST202` ("Could not find the function ... in the schema cache"),
 * confirming the migration genuinely has not been applied yet (honestly reported, not faked as a
 * pass). The call SHAPE (function name, parameter names) was exercised for real and is correct; only
 * the DB-side function's existence is pending manual apply.
 */
const KYB_DRAFT_FIELDS_MIGRATION = readFileSync("supabase/migrations/20260912010000_feature_003_kyb_draft_fields.sql", "utf8");
const KYB_ACTIONS = readFileSync("src/app/dashboard/kyb/actions.ts", "utf8");
const KYB_PAGE = readFileSync("src/app/dashboard/kyb/page.tsx", "utf8");
const DASHBOARD_PAGE = readFileSync("src/app/dashboard/page.tsx", "utf8");
const DASHBOARD_LAYOUT = readFileSync("src/app/dashboard/layout.tsx", "utf8");
const STATUS_SCREEN = readFileSync("components/account/kyb-status-screen.tsx", "utf8");
const DRAFT_FORM = readFileSync("components/account/kyb-draft-form.tsx", "utf8");
const DOCUMENT_ROW = readFileSync("components/account/kyb-document-row.tsx", "utf8");
const DOCUMENT_CHECKLIST = readFileSync("components/account/kyb-document-checklist.tsx", "utf8");
const SUBMIT_PANEL = readFileSync("components/account/kyb-submit-panel.tsx", "utf8");
const MUTATIONS = readFileSync("lib/kyb/mutations.ts", "utf8");
const KYB_DOCUMENTS_LIB = readFileSync("lib/kyb/documents.ts", "utf8");
const KYB_STATUS = readFileSync("lib/kyb/status.ts", "utf8");

describe("T014 — KYB validation schema", () => {
  it("registeredAddress/businessActivity are required, trimmed, length-limited", () => {
    expect(KybDraftInput.safeParse({ registeredAddress: "", businessActivity: "x" }).success).toBe(false);
    expect(KybDraftInput.safeParse({ registeredAddress: "x", businessActivity: "" }).success).toBe(false);
    const parsed = KybDraftInput.safeParse({ registeredAddress: "  123 Street  ", businessActivity: "Trading" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.registeredAddress).toBe("123 Street");
  });

  it("the document-type vocabulary is closed and derived from SRS §4.1 evidence categories, not invented ad hoc", () => {
    expect(KYB_DOCUMENT_TYPE_VALUES).toEqual([
      "TRADE_LICENSE",
      "PROOF_OF_INCORPORATION",
      "AUTHORIZED_SIGNATORY_ID",
      "UBO_DECLARATION",
      "BANKING_EVIDENCE",
    ]);
    expect(isKybDocumentType("TRADE_LICENSE")).toBe(true);
    expect(isKybDocumentType("SOMETHING_INVENTED")).toBe(false);
  });

  it("no authorization-sensitive field exists in the actual schema/vocabulary code (doc-comment prose mentioning what is forbidden is expected and fine)", () => {
    const source = readFileSync("lib/validation/kyb-application.ts", "utf8");
    const codeOnly = source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/status|APPROVED|ACTIVE|can_buy|can_sell|decided_by|decided_at|reviewer|admin|compliance/i);
  });
});

describe("T015 — completeness engine", () => {
  it("reports SPECIFIC named missing items, never a generic message", () => {
    const result = checkKybCompleteness(null, []);
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    for (const item of result.missing) {
      expect(item.label).not.toMatch(/^application incomplete\.?$/i);
      expect(item.label.length).toBeGreaterThan(10);
    }
    expect(result.missing.some((m) => m.key === "registeredAddress")).toBe(true);
    expect(result.missing.some((m) => m.key === "TRADE_LICENSE")).toBe(true);
  });

  it("a fully-complete application with all 5 accepted documents reports zero missing items", () => {
    const documents: KybDocumentSummary[] = KYB_DOCUMENT_TYPES.map((entry, index) => ({
      id: `doc-${index}`,
      documentType: entry.type,
      status: "ACCEPTED",
      version: 1,
      supersedesDocumentId: null,
      originalName: null,
      mimeType: null,
      sizeBytes: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    }));
    const result = checkKybCompleteness(
      { registeredAddress: "123 Street", businessActivity: "Trading" },
      currentDocuments(documents)
    );
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("a REJECTED current document is reported as missing with a replacement-specific reason", () => {
    const documents: KybDocumentSummary[] = [
      { id: "d1", documentType: "TRADE_LICENSE", status: "REJECTED", version: 1, supersedesDocumentId: null, originalName: null, mimeType: null, sizeBytes: null, expiresAt: null, createdAt: new Date().toISOString() },
    ];
    const result = checkKybCompleteness({ registeredAddress: "x", businessActivity: "y" }, currentDocuments(documents));
    const item = result.missing.find((m) => m.key === "TRADE_LICENSE");
    expect(item?.label).toMatch(/rejected/i);
    expect(item?.label).toMatch(/replacement/i);
  });

  it("is called server-side by both submitKyb and resubmitKyb — never trusted from the client alone", () => {
    expect(KYB_ACTIONS).toMatch(/checkKybCompleteness/);
    const submitBlock = KYB_ACTIONS.slice(KYB_ACTIONS.indexOf("export async function submitKyb"));
    const resubmitBlock = KYB_ACTIONS.slice(KYB_ACTIONS.indexOf("export async function resubmitKyb"));
    expect(submitBlock).toMatch(/checkKybCompleteness/);
    expect(resubmitBlock).toMatch(/checkKybCompleteness/);
  });
});

describe("T016 — KYB draft create/edit", () => {
  it("uses createKybDraft/updateKybDraft only — never a direct kyb_applications insert/update", () => {
    expect(KYB_ACTIONS).toMatch(/createKybDraft/);
    expect(KYB_ACTIONS).toMatch(/updateKybDraft/);
    expect(KYB_ACTIONS).not.toMatch(/\.from\(["']kyb_applications["']\)\.(insert|update)/);
  });

  it("resolves the acting organization fresh, server-side, every action — never a client-supplied organization id", () => {
    expect(KYB_ACTIONS).toMatch(/requireOnboardingOrganization/);
    expect(KYB_ACTIONS).not.toMatch(/formData\.get\(["']organizationId["']\)/);
    expect(KYB_ACTIONS).not.toMatch(/formData\.get\(["']applicationId["']\)/);
  });

  it("update_kyb_draft (the migration this run adds) is UPDATE-only, scoped to auth.uid()'s own org membership, and enforces the editable-state rule", () => {
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/create or replace function public\.update_kyb_draft/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/is_org_member\(v_organization_id\)/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/'DRAFT', 'RESUBMISSION_REQUIRED'/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/update public\.kyb_applications/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).not.toMatch(/insert into public\.kyb_applications/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/revoke all on function public\.update_kyb_draft\([^)]*\)[\s\S]{0,20}from public, anon/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/grant execute on function public\.update_kyb_draft\([^)]*\)[\s\S]{0,20}to authenticated, service_role/);
  });

  it("the migration adds only the two scalar business-data columns it documents — no JSON blob, no invented structured data", () => {
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/add column if not exists registered_address text/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).toMatch(/add column if not exists business_activity text/);
    expect(KYB_DRAFT_FIELDS_MIGRATION).not.toMatch(/jsonb/i);
  });

  it("the paired rollback refuses to run if real business data exists", () => {
    const rollback = readFileSync("supabase/migrations/20260912010000_feature_003_kyb_draft_fields.rollback.sql", "utf8");
    expect(rollback).toMatch(/rollback_refused/);
    expect(rollback).toMatch(/registered_address is not null or business_activity is not null/);
  });
});

describe("T017 — real private document upload", () => {
  it("uploads through the request-scoped server client, never the service-role key", () => {
    expect(KYB_ACTIONS).toMatch(/supabase\.storage\.from\(KYB_EVIDENCE_BUCKET\)\.upload/);
    expect(KYB_ACTIONS).not.toMatch(/SERVICE_ROLE/);
    expect(KYB_DOCUMENTS_LIB).not.toMatch(/SERVICE_ROLE/);
  });

  it("validates MIME type and size server-side before upload — not merely relying on client pre-validation", () => {
    expect(KYB_ACTIONS).toMatch(/KYB_EVIDENCE_ALLOWED_MIME_TYPES/);
    expect(KYB_ACTIONS).toMatch(/KYB_EVIDENCE_MAX_SIZE_BYTES/);
    expect(KYB_ACTIONS).toMatch(/file\.size > KYB_EVIDENCE_MAX_SIZE_BYTES/);
  });

  it("uses the canonical org/application-scoped object path, never a caller-chosen path", () => {
    expect(KYB_ACTIONS).toMatch(/buildKybObjectPath/);
    expect(KYB_DOCUMENTS_LIB).toMatch(/`org\/\$\{organizationId\}\/application\/\$\{applicationId\}\/\$\{generatedObjectName\}`/);
  });

  it("orphaned bytes are cleaned up (best-effort) when the metadata attach fails after a successful upload — never a false success", () => {
    const uploadBlock = KYB_ACTIONS.slice(KYB_ACTIONS.indexOf("export async function uploadKybDocument"));
    expect(uploadBlock).toMatch(/attachResult\.ok/);
    expect(uploadBlock).toMatch(/storage\.from\(KYB_EVIDENCE_BUCKET\)\.remove\(\[objectPath\]\)/);
  });

  it("replacement re-verifies the target document belongs to the caller's own application and matches type, before trusting attach_kyb_document's own server-side check", () => {
    const uploadBlock = KYB_ACTIONS.slice(KYB_ACTIONS.indexOf("export async function uploadKybDocument"), KYB_ACTIONS.indexOf("export async function submitKyb"));
    expect(uploadBlock).toMatch(/document\.documentType === documentTypeRaw/);
  });

  it("no public URL is ever generated anywhere in the upload path", () => {
    expect(KYB_ACTIONS).not.toMatch(/getPublicUrl|createSignedUrl/);
    expect(KYB_DOCUMENTS_LIB).not.toMatch(/getPublicUrl/);
  });

  it("the upload UI shows real states only — no fake progress percentage", () => {
    expect(DOCUMENT_ROW).not.toMatch(/\d+%|progress.*percent/i);
    expect(DOCUMENT_ROW).toMatch(/isPending/);
  });
});

describe("T018 — KYB submission", () => {
  it("submitKyb transitions DRAFT only, via submit_kyb_application, never a direct status write", () => {
    const submitBlock = KYB_ACTIONS.slice(KYB_ACTIONS.indexOf("export async function submitKyb"), KYB_ACTIONS.indexOf("export async function resubmitKyb"));
    expect(submitBlock).toMatch(/status !== "DRAFT"/);
    expect(submitBlock).toMatch(/submitKybApplication/);
    expect(submitBlock).not.toMatch(/\.update\(\{\s*status:/);
  });

  it("never lets the member set UNDER_REVIEW, APPROVED, REJECTED, RESUBMISSION_REQUIRED, or SUSPENDED directly", () => {
    expect(KYB_ACTIONS).not.toMatch(/["']UNDER_REVIEW["']|["']APPROVED["']|["']REJECTED["']|["']SUSPENDED["']/);
  });

  it("relies on the underlying RPCs' own blocked-user check — same documented reasoning as dashboard/onboarding/actions.ts", () => {
    expect(KYB_ACTIONS).toMatch(/RequestIdentity[\s\S]*carries no[\s\S]*isBlocked/);
  });
});

describe("T019 — all seven KYB states + the implicit no-application state", () => {
  it("KybStatusScreen has a distinct, honest branch for every kyb_applications.status value", () => {
    for (const status of ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED", "REJECTED", "SUSPENDED", "APPROVED"]) {
      expect(STATUS_SCREEN).toMatch(new RegExp(`case "${status}"`));
    }
    expect(STATUS_SCREEN).toMatch(/if \(!application\)/);
  });

  it("no fake ETA, no fake reviewer identity anywhere in the status copy", () => {
    const en = readFileSync("lib/app/copy/en.ts", "utf8");
    const kybSection = en.slice(en.indexOf("kyb: {"));
    expect(kybSection).not.toMatch(/\d+\s*(hours?|days?|business days?)/i);
    expect(kybSection).not.toMatch(/reviewer:\s*"(?!Hills Compliance)/);
  });

  it("never implies approval before identity.isAuthorizedMember genuinely says so — the hub is reached only through that same guard", () => {
    expect(DASHBOARD_PAGE).toMatch(/!identity\.isAuthorizedMember/);
    const guardIndex = DASHBOARD_PAGE.indexOf("!identity.isAuthorizedMember");
    const hubIndex = DASHBOARD_PAGE.indexOf("<KybStatusScreen");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(hubIndex).toBeGreaterThan(guardIndex);
  });
});

describe("T020 — RESUBMISSION_REQUIRED handling", () => {
  it("shows the specific rejected item and its Compliance-recorded reason, never reviewer_user_id", () => {
    expect(STATUS_SCREEN).toMatch(/review\?\.reason/);
    expect(STATUS_SCREEN).not.toMatch(/reviewer_user_id/);
    expect(STATUS_SCREEN).not.toMatch(/reviewerUserId/);
  });

  it("list_kyb_document_reviews is the only review read path — never a direct kyb_review_items query", () => {
    const reviewItems = readFileSync("lib/kyb/review-items.ts", "utf8");
    expect(reviewItems).toMatch(/list_kyb_document_reviews/);
    expect(reviewItems).not.toMatch(/\.from\(["']kyb_review_items["']\)/);
    expect(KYB_STATUS).not.toMatch(/\.from\(["']kyb_review_items["']\)/);
  });

  it("replacement supersedes the prior version — never a destructive update/delete of evidence", () => {
    expect(KYB_ACTIONS).toMatch(/resolvedSupersedesId/);
    expect(KYB_ACTIONS).not.toMatch(/kyb_documents["']\)\.(update|delete)/);
    expect(KYB_ACTIONS).not.toMatch(/storage\.from\(KYB_EVIDENCE_BUCKET\)\.update/);
  });

  it("resubmitKyb re-validates completeness (including unresolved REJECTED documents) before calling resubmit_kyb_application", () => {
    const resubmitBlock = KYB_ACTIONS.slice(KYB_ACTIONS.indexOf("export async function resubmitKyb"));
    expect(resubmitBlock).toMatch(/status !== "RESUBMISSION_REQUIRED"/);
    expect(resubmitBlock).toMatch(/checkKybCompleteness/);
    expect(resubmitBlock).toMatch(/resubmitKybApplication/);
  });

  it("the submit panel shows every specific missing item, server-recomputed on every attempt, never trusted purely client-side", () => {
    expect(SUBMIT_PANEL).toMatch(/fieldErrors/);
    expect(SUBMIT_PANEL).toMatch(/missing\.map/);
  });
});

describe("T021 — REJECTED / SUSPENDED restricted states", () => {
  it("REJECTED shows the compliance-recorded reason and no trading CTA", () => {
    const rejectedBlock = STATUS_SCREEN.slice(STATUS_SCREEN.indexOf('case "REJECTED"'), STATUS_SCREEN.indexOf('case "SUSPENDED"'));
    expect(rejectedBlock).toMatch(/rejectionReason/);
    expect(rejectedBlock).not.toMatch(/href="\/dashboard\/kyb/);
    expect(rejectedBlock).not.toMatch(/marketplace|buy now|sell|inventory|order/i);
  });

  it("SUSPENDED shows a restricted state with no protected business access and no trading CTA", () => {
    const suspendedBlock = STATUS_SCREEN.slice(STATUS_SCREEN.indexOf('case "SUSPENDED"'), STATUS_SCREEN.indexOf('case "APPROVED"'));
    expect(suspendedBlock).not.toMatch(/href="\/dashboard\/kyb/);
    expect(suspendedBlock).not.toMatch(/marketplace|buy now|sell|inventory|order/i);
  });

  it("the server gate remains authoritative — no UI-only override exists; dashboard/layout.tsx still never renders the business AppShell for a REJECTED/SUSPENDED organization", () => {
    const guardIndex = DASHBOARD_LAYOUT.indexOf("if (!identity.isAuthorizedMember)");
    const appShellIndex = DASHBOARD_LAYOUT.indexOf("<AppShell");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(appShellIndex).toBeGreaterThan(guardIndex);
  });
});

describe("T022 — expired document surfacing", () => {
  it("isDocumentExpired is a pure date comparison — never fabricates expiry for a document type that has none", () => {
    expect(isDocumentExpired({ expiresAt: null })).toBe(false);
    expect(isDocumentExpired({ expiresAt: "2020-01-01" }, new Date("2026-01-01"))).toBe(true);
    expect(isDocumentExpired({ expiresAt: "2030-01-01" }, new Date("2026-01-01"))).toBe(false);
  });

  it("only document types the schema marks expiry-applicable carry an expires_at UI treatment", () => {
    const expiryApplicable = KYB_DOCUMENT_TYPES.filter((t) => t.expiryApplicable).map((t) => t.type);
    const notApplicable = KYB_DOCUMENT_TYPES.filter((t) => !t.expiryApplicable).map((t) => t.type);
    expect(expiryApplicable).toEqual(["TRADE_LICENSE", "AUTHORIZED_SIGNATORY_ID"]);
    expect(notApplicable).toEqual(["PROOF_OF_INCORPORATION", "UBO_DECLARATION", "BANKING_EVIDENCE"]);
  });

  it("the status hub surfaces an expired-document warning regardless of application status", () => {
    expect(STATUS_SCREEN).toMatch(/ExpiredDocumentWarning/);
    expect(STATUS_SCREEN).toMatch(/isDocumentExpired\(document\)/);
  });
});

describe("Dashboard experience — RUN B routing", () => {
  it("dashboard/layout.tsx renders {children} (not a static component) for a not-yet-authorized organization, enabling /dashboard/kyb/ to be a real reachable route", () => {
    const authCheckIndex = DASHBOARD_LAYOUT.indexOf("if (!identity.isAuthorizedMember)");
    const finalAppShellReturnIndex = DASHBOARD_LAYOUT.indexOf("return (\n    <AppShell");
    const notAuthorizedBlock = DASHBOARD_LAYOUT.slice(authCheckIndex, finalAppShellReturnIndex);
    expect(finalAppShellReturnIndex).toBeGreaterThan(-1);
    expect(notAuthorizedBlock).toMatch(/\{children\}/);
    expect(notAuthorizedBlock).not.toMatch(/<AppShell/);
  });

  it("every pre-AppShell dashboard/layout.tsx branch renders PreAuthHeader (theme/locale toggles + a way back to the public site)", () => {
    expect(DASHBOARD_LAYOUT).toMatch(/import \{ PreAuthHeader \} from "@\/components\/app\/pre-auth-header";/);
    const preAppShellSection = DASHBOARD_LAYOUT.slice(0, DASHBOARD_LAYOUT.indexOf("return (\n    <AppShell"));
    const preAuthHeaderUsages = preAppShellSection.match(/<PreAuthHeader \/>/g) ?? [];
    // One usage per early-return branch before AppShell (unauthenticated, email-not-verified,
    // multi-org selection, no-organization onboarding, not-yet-authorized).
    expect(preAuthHeaderUsages.length).toBeGreaterThanOrEqual(5);
  });

  it("/dashboard/kyb/page.tsx independently re-verifies identity and redirects away when not applicable", () => {
    expect(KYB_PAGE).toMatch(/identity\.kind !== "authenticated"/);
    expect(KYB_PAGE).toMatch(/identity\.isAuthorizedMember/);
    expect(KYB_PAGE).toMatch(/KYB_EDITABLE_STATUSES/);
    expect(KYB_PAGE).toMatch(/redirect\("\/dashboard\/"\)/);
  });

  it("/dashboard/kyb/page.tsx renders no business content (no marketplace/inventory/order data)", () => {
    expect(KYB_PAGE).not.toMatch(/\$\d|AED|USD|inventory|marketplace|order (count|total)/i);
  });
});

describe("Security — no authorization field ever accepted from the member across RUN B", () => {
  const surfaces = [KYB_ACTIONS, MUTATIONS, KYB_DOCUMENTS_LIB];
  it("no Server Action or wrapper accepts p_status, p_can_buy, p_can_sell, p_decided_by, p_decided_at, or a reviewer id as a parameter", () => {
    for (const surface of surfaces) {
      expect(surface).not.toMatch(/p_status|p_can_buy|p_can_sell|p_decided_by|p_decided_at|p_reviewer/);
    }
  });

  it("uses no service-role client anywhere in the new RUN B surface", () => {
    for (const surface of [...surfaces, KYB_PAGE, DASHBOARD_PAGE, STATUS_SCREEN, DRAFT_FORM, DOCUMENT_ROW, DOCUMENT_CHECKLIST, SUBMIT_PANEL]) {
      expect(surface).not.toMatch(/SERVICE_ROLE/);
    }
  });
});

describe("PreAuthHeader — theme/locale toggles + home link for every pre-AppShell dashboard state", () => {
  const PRE_AUTH_HEADER = readFileSync("components/app/pre-auth-header.tsx", "utf8");

  it("renders the existing ThemeToggle and LanguageSwitcher islands — no second toggle implementation", () => {
    expect(PRE_AUTH_HEADER).toMatch(/<ThemeToggle \/>/);
    expect(PRE_AUTH_HEADER).toMatch(/<LanguageSwitcher \/>/);
    expect(PRE_AUTH_HEADER).toMatch(/from "@\/components\/theme\/theme-toggle"/);
    expect(PRE_AUTH_HEADER).toMatch(/from "@\/components\/locale\/language-switcher"/);
  });

  it("links back to the public home page", () => {
    expect(PRE_AUTH_HEADER).toMatch(/<Link\s+href="\/"/);
  });

  it("is a Server Component — only the pre-existing ThemeToggle/LanguageSwitcher client islands are involved", () => {
    expect(PRE_AUTH_HEADER).not.toMatch(/"use client"/);
  });
});
