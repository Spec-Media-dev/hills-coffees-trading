import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuditLogPanel } from "@/components/admin/audit/audit-log-panel";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { ADMIN_AREAS } from "@/lib/admin/areas";
import { publicTagsFor } from "@/lib/admin/catalogue";
import { COFFEE_STATUSES, COFFEE_TRANSITIONS, CoffeeTransitionInput, ORIGIN_STATUSES, TAXONOMY_KINDS, WarehouseFieldsInput } from "@/lib/admin/catalogue-validation";
import { evaluateKybApprovalReadiness, KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES } from "@/lib/admin/kyb-readiness";
import { KYB_DOCUMENT_DECISIONS, KybDocumentReviewInput } from "@/lib/admin/validation";
import type { KybDocumentSummary } from "@/lib/kyb/status-types";
import { TAG_PUBLIC_COFFEES, TAG_PUBLIC_ORIGINS, TAG_PUBLIC_TAXONOMY, tagPublicCoffee, tagPublicOrigin } from "@/lib/public/cache";

/**
 * Feature 010 RUN E — Phases 7–8 STATIC proof (no database, no session): the catalogue domain uses
 * the database's own status vocabularies and Feature 002's exact cache-tag register; the audit area
 * is read-only BY CONSTRUCTION (no mutation import can exist); the media seam is inert; the KYB
 * approval-readiness rule is the pure function the server enforces; and no RUN E file reaches for a
 * service role, a shared cache, a hard delete, a Storage upload, or a branding/avatar capability.
 * Live/browser proof (fixtures, publish → public visibility, AUDITOR session) lives in the RUN E live
 * suites and the CDP script — this file is what must hold regardless of environment.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** The approved schema report (docs/database) — the CHECK constraints and policies RUN E must mirror. */
function schemaReport(): { constraints: { table_name: string; constraint_name: string; definition: string }[]; rls_policies: { table_name: string; policy_name: string; command: string; using_expression: string | null }[]; table_grants: { table_name: string; grantee: string; privilege_type: string }[] } {
  const raw = JSON.parse(source("docs", "database", "database-schema-report.json")) as unknown;
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) for (const item of node) {
      const hit = find(item);
      if (hit) return hit;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "database_schema_report" && typeof value === "string") return JSON.parse(value);
        const hit = find(value);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(raw) as ReturnType<typeof schemaReport>;
}
const CATALOGUE_TABLES = ["coffees", "origins", "regions", "coffee_types", "coffee_varieties", "processing_methods", "packaging_types", "tags", "warehouses", "warehouse_locations", "coffee_media"] as const;

const CATALOGUE_FILES = [...walk("src/app/dashboard-admin/(catalogue)"), "lib/admin/catalogue.ts", "lib/admin/catalogue-validation.ts", ...walk("components/admin/catalogue")];
const AUDIT_FILES = [...walk("src/app/dashboard-admin/(audit)"), "lib/admin/audit.ts", ...walk("components/admin/audit")];
const RUN_E_FILES = [...CATALOGUE_FILES, ...AUDIT_FILES, "lib/admin/kyb-readiness.ts", "lib/admin/kyb-documents.ts", "src/app/dashboard-admin/(compliance)/kyb/[applicationId]/documents/[documentId]/file/route.ts", "components/admin/compliance/kyb-document-review-panel.tsx"];

afterEach(cleanup);

