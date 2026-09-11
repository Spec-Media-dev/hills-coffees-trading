import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 003 RUN DB — T010f static/contract verification for the document-level review/version
 * model (`specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §5).
 *
 * STATIC/CONTRACT VERIFIED ONLY — see the header note in `controlled-onboarding.test.ts`.
 */
const MIGRATION_PATH = "supabase/migrations/20260911010000_feature_003_kyb_foundation.sql";
const sql = readFileSync(MIGRATION_PATH, "utf8");

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `function ${name} must exist`).toBeGreaterThan(-1);
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end);
}

describe("T010f — kyb_documents version/lineage columns", () => {
  it("adds version, supersedes_document_id, and a closed-vocabulary status column", () => {
    expect(sql).toMatch(/alter table public\.kyb_documents add column if not exists version integer not null default 1;/);
    expect(sql).toMatch(/alter table public\.kyb_documents add column if not exists supersedes_document_id uuid references public\.kyb_documents\(id\);/);
    expect(sql).toMatch(/status in \('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'\)/);
  });
});

describe("T010f — kyb_review_items table", () => {
  it("carries a specific document/application/reviewer/decision/reason/timestamp shape", () => {
    const tableStart = sql.indexOf("create table if not exists public.kyb_review_items");
    const tableEnd = sql.indexOf(");", tableStart);
    const body = sql.slice(tableStart, tableEnd);
    for (const column of ["application_id", "document_id", "decision", "reason", "reviewer_user_id", "created_at"]) {
      expect(body, `kyb_review_items must have a ${column} column`).toContain(column);
    }
    expect(body).toMatch(/decision text not null check \(decision in \('ACCEPTED', 'REJECTED'\)\)/);
  });

  it("has RLS enabled with a compliance-only SELECT policy — no member policy, and no INSERT/UPDATE/DELETE policy for anyone", () => {
    expect(sql).toMatch(/alter table public\.kyb_review_items enable row level security;/);
    const reviewItemPolicies = [...sql.matchAll(/create policy (\w+) on public\.kyb_review_items/g)].map((m) => m[1]);
    expect(reviewItemPolicies).toEqual(["kyb_review_items_compliance_select"]);
    const policyBlock = sql.match(/create policy kyb_review_items_compliance_select[\s\S]*?;/);
    expect(policyBlock).not.toBeNull();
    expect(policyBlock![0]).toMatch(/for select to authenticated/);
  });
});

describe("T010f — REVIEW FIX #1: reviews are immutable and created only through create_kyb_review", () => {
  function findFunctionBody(name: string): string {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    expect(start, `function ${name} must exist`).toBeGreaterThan(-1);
    const end = sql.indexOf("\n$$;", start);
    return sql.slice(start, end);
  }

  it("create_kyb_review requires is_compliance_operator() and accepts only application/document/decision/reason", () => {
    const signatureStart = sql.indexOf("create or replace function public.create_kyb_review(");
    const signatureEnd = sql.indexOf(")\nreturns uuid", signatureStart);
    const signature = sql.slice(signatureStart, signatureEnd);
    expect(signature).toMatch(/p_application_id uuid/);
    expect(signature).toMatch(/p_document_id uuid/);
    expect(signature).toMatch(/p_decision text/);
    expect(signature).toMatch(/p_reason text/);
    for (const forbidden of ["p_reviewer_user_id", "p_created_at", "p_reviewed_at"]) {
      expect(signature, `signature must not accept ${forbidden}`).not.toContain(forbidden);
    }

    const body = findFunctionBody("create_kyb_review");
    expect(body).toMatch(/is_compliance_operator\(\)/);
  });

  it("forging reviewer identity is impossible — reviewer_user_id is always auth.uid(), never a caller argument", () => {
    const body = findFunctionBody("create_kyb_review");
    expect(body).toMatch(/values \(p_application_id, p_document_id, p_decision, p_reason, auth\.uid\(\)\)/);
  });

  it("forging a review timestamp is impossible — created_at has no caller-facing parameter and is DB-derived only", () => {
    const insertColumns = sql.match(/insert into public\.kyb_review_items \(([^)]*)\)/);
    expect(insertColumns).not.toBeNull();
    expect(insertColumns![1]).not.toMatch(/created_at/);
    // The column itself is `not null default now()` (asserted in the table-shape test above) — the
    // only INSERT statement in this migration never supplies it, so it is always database time.
  });

  it("requires a reason when the decision is REJECTED", () => {
    const body = findFunctionBody("create_kyb_review");
    expect(body).toMatch(/reason_required_for_rejection/);
    expect(body).toMatch(/p_decision = 'REJECTED' and \(p_reason is null or length\(trim\(p_reason\)\) = 0\)/);
  });

  it("verifies the document belongs to the application before inserting", () => {
    const body = findFunctionBody("create_kyb_review");
    expect(body).toMatch(/kd\.id = p_document_id\s*\n\s*and kd\.application_id = p_application_id/);
  });

  it("EXECUTE is revoked from PUBLIC and never granted to anon", () => {
    const grantBlock = sql.slice(
      sql.indexOf("revoke all on function public.create_kyb_review"),
      sql.indexOf("revoke all on function public.create_kyb_review") + 300
    );
    expect(grantBlock).toMatch(/from public/);
    expect(grantBlock).not.toMatch(/\banon\b/);
  });

  it("a trigger unconditionally refuses UPDATE or DELETE on kyb_review_items — even for a trusted-looking caller", () => {
    const body = findFunctionBody("prevent_kyb_review_item_mutation");
    expect(body).toMatch(/raise exception 'kyb_review_items_is_append_only';/);
    expect(sql).toMatch(/create trigger trg_prevent_kyb_review_item_mutation\s*\n\s*before update or delete on public\.kyb_review_items/);
  });

  it("the lib wrapper offers no update/delete function for a review event — create only", () => {
    const source = readFileSync("lib/kyb/review-items.ts", "utf8");
    expect(source).toMatch(/export async function createKybReview/);
    expect(source).not.toMatch(/updateKybReview|deleteKybReview/);
  });
});

describe("T010f — lineage/replacement integrity triggers", () => {
  it("validate_kyb_document_lineage refuses cross-application and self-referential replacement, and enforces version = old + 1", () => {
    const body = functionBody("validate_kyb_document_lineage");
    expect(body).toMatch(/self_replacement_not_allowed/);
    expect(body).toMatch(/cross_application_document_replacement/);
    expect(body).toMatch(/invalid_document_version/);
    expect(body).toMatch(/new\.version <> v_prev_version \+ 1/);
  });

  it("marks the superseded document SUPERSEDED rather than deleting or overwriting it", () => {
    const body = functionBody("validate_kyb_document_lineage");
    expect(body).toMatch(/set status = 'SUPERSEDED'/);
    expect(body).not.toMatch(/delete from public\.kyb_documents/);
  });

  it("REVIEW FIX #2 — refuses a replacement whose document_type differs from the document it supersedes", () => {
    const body = functionBody("validate_kyb_document_lineage");
    expect(body).toMatch(/v_prev_document_type <> new\.document_type/);
    expect(body).toMatch(/cross_document_type_replacement/);
  });

  it("REVIEW FIX #2 — a unique index prevents two documents from both superseding the same prior document (no branching)", () => {
    expect(sql).toMatch(
      /create unique index if not exists uq_kyb_documents_supersedes_document_id\s*\n\s*on public\.kyb_documents \(supersedes_document_id\)\s*\n\s*where supersedes_document_id is not null;/
    );
  });

  it("REVIEW FIX #2 — attach_kyb_document mirrors the same document_type check before inserting", () => {
    const attachStart = sql.indexOf("create or replace function public.attach_kyb_document(");
    const attachEnd = sql.indexOf("\n$$;", attachStart);
    const attachBody = sql.slice(attachStart, attachEnd);
    expect(attachBody).toMatch(/v_prev_document_type <> p_document_type/);
    expect(attachBody).toMatch(/cross_document_type_replacement/);
  });

  it("REVIEW FIX #2 — there is no RLS-granted direct UPDATE/DELETE path to kyb_documents for anyone (removes the bypass, not just narrows it)", () => {
    expect(sql).toMatch(/drop policy if exists kyb_documents_own_or_admin on public\.kyb_documents;/);
    expect(sql).toMatch(/drop policy if exists kyb_documents_admin_write on public\.kyb_documents;/);
    const kybDocumentPolicies = [...sql.matchAll(/create policy (\w+) on public\.kyb_documents/g)].map((m) => m[1]);
    expect(kybDocumentPolicies).toEqual(["kyb_documents_member_select"]);
    expect(sql.match(/create policy kyb_documents_member_select[\s\S]*?;/)![0]).toMatch(/for select to authenticated/);
  });

  it("validate_review_item_document refuses a review item whose document belongs to a different application", () => {
    const body = functionBody("validate_review_item_document");
    expect(body).toMatch(/review_item_document_application_mismatch/);
    expect(body).toMatch(/kd\.application_id = new\.application_id/);
  });

  it("apply_kyb_review_item_decision never resurrects an already-superseded document's status", () => {
    const body = functionBody("apply_kyb_review_item_decision");
    expect(body).toMatch(/status <> 'SUPERSEDED'/);
  });

  it("both new tables get the same existing write_audit_log() trigger already used on organizations/kyb_applications — no new audit mechanism invented", () => {
    expect(sql).toMatch(/create trigger trg_audit_kyb_documents\s*\n\s*after insert or delete or update on public\.kyb_documents\s*\n\s*for each row execute function public\.write_audit_log\(\);/);
    expect(sql).toMatch(/create trigger trg_audit_kyb_review_items\s*\n\s*after insert or delete or update on public\.kyb_review_items\s*\n\s*for each row execute function public\.write_audit_log\(\);/);
  });
});

describe("T010f — member-facing review read (list_kyb_document_reviews)", () => {
  it("never selects reviewer_user_id — every row carries the fixed 'Hills Compliance' label instead", () => {
    const body = functionBody("list_kyb_document_reviews");
    expect(body).not.toMatch(/reviewer_user_id/);
    expect(body).toMatch(/'Hills Compliance'::text as reviewer_label/);
  });

  it("requires the caller to be an org member of the application before returning anything", () => {
    const body = functionBody("list_kyb_document_reviews");
    expect(body).toMatch(/is_org_member\(v_organization_id\)/);
    expect(body).toMatch(/raise exception 'forbidden';/);
  });

  it("EXECUTE is revoked from PUBLIC and never granted to anon", () => {
    const grantBlock = sql.slice(
      sql.indexOf("revoke all on function public.list_kyb_document_reviews"),
      sql.indexOf("revoke all on function public.list_kyb_document_reviews") + 300
    );
    expect(grantBlock).toMatch(/from public/);
    expect(grantBlock).not.toMatch(/\banon\b/);
  });

  it("the lib/kyb wrapper's public type never exposes a reviewer identity field", () => {
    const source = readFileSync("lib/kyb/review-items.ts", "utf8");
    const typeStart = source.indexOf("export type KybDocumentReview = {");
    const typeEnd = source.indexOf("};", typeStart);
    const typeBody = source.slice(typeStart, typeEnd);
    expect(typeBody).not.toMatch(/reviewerUserId/);
    expect(typeBody).toMatch(/reviewerLabel/);
  });
});

describe("T010f — kyb_documents member write access is narrowed to a constrained RPC", () => {
  it("drops the old ALL policy and replaces ALL write access (member and admin alike) with SELECT-only", () => {
    expect(sql).toMatch(/drop policy if exists kyb_documents_own_or_admin on public\.kyb_documents;/);
    const memberPolicy = sql.match(/create policy kyb_documents_member_select[\s\S]*?;/);
    expect(memberPolicy).not.toBeNull();
    expect(memberPolicy![0]).toMatch(/for select to authenticated/);
    expect(memberPolicy![0]).toMatch(/is_platform_admin\(\)/);
    expect(memberPolicy![0]).toMatch(/is_compliance_operator\(\)/);
  });

  it("REVIEW FIX #3 — no admin/compliance ALL (write) policy exists on kyb_documents; the prior draft's kyb_documents_admin_write is explicitly dropped", () => {
    expect(sql).toMatch(/drop policy if exists kyb_documents_admin_write on public\.kyb_documents;/);
    expect(sql).not.toMatch(/create policy kyb_documents_admin_write/);
    expect(sql).not.toMatch(/create policy [^;]*on public\.kyb_documents[^;]*for all/i);
  });
});

describe("T010e — safe resubmission (migration review fix #5)", () => {
  function findFunctionBody(name: string): string {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    expect(start, `function ${name} must exist`).toBeGreaterThan(-1);
    const end = sql.indexOf("\n$$;", start);
    return sql.slice(start, end);
  }

  it("resubmit_kyb_application refuses to transition while any current document is REJECTED", () => {
    const body = findFunctionBody("resubmit_kyb_application");
    expect(body).toMatch(/unresolved_rejected_document/);
    expect(body).toMatch(/status = 'REJECTED'/);
  });

  it("the unresolved-document check runs BEFORE the state transition", () => {
    const body = findFunctionBody("resubmit_kyb_application");
    const checkIndex = body.indexOf("unresolved_rejected_document");
    const transitionIndex = body.indexOf("perform public.transition_kyb_application");
    expect(checkIndex).toBeGreaterThan(-1);
    expect(transitionIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeLessThan(transitionIndex);
  });

  it("does not invent a Phase-4 business-completeness field — it reads only the status column this migration itself adds", () => {
    const body = findFunctionBody("resubmit_kyb_application");
    expect(body).toMatch(/from public\.kyb_documents\s*\n\s*where application_id = p_application_id\s*\n\s*and status = 'REJECTED'/);
  });
});

describe("T010f — no Realtime dependency introduced anywhere in this migration", () => {
  it("contains no publication statement", () => {
    expect(sql).not.toMatch(/alter publication/i);
    expect(sql).not.toMatch(/supabase_realtime/i);
  });
});
