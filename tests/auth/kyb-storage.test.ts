import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  KYB_EVIDENCE_ALLOWED_MIME_TYPES,
  KYB_EVIDENCE_BUCKET,
  KYB_EVIDENCE_MAX_SIZE_BYTES,
  buildKybObjectPath,
} from "@/lib/kyb/documents";

/**
 * Feature 003 RUN DB — T010d static/contract verification for the private `kyb-evidence` Storage
 * bucket, its object policies, and `attach_kyb_document`
 * (`specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §3–4).
 *
 * STATIC/CONTRACT VERIFIED ONLY — see the header note in `controlled-onboarding.test.ts`. Real
 * bucket MIME/size enforcement, real cross-org denial, and real signed/server-mediated download
 * behaviour all require a live applied database and are explicitly LIVE DB NOT YET APPLIED.
 */
const MIGRATION_PATH = "supabase/migrations/20260911010000_feature_003_kyb_foundation.sql";
const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("T010d — private bucket contract", () => {
  it("creates exactly one bucket, and it is private", () => {
    const bucketInsert = sql.match(/insert into storage\.buckets[\s\S]*?on conflict \(id\) do nothing;/);
    expect(bucketInsert).not.toBeNull();
    expect(bucketInsert![0]).toMatch(/'kyb-evidence'/);
    expect(bucketInsert![0]).toMatch(/false,\s*\n\s*10485760/);
  });

  it("allows only PDF/JPEG/PNG at the bucket level", () => {
    expect(sql).toMatch(/allowed_mime_types\)\s*\nvalues \(\s*\n\s*'kyb-evidence',\s*\n\s*'kyb-evidence',\s*\n\s*false,\s*\n\s*10485760,\s*\n\s*array\['application\/pdf', 'image\/jpeg', 'image\/png'\]/);
  });

  it("the lib wrapper's declared constants match the migration's bucket contract exactly", () => {
    expect(KYB_EVIDENCE_BUCKET).toBe("kyb-evidence");
    expect(KYB_EVIDENCE_MAX_SIZE_BYTES).toBe(10485760);
    expect([...KYB_EVIDENCE_ALLOWED_MIME_TYPES].sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/png"].sort()
    );
  });

  it("creates no public bucket and no anonymous storage policy", () => {
    expect(sql).not.toMatch(/insert into storage\.buckets[\s\S]{0,200}true,\s*\n\s*10485760/);
    const storagePolicies = sql.match(/create policy kyb_evidence_\w+ on storage\.objects[\s\S]*?;/g) ?? [];
    expect(storagePolicies.length).toBeGreaterThan(0);
    for (const policy of storagePolicies) {
      expect(policy).toMatch(/to authenticated/);
      expect(policy).not.toMatch(/\banon\b/);
      expect(policy).not.toMatch(/to public\b/);
    }
  });

  it("grants members no UPDATE or DELETE policy on kyb-evidence objects", () => {
    expect(sql).not.toMatch(/create policy kyb_evidence_member_\w*\s+on storage\.objects[\s\S]*?for (update|delete)/i);
  });

  it("the member INSERT policy requires the referenced application to be in an editable state", () => {
    const insertPolicy = sql.match(/create policy kyb_evidence_member_insert[\s\S]*?;/);
    expect(insertPolicy).not.toBeNull();
    expect(insertPolicy![0]).toMatch(/kyb_storage_object_authorized\(name, true\)/);
  });

  it("the member SELECT policy does not require an editable state (read own evidence anytime)", () => {
    const selectPolicy = sql.match(/create policy kyb_evidence_member_select[\s\S]*?;/);
    expect(selectPolicy).not.toBeNull();
    expect(selectPolicy![0]).toMatch(/kyb_storage_object_authorized\(name, false\)/);
  });

  it("kyb_storage_object_authorized cross-checks the path's organization against the application's real organization_id", () => {
    const fnStart = sql.indexOf("create or replace function public.kyb_storage_object_authorized(");
    const fnEnd = sql.indexOf("\n$$;", fnStart);
    const body = sql.slice(fnStart, fnEnd);
    expect(body).toMatch(/select organization_id, status into v_app_org_id, v_app_status/);
    expect(body).toMatch(/v_app_org_id is null or v_app_org_id <> v_org_id/);
    expect(body).toMatch(/is_org_member\(v_org_id\)/);
  });

  it("REVIEW FIX #8 — the blocked-user check runs BEFORE the admin/compliance short-circuit, so a blocked admin/compliance identity is still denied", () => {
    const fnStart = sql.indexOf("create or replace function public.kyb_storage_object_authorized(");
    const fnEnd = sql.indexOf("\n$$;", fnStart);
    const body = sql.slice(fnStart, fnEnd);
    const blockedIndex = body.indexOf("is_blocked_user()");
    const adminIndex = body.indexOf("is_platform_admin() or public.is_compliance_operator()");
    expect(blockedIndex).toBeGreaterThan(-1);
    expect(adminIndex).toBeGreaterThan(-1);
    expect(blockedIndex).toBeLessThan(adminIndex);
  });

  it("REVIEW FIX #3 — no admin/compliance ALL policy exists on kyb-evidence storage objects; the prior draft's kyb_evidence_admin_all is explicitly dropped and not recreated", () => {
    expect(sql).toMatch(/drop policy if exists kyb_evidence_admin_all on storage\.objects;/);
    expect(sql).not.toMatch(/create policy kyb_evidence_admin_all/);
    const storagePolicyNames = [...sql.matchAll(/create policy (kyb_evidence_\w+) on storage\.objects/g)].map((m) => m[1]);
    expect(storagePolicyNames.sort()).toEqual(["kyb_evidence_member_insert", "kyb_evidence_member_select"]);
  });

  it("buildKybObjectPath produces exactly the path prefix the RPC and Storage policy both expect", () => {
    const path = buildKybObjectPath("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "file.pdf");
    expect(path).toBe("org/11111111-1111-1111-1111-111111111111/application/22222222-2222-2222-2222-222222222222/file.pdf");
  });
});

describe("T010d — attach_kyb_document metadata seam", () => {
  function functionBody(name: string): string {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    const end = sql.indexOf("\n$$;", start);
    return sql.slice(start, end);
  }

  it("derives organization_id server-side from the application row, never from a caller argument", () => {
    const signatureStart = sql.indexOf("create or replace function public.attach_kyb_document(");
    const signatureEnd = sql.indexOf(")\nreturns uuid", signatureStart);
    const signature = sql.slice(signatureStart, signatureEnd);
    expect(signature).not.toMatch(/p_organization_id/);
    expect(signature).not.toMatch(/p_uploaded_by/);
    expect(signature).not.toMatch(/p_bucket_name/);

    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/select organization_id, status into v_organization_id, v_status/);
  });

  it("enforces the object path prefix matches the caller's own organization/application", () => {
    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/cross_organization_object_path/);
    expect(body).toMatch(/v_expected_prefix := 'org\/' \|\| v_organization_id::text \|\| '\/application\/' \|\| p_application_id::text \|\| '\/'/);
  });

  it("only allows attaching while the application is in an editable state", () => {
    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/v_status not in \('DRAFT', 'RESUBMISSION_REQUIRED'\)/);
  });

  it("re-validates MIME type and size as defense in depth alongside the bucket's own enforcement", () => {
    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/invalid_mime_type/);
    expect(body).toMatch(/object_too_large/);
  });

  it("a document replacement (supersedes_document_id) must belong to the same application", () => {
    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/cross_application_document_replacement/);
    expect(body).toMatch(/v_prev_application_id <> p_application_id/);
  });

  it("REVIEW FIX #4 — refuses to create canonical metadata unless the exact object already exists in storage.objects", () => {
    const body = functionBody("attach_kyb_document");
    const existsCheckIndex = body.indexOf("storage_object_not_found");
    const insertFileAssetIndex = body.indexOf("insert into public.file_assets");
    expect(existsCheckIndex).toBeGreaterThan(-1);
    expect(insertFileAssetIndex).toBeGreaterThan(-1);
    expect(existsCheckIndex).toBeLessThan(insertFileAssetIndex);
    expect(body).toMatch(/from storage\.objects so\s*\n\s*where so\.bucket_id = 'kyb-evidence'\s*\n\s*and so\.name = p_object_path/);
  });

  it("REVIEW FIX #4 — cross-checks caller-provided MIME/size against the Storage object's own recorded metadata when present", () => {
    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/so\.metadata ->> 'mimetype'/);
    expect(body).toMatch(/so\.metadata ->> 'size'/);
    expect(body).toMatch(/mime_type_mismatch/);
    expect(body).toMatch(/size_mismatch/);
  });

  it("REVIEW FIX #4 — documents the residual live-verification requirement rather than assuming unconfirmed storage.objects.metadata key names", () => {
    const body = functionBody("attach_kyb_document");
    expect(body).toMatch(/REQUIRED T010g LIVE-VERIFICATION STEP/);
  });

  it("EXECUTE is revoked from PUBLIC and never granted to anon", () => {
    const grantBlock = sql.slice(
      sql.indexOf("revoke all on function public.attach_kyb_document"),
      sql.indexOf("revoke all on function public.attach_kyb_document") + 400
    );
    expect(grantBlock).toMatch(/from public/);
    expect(grantBlock).not.toMatch(/\banon\b/);
  });
});

describe("T010d — no service-role runtime workaround anywhere in this feature's new code", () => {
  it("no lib/kyb/*.ts file references SERVICE_ROLE", () => {
    for (const file of ["lib/kyb/documents.ts", "lib/kyb/mutations.ts", "lib/kyb/review-items.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/SERVICE_ROLE/);
    }
  });

  it("no base64 document storage is used — file_assets/kyb_documents remain metadata-only pointers", () => {
    expect(sql).not.toMatch(/base64/i);
  });
});