describe("T021 — coffee management uses the database's own vocabulary through named operations", () => {
  it("COFFEE_STATUSES and ORIGIN_STATUSES are exactly the schema CHECK constraints", () => {
    const { constraints } = schemaReport();
    const coffees = constraints.find((c) => c.constraint_name === "coffees_status_check")!.definition;
    const origins = constraints.find((c) => c.constraint_name === "origins_status_check")!.definition;
    for (const status of COFFEE_STATUSES) expect(coffees).toContain(`'${status}'::text`);
    for (const status of ORIGIN_STATUSES) expect(origins).toContain(`'${status}'::text`);
    expect((coffees.match(/'[A-Z_]+'::text/g) ?? []).length).toBe(COFFEE_STATUSES.length);
    expect((origins.match(/'[A-Z_]+'::text/g) ?? []).length).toBe(ORIGIN_STATUSES.length);
  });

  it("the four named operations are the only status writes, each compare-and-set on its source statuses; no generic status setter exists", () => {
    expect(Object.keys(COFFEE_TRANSITIONS).sort()).toEqual(["archive", "publish", "restore", "unpublish"]);
    for (const spec of Object.values(COFFEE_TRANSITIONS)) {
      expect(COFFEE_STATUSES).toContain(spec.to);
      for (const from of spec.from) expect(COFFEE_STATUSES).toContain(from);
      expect(spec.from).not.toContain(spec.to);
    }
    expect(CoffeeTransitionInput.safeParse({ coffeeId: "f0000000-0000-4000-8000-000000000044", operation: "PUBLISHED" }).success).toBe(false);
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    // The only `status:` writes on `coffees` are the DRAFT insert and the transition's `spec.to`.
    expect(catalogue.match(/status: "DRAFT"/g)?.length).toBe(1);
    expect(catalogue).toContain("update({ status: spec.to, updated_by: access.userId })");
    expect(catalogue).toContain('.in("status", [...spec.from])');
    expect(catalogue).not.toMatch(/status: parsed\.data\.status\s*[,}]\s*\)\s*\.eq\("id", parsed\.data\.coffeeId/);
    // The coffee form declares no status field — status never arrives as user input for coffees.
    expect(source("components", "admin", "catalogue", "coffee-fields.ts")).not.toMatch(/name: "status"/);
  });

  it("every catalogue write re-verifies is_platform_admin() before touching the database, and every catalogue page guards its own area", () => {
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    // Hardening run: catalogue image upload/removal and Arabic content saves are writes too.
    const writes = catalogue.match(/export async function (create|update|transition|set|upload|remove|save)\w+\(/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(14);
    expect((catalogue.match(/await requireCatalogueAdmin\(\)/g) ?? []).length).toBe(writes.length);
    expect(catalogue).toContain('checkRoleFunctionAccess("is_platform_admin")');
    for (const area of ADMIN_AREAS.filter((a) => a.group === "catalogue")) {
      expect(area.roleFunction).toBe("is_platform_admin");
      expect(area.availability).toBe("live");
    }
    for (const file of walk("src/app/dashboard-admin/(catalogue)").filter((f) => f.endsWith("page.tsx"))) {
      expect(source(file), file).toMatch(/checkAreaAccess\("(coffees|origins|regions|taxonomy|warehouses|media|prices)"\)/);
      expect(source(file), file).toContain("<AdminAccessDenied");
    }
    // The Server Actions file delegates to lib/admin/catalogue only — no direct table access.
    const actions = stripComments(source("src", "app", "dashboard-admin", "(catalogue)", "actions.ts"));
    expect(actions).toMatch(/^"use server";/);
    expect(actions).not.toMatch(/createClient|\.from\(|\.rpc\(/);
  });

  it("no hard delete, no service role, no shared cache anywhere in the RUN E files; the schema grants `authenticated` no DELETE on any catalogue table", () => {
    for (const file of RUN_E_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/\.delete\(|SERVICE_ROLE|service_role|unstable_cache|"use cache"|cacheTag|cacheLife/);
    }
    const { table_grants } = schemaReport();
    for (const table of CATALOGUE_TABLES) {
      const deleteGrants = table_grants.filter((g) => g.table_name === table && g.privilege_type === "DELETE").map((g) => g.grantee);
      expect(deleteGrants, table).not.toContain("authenticated");
      expect(deleteGrants, table).not.toContain("anon");
    }
  });
});

describe("T022 — reference surfaces: origins, regions, taxonomy (five tables), warehouses (reference fields only)", () => {
  it("taxonomy is five explicit kinds mapped to fixed table names — never a caller-supplied table", () => {
    expect([...TAXONOMY_KINDS]).toEqual(["coffeeTypes", "varieties", "processingMethods", "packagingTypes", "tags"]);
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    expect(catalogue).toContain("TAXONOMY_TABLES[parsed.data.kind]");
    expect(catalogue).not.toMatch(/\.from\(\s*(input|parsed\.data)\.table/);
  });

  it("warehouse management writes reference columns only — never inventory, custody, allocations or shipments", () => {
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    expect(catalogue).not.toMatch(/\.from\(\s*"(inventory_positions|storage_allocations|order_shipments|shipment_items|coffee_lots|ownership_events|inventory_reservations)"/);
    const parsed = WarehouseFieldsInput.safeParse({ code: "wh-x", name: "Test", countryCode: "ae", ownerOrganizationId: "f0000000-0000-4000-8000-000000000001", isActive: "on" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe("WH-X");
      expect(parsed.data.countryCode).toBe("AE");
      expect(parsed.data.isActive).toBe(true);
    }
    expect(WarehouseFieldsInput.safeParse({ code: "x", name: "Test", countryCode: "AE", ownerOrganizationId: "f0000000-0000-4000-8000-000000000001" }).success).toBe(false);
    // `warehouses.owner_organization_id` is NOT NULL in the approved schema — the contract requires it (the WIP had it optional).
    expect(WarehouseFieldsInput.safeParse({ code: "WH-X", name: "Test", countryCode: "AE" }).success).toBe(false);
  });

  it("each reference surface's page guards its own area and the create pages hand the client form only serializable props (no function props — the RUN B crash class)", () => {
    for (const file of walk("src/app/dashboard-admin/(catalogue)").filter((f) => f.endsWith("page.tsx"))) {
      expect(source(file), file).not.toMatch(/successHref=\{\(/);
      expect(source(file), file).not.toMatch(/successHref=\{[^"]/);
    }
    const form = source("components", "admin", "catalogue", "record-form.tsx");
    expect(form).toMatch(/^"use client";/);
    expect(form).toContain("successHrefTemplate?: string;");
    expect(form).not.toMatch(/successHref\?: \(/);
  });
});

describe("T023 — every catalogue mutation revalidates Feature 002's exact public cache tags", () => {
  it("publicTagsFor mirrors lib/public/cache.ts byte-for-byte: coffee → index + detail(slug); origin → origins + origin(slug) + coffees; region/taxonomy → their families; warehouse → nothing public", () => {
    expect(publicTagsFor({ kind: "coffee", slugs: ["public-test-coffee-run-e-proof"] })).toEqual([TAG_PUBLIC_COFFEES, tagPublicCoffee("public-test-coffee-run-e-proof")]);
    expect(publicTagsFor({ kind: "coffee", slugs: ["old-slug", "new-slug", "new-slug"] })).toEqual([TAG_PUBLIC_COFFEES, tagPublicCoffee("old-slug"), tagPublicCoffee("new-slug")]);
    expect(publicTagsFor({ kind: "origin", slugs: ["ethiopia"] })).toEqual([TAG_PUBLIC_ORIGINS, tagPublicOrigin("ethiopia"), TAG_PUBLIC_COFFEES]);
    expect(publicTagsFor({ kind: "region" })).toEqual([TAG_PUBLIC_ORIGINS, TAG_PUBLIC_COFFEES]);
    expect(publicTagsFor({ kind: "taxonomy" })).toEqual([TAG_PUBLIC_TAXONOMY, TAG_PUBLIC_COFFEES]);
    expect(publicTagsFor({ kind: "media", slug: "x" })).toEqual([TAG_PUBLIC_COFFEES, tagPublicCoffee("x")]);
    expect(publicTagsFor({ kind: "warehouse" })).toEqual([]);
    // The tag strings themselves are Feature 002's — nothing new was minted.
    expect(TAG_PUBLIC_COFFEES).toBe("public-coffees");
    expect(tagPublicCoffee("s")).toBe("public-coffee:s");
    expect(TAG_PUBLIC_ORIGINS).toBe("public-origins");
    expect(TAG_PUBLIC_TAXONOMY).toBe("public-taxonomy");
  });

  it("the invalidation call is Feature 001's pinned `revalidateTag(tag, { expire: 0 })`; no broad path purge of the public site; Feature 002's cached readers still use these tags", () => {
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    expect(catalogue).toContain("revalidateTag(tag, { expire: 0 })");
    expect(catalogue).not.toMatch(/revalidatePath\(/);
    const actions = stripComments(source("src", "app", "dashboard-admin", "(catalogue)", "actions.ts"));
    expect(actions).not.toMatch(/revalidatePath\("\/(coffee|origins|coffees)?"?\)|revalidatePath\("\/"\)|revalidatePath\("\/coffee/);
    const publicCoffees = source("lib", "public", "coffees.ts");
    expect(publicCoffees).toContain("tags: [TAG_PUBLIC_COFFEES, tagPublicCoffee(slug)]");
    expect(publicCoffees).toContain('.eq("status", PUBLISHED)');
    // Every write path returns the tags it revalidated (the live proof asserts on them).
    expect((catalogue.match(/revalidatedTags: revalidatePublicCatalogue\(/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });
});

describe("T024 + hardening run — catalogue image management through the approved public-assets path only", () => {
  it("upload is real but confined: public-assets bucket, catalogue/{coffeeId}/ paths, RPC-only row writes, no kyb-evidence, no signed URL, no direct file_assets write", async () => {
    const { CATALOGUE_MEDIA_UPLOAD_AVAILABLE, CATALOGUE_MEDIA_MAX_BYTES, CATALOGUE_MEDIA_MAX_COUNT, CATALOGUE_MEDIA_MIME_TYPES } = await import("@/lib/admin/catalogue");
    expect(CATALOGUE_MEDIA_UPLOAD_AVAILABLE).toBe(true);
    expect(CATALOGUE_MEDIA_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(CATALOGUE_MEDIA_MAX_COUNT).toBe(12);
    expect([...CATALOGUE_MEDIA_MIME_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
    for (const file of CATALOGUE_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/createBucket|createSignedUrl|getPublicUrl|"kyb-evidence"/);
      expect(src, file).not.toMatch(/\.from\(\s*"file_assets"\s*\)/);
      // Every Storage call targets the one approved public bucket.
      for (const match of src.matchAll(/storage\.from\(\s*"([^"]+)"\s*\)/g)) expect(match[1], file).toBe("public-assets");
    }
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    expect(catalogue).toMatch(/const objectPath = `catalogue\/\$\{coffeeId\}\//);
    expect(catalogue).toContain('supabase.rpc("attach_coffee_media"');
    expect(catalogue).toContain('supabase.rpc("remove_coffee_media"');
    // A failed DB link removes the just-uploaded object (no orphan).
    expect(catalogue).toMatch(/if \(rpcError[^)]*\)\s*\{\s*await bucket\.remove\(\[objectPath\]\)/);
    // Rows are never inserted/deleted directly — only through the SECURITY DEFINER RPCs.
    const mediaFromCalls = [...catalogue.matchAll(/\.from\("coffee_media"\)([\s\S]{0,160})/g)].map((m) => m[1]);
    expect(mediaFromCalls.length).toBeGreaterThan(0);
    for (const call of mediaFromCalls) expect(call).not.toMatch(/\.(insert|upsert|delete)\(/);
    const panel = source("components", "admin", "catalogue", "coffee-media-panel.tsx");
    expect(panel).toContain('data-media-upload={uploadAvailable ? "available" : "unavailable"}');
    expect(panel).toContain('const ACCEPT = "image/jpeg,image/png,image/webp";');
    expect(panel).not.toMatch(/uploadUnavailable/);
  });

  it("T024 is catalogue media only — no avatar, logo, favicon or platform-branding capability in any RUN E file", () => {
    for (const file of RUN_E_FILES) {
      expect(stripComments(source(file)), file).not.toMatch(/avatar|favicon|platform_logo|logoUrl|branding/i);
    }
  });
});

describe("T025 — the Audit area is read-only BY CONSTRUCTION", () => {
  it("no audit route/component/lib imports a Server Action, a decision/record form, or a mutation hook, and lib/admin/audit.ts performs no write and no RPC", () => {
    expect(AUDIT_FILES.length).toBeGreaterThanOrEqual(5);
    for (const file of AUDIT_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/\/actions"|"use server"|useActionState|useFormStatus|DecisionForm|RecordForm|<form|onSubmit|onClick|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
      expect(src, file).not.toMatch(/@\/lib\/admin\/(decisions|catalogue|warehouse)"/);
    }
    const audit = ADMIN_AREAS.find((a) => a.key === "audit")!;
    expect(audit.roleFunction).toBe("is_auditor");
    expect(audit.availability).toBe("live");
    const page = source("src", "app", "dashboard-admin", "(audit)", "audit", "page.tsx");
    expect(page).toContain('checkAreaAccess("audit")');
    expect(page).toContain("<AuditReadOnlyBanner />");
  });

  it("the audit reads compose only tables the AUDITOR role may SELECT under the approved policy (coffee_offers, listing_status_history, inventory_positions, storage_allocations) plus the audit_logs probe", () => {
    const { rls_policies } = schemaReport();
    const auditorTables = new Set(rls_policies.filter((p) => p.command === "SELECT" && (p.using_expression ?? "").includes("is_auditor()")).map((p) => p.table_name));
    for (const table of ["coffee_offers", "listing_status_history", "inventory_positions", "storage_allocations"]) expect(auditorTables.has(table), table).toBe(true);
    const audit = stripComments(source("lib", "admin", "audit.ts"));
    expect(audit).toMatch(/\.from\("audit_logs"\)/);
    expect(audit).not.toMatch(/\.from\("(kyb_applications|kyb_documents|kyb_reviews|order_shipments|disputes)"\)/);
  });
});

describe("T026 — audit_logs honesty (DB-OPEN-06)", () => {
  it("the approved policy set reads audit_logs through `audit_admin_read` = is_platform_admin() only — no auditor branch", () => {
    const { rls_policies } = schemaReport();
    const policies = rls_policies.filter((p) => p.table_name === "audit_logs");
    expect(policies.map((p) => p.policy_name)).toEqual(["audit_admin_read"]);
    expect(policies[0].using_expression).toBe("is_platform_admin()");
  });

  it("the audit-log panel renders the recorded open item (never a raw error) when the probe is not readable, and real rows read-only when it is", () => {
    render(
      <LocaleProvider>
        <AuditLogPanel probe={{ readable: false, reason: "policy" }} />
      </LocaleProvider>,
    );
    const gap = document.querySelector('[data-capability-gap="db-open-06"]');
    expect(gap).not.toBeNull();
    expect(gap!.textContent).toMatch(/DB-OPEN-06/);
    expect(gap!.textContent).not.toMatch(/permission denied|row-level security|42501|policy "/);
    cleanup();
    render(
      <LocaleProvider>
        <AuditLogPanel probe={{ readable: true, rows: [{ id: 1, actorUserId: null, entityType: "kyb_review_items", entityId: null, action: "INSERT", createdAt: "2026-09-16T00:00:00Z" }] }} />
      </LocaleProvider>,
    );
    expect(document.querySelector("[data-audit-log]")).not.toBeNull();
    expect(screen.getAllByText("kyb_review_items").length).toBeGreaterThan(0);
    expect(document.querySelector("button, form, input, select, textarea")).toBeNull();
  });
});

describe("KYB review coherence — the approval-readiness rule (pure, server-enforced)", () => {
  const app = { registeredAddress: "1 Test Street", businessActivity: "Green coffee import" };
  const doc = (overrides: Partial<KybDocumentSummary>): KybDocumentSummary => ({
    id: overrides.id ?? `d-${overrides.documentType}-${overrides.version ?? 1}`,
    documentType: "TRADE_LICENSE",
    status: "ACCEPTED",
    version: 1,
    supersedesDocumentId: null,
    originalName: null,
    mimeType: null,
    sizeBytes: null,
    expiresAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  });
  const complete = (): KybDocumentSummary[] => [
    doc({ documentType: "TRADE_LICENSE", expiresAt: "2030-01-01" }),
    doc({ documentType: "PROOF_OF_INCORPORATION" }),
    doc({ documentType: "AUTHORIZED_SIGNATORY_ID", expiresAt: "2030-01-01" }),
    doc({ documentType: "UBO_DECLARATION" }),
    doc({ documentType: "BANKING_EVIDENCE" }),
  ];

  it("complete, accepted, current evidence + both application fields → approvable", () => {
    const readiness = evaluateKybApprovalReadiness(app, complete(), new Date("2026-09-16"));
    expect(readiness.approvable).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.counts).toEqual({ required: 5, accepted: 5, awaiting: 0, rejected: 0, expired: 0, missing: 0 });
  });

  it("unreviewed (PENDING) required evidence blocks APPROVED", () => {
    const docs = complete().map((d) => (d.documentType === "UBO_DECLARATION" ? { ...d, status: "PENDING" as const } : d));
    const readiness = evaluateKybApprovalReadiness(app, docs, new Date("2026-09-16"));
    expect(readiness.approvable).toBe(false);
    expect(readiness.blockers).toEqual([{ key: "UBO_DECLARATION", state: "awaiting" }]);
    expect(readiness.counts.awaiting).toBe(1);
  });

  it("rejected required evidence blocks APPROVED", () => {
    const docs = complete().map((d) => (d.documentType === "BANKING_EVIDENCE" ? { ...d, status: "REJECTED" as const } : d));
    const readiness = evaluateKybApprovalReadiness(app, docs, new Date("2026-09-16"));
    expect(readiness.approvable).toBe(false);
    expect(readiness.blockers).toEqual([{ key: "BANKING_EVIDENCE", state: "rejected" }]);
  });

  it("expired required evidence (where expiry applies) blocks APPROVED even when accepted", () => {
    const docs = complete().map((d) => (d.documentType === "TRADE_LICENSE" ? { ...d, expiresAt: "2026-01-01" } : d));
    const readiness = evaluateKybApprovalReadiness(app, docs, new Date("2026-09-16"));
    expect(readiness.approvable).toBe(false);
    expect(readiness.blockers).toEqual([{ key: "TRADE_LICENSE", state: "expired" }]);
  });

  it("missing required evidence blocks APPROVED; a superseded version does not count as current", () => {
    const docs = complete().filter((d) => d.documentType !== "PROOF_OF_INCORPORATION");
    expect(evaluateKybApprovalReadiness(app, docs, new Date("2026-09-16")).blockers).toEqual([{ key: "PROOF_OF_INCORPORATION", state: "missing" }]);
    const superseded = [...docs, doc({ documentType: "PROOF_OF_INCORPORATION", status: "SUPERSEDED", version: 1 })];
    expect(evaluateKybApprovalReadiness(app, superseded, new Date("2026-09-16")).blockers).toEqual([{ key: "PROOF_OF_INCORPORATION", state: "missing" }]);
    // The newest non-superseded version is the reviewable one.
    const replaced = [...superseded, doc({ documentType: "PROOF_OF_INCORPORATION", status: "PENDING", version: 2, supersedesDocumentId: "d-PROOF_OF_INCORPORATION-1" })];
    const readiness = evaluateKybApprovalReadiness(app, replaced, new Date("2026-09-16"));
    expect(readiness.blockers).toEqual([{ key: "PROOF_OF_INCORPORATION", state: "awaiting" }]);
    expect(readiness.required.find((r) => r.documentType === "PROOF_OF_INCORPORATION")!.documentId).toBe("d-PROOF_OF_INCORPORATION-2");
  });

  it("missing application fields block APPROVED as `field` blockers", () => {
    const readiness = evaluateKybApprovalReadiness({ registeredAddress: null, businessActivity: "x" }, complete(), new Date("2026-09-16"));
    expect(readiness.approvable).toBe(false);
    expect(readiness.blockers).toEqual([{ key: "registeredAddress", state: "field" }]);
  });

  it("the server re-reads the rule inside decideKybApplication BEFORE the compare-and-set, only for APPROVED — never a client-only gate", () => {
    const decisions = stripComments(source("lib", "admin", "decisions.ts"));
    const readinessAt = decisions.indexOf("evaluateKybApprovalReadiness(");
    const casAt = decisions.indexOf("const { data: updated, error: updateError } = await supabase");
    expect(readinessAt).toBeGreaterThan(0);
    expect(casAt).toBeGreaterThan(readinessAt);
    expect(decisions).toContain('if (decision === "APPROVED") {');
    expect(decisions).toContain("ACTION_FEEDBACK.KYB_APPROVAL_BLOCKED");
    expect(decisions).toContain("readCurrentDocuments(supabase, applicationId)");
  });
});

describe("KYB review coherence — document-level outcomes through Feature 003's create_kyb_review", () => {
  it("vocabulary is the ledger's own CHECK (ACCEPTED / REJECTED); a rejection requires a reason; the write goes through lib/kyb/review-items (the RPC), never a direct kyb_documents/kyb_review_items write", () => {
    expect([...KYB_DOCUMENT_DECISIONS]).toEqual(["ACCEPTED", "REJECTED"]);
    const base = { applicationId: "f0000000-0000-4000-8000-000000000012", documentId: "f0000000-0000-4000-8000-000000000013" };
    expect(KybDocumentReviewInput.safeParse({ ...base, decision: "REJECTED" }).success).toBe(false);
    expect(KybDocumentReviewInput.safeParse({ ...base, decision: "REJECTED", reason: "Illegible scan; the licence number is not readable." }).success).toBe(true);
    expect(KybDocumentReviewInput.safeParse({ ...base, decision: "ACCEPTED" }).success).toBe(true);
    expect(KybDocumentReviewInput.safeParse({ ...base, decision: "SUPERSEDED" }).success).toBe(false);
    const decisions = stripComments(source("lib", "admin", "decisions.ts"));
    expect(decisions).toContain("createKybReview({ applicationId: parsed.data.applicationId, documentId: parsed.data.documentId, decision: parsed.data.decision, reason: parsed.data.reason })");
    expect(decisions).not.toMatch(/\.from\("kyb_review_items"\)\s*\.(insert|update|delete)|\.from\("kyb_documents"\)\s*\.(insert|update|delete)/);
    expect(decisions).toContain('if (document.status !== "PENDING") return { ok: false, code: ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_STALE };');
    expect([...KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES]).toEqual(["SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED"]);
    const reviewItems = stripComments(source("lib", "kyb", "review-items.ts"));
    expect(reviewItems).toContain('rpc("create_kyb_review"');
  });

  it("the detail page wires the readiness summary, per-document outcome control (PENDING + reviewable application only), lineage, the View action and the blocker hint; the decision panel drops APPROVED while blocked", () => {
    const page = source("src", "app", "dashboard-admin", "(compliance)", "kyb", "[applicationId]", "page.tsx");
    expect(page).toContain("evaluateKybApprovalReadiness(application, documents)");
    expect(page).toContain('data-approval-readiness={readiness.approvable ? "ready" : "blocked"}');
    expect(page).toContain('document.status === "PENDING" && documentsReviewable ? (');
    expect(page).toContain("<KybDocumentReviewPanel applicationId={application.id} documentId={document.id} bytesOpenable={document.fileMetadataReadable} />");
    expect(page).toContain("data-document-replaces={document.supersedesDocumentId}");
    expect(page).toContain("data-document-superseded");
    expect(page).toContain("href={`/dashboard-admin/kyb/${application.id}/documents/${document.id}/file`}");
    expect(page).toContain("data-document-view-unavailable={document.id}");
    expect(page).toContain("readiness={{ approvable: readiness.approvable, blockerCount: readiness.blockers.length }}");
    const panel = source("components", "admin", "compliance", "kyb-decision-panel.tsx");
    expect(panel).toContain('!(decision === "APPROVED" && approvalBlocked)');
    expect(panel).toContain("ACTION_FEEDBACK.KYB_APPROVAL_BLOCKED");
    const actions = source("src", "app", "dashboard-admin", "(compliance)", "kyb", "actions.ts");
    expect(actions).toContain("export async function recordKybDocumentOutcome(");
  });
});

describe("KYB document bytes — the reviewer's file route", () => {
  it("reads under the caller's own session with re-authorization, no service role, no signed/public URL, allowed MIME types only, private no-store, empty 404 on refusal, hardened headers", () => {
    const lib = stripComments(source("lib", "admin", "kyb-documents.ts"));
    expect(lib).toContain('checkRoleFunctionAccess("is_compliance_operator")');
    expect(lib).toContain(".download(file.object_path)");
    expect(lib).not.toMatch(/createSignedUrl|getPublicUrl|SERVICE_ROLE|service_role|unstable_cache/);
    expect(lib).toContain("KYB_EVIDENCE_ALLOWED_MIME_TYPES");
    const route = source("src", "app", "dashboard-admin", "(compliance)", "kyb", "[applicationId]", "documents", "[documentId]", "file", "route.ts");
    expect(route).toContain('export const dynamic = "force-dynamic";');
    expect(route).toContain("new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS })");
    for (const header of ['"Cache-Control": "private, no-store"', '"X-Content-Type-Options": "nosniff"', '"X-Robots-Tag": "noindex, nofollow"', '"Referrer-Policy": "no-referrer"', '"Cross-Origin-Resource-Policy": "same-origin"', "\"Content-Security-Policy\": \"default-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'\""]) {
      expect(route, header).toContain(header);
    }
    expect(stripComments(route)).not.toMatch(/sandbox/);
    expect(route).not.toMatch(/status: 403/);
  });
});
