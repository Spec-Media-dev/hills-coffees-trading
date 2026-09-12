/**
 * Test fixture seed/teardown — Hills Coffee 001-platform-foundation (T028, FR-029a).
 *
 * Governed by specs/001-platform-foundation/contracts/test-fixture-contract.md and research.md §9.
 *
 * ============================================================================
 * SECURITY BOUNDARY — READ BEFORE EDITING
 * ============================================================================
 *
 * This file is the ONLY place in the repository that constructs a Supabase client from
 * `SUPABASE_SERVICE_ROLE_KEY`. That key bypasses RLS entirely.
 *
 * - It MUST NEVER be imported, referenced, or re-exported by anything under `src/`, `src/app/`,
 *   `components/`, or `lib/`. No runtime application path requires privileged access: the
 *   application resolves authorization through the request-scoped, RLS-respecting client in
 *   `lib/supabase/server.ts` and the approved SECURITY DEFINER functions (Constitution
 *   Principle VIII).
 * - This script lives under `scripts/`, outside the Next.js build graph, so it can never be
 *   bundled into a server or client chunk.
 * - Nothing here logs the service-role key, the fixture password, access tokens, refresh tokens,
 *   or any session material. Only non-secret identifiers (labels, emails, row ids) are printed.
 *
 * ============================================================================
 * DATABASE BOUNDARY
 * ============================================================================
 *
 * This script writes ONLY rows — to `profiles`, `organizations`, `kyb_applications`,
 * `organization_members`, `platform_admins`, the public catalogue tables (002), and, since Feature
 * 003 Phase 8/9, `file_assets`/`kyb_documents` (fixed-id, metadata-only rows — no real Storage bytes;
 * see `upsertFixtureKybDocument`'s own doc comment). It never alters schema, RLS, policies,
 * functions, triggers, or Storage. It creates no listing, order, payment, settlement, or dispute
 * data.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   npm run test:seed              # create or reconcile the fixtures (idempotent)
 *   npm run test:seed:teardown     # delete exactly the fixtures this script creates
 *   --set-buyer-and-seller-can-sell=true|false
 *                                  # Phase 9 freshness-test control; exact fixture row only
 *   --set-suspended-organization-status=ACTIVE|SUSPENDED
 *                                  # T031 freshness-test control; the `suspended` fixture only
 *   --reset-complete-draft-application
 *                                  # T032 restore control; resets `completeDraft` back to DRAFT
 *   --verify-inventory-fixtures    # read-only assertion of the exact Feature 005 fixture set
 *   --verify-inventory-append-only # service-role test probe; must be refused by the DB trigger
 *
 * Requires `.env.local` to define NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * TEST_FIXTURE_PASSWORD. Run only against the development Supabase project — never one labelled
 * production.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

class SafeFixtureError extends Error {}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Minimal `.env.local` reader.
 *
 * This script runs outside Next.js, which would otherwise load the file. A dedicated dotenv
 * dependency is deliberately avoided (Constitution dependency discipline) — this parser handles
 * the `KEY=value` / `KEY="value"` forms the environment contract actually uses. Values already
 * present in `process.env` win, so CI can inject them without a file.
 */
function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return; // No file: fall back to whatever the ambient environment provides.
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Reads a required variable, failing with a name-only message (never echoes the value). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Add it to .env.local — see .env.example.`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Fixture definitions — the exact identities in contracts/test-fixture-contract.md
// ---------------------------------------------------------------------------

/**
 * Fixed ids, so both creation and teardown address exactly these rows and nothing else.
 * Deliberately outside any range the application would generate.
 */
const ORGANIZATION_IDS = {
  buyerOnly: "f0000000-0000-4000-8000-000000000001",
  buyerAndSeller: "f0000000-0000-4000-8000-000000000002",
} as const;

const KYB_APPLICATION_IDS = {
  buyerOnly: "f0000000-0000-4000-8000-000000000011",
  buyerAndSeller: "f0000000-0000-4000-8000-000000000012",
} as const;

type FixtureOrganization = {
  id: string;
  kybApplicationId: string;
  legalName: string;
  displayName: string;
  accountType: "BUYER" | "SELLER";
  canBuy: boolean;
  canSell: boolean;
};

type Fixture = {
  label: "buyer-only" | "buyer-and-seller" | "warehouse-admin";
  email: string;
  fullName: string;
  organization: FixtureOrganization | null;
  platformAdminRole: "WAREHOUSE" | null;
};

/**
 * The `+foundation-test` tag makes every fixture address recognisable and keeps teardown exact.
 * `example.com` is RFC 2606 reserved, so these addresses can never reach a real mailbox.
 */
const FIXTURES: readonly Fixture[] = [
  {
    label: "buyer-only",
    email: "buyer-only+foundation-test@example.com",
    fullName: "Foundation Test — Buyer Only",
    organization: {
      id: ORGANIZATION_IDS.buyerOnly,
      kybApplicationId: KYB_APPLICATION_IDS.buyerOnly,
      legalName: "Foundation Test Buyer Only FZE",
      displayName: "Foundation Test — Buyer Only",
      accountType: "BUYER",
      canBuy: true,
      canSell: false,
    },
    platformAdminRole: null,
  },
  {
    label: "buyer-and-seller",
    email: "buyer-and-seller+foundation-test@example.com",
    fullName: "Foundation Test — Buyer And Seller",
    organization: {
      id: ORGANIZATION_IDS.buyerAndSeller,
      kybApplicationId: KYB_APPLICATION_IDS.buyerAndSeller,
      legalName: "Foundation Test Buyer And Seller FZE",
      displayName: "Foundation Test — Buyer And Seller",
      accountType: "SELLER",
      canBuy: true,
      canSell: true,
    },
    platformAdminRole: null,
  },
  {
    label: "warehouse-admin",
    email: "warehouse-admin+foundation-test@example.com",
    // No organization: this fixture proves that an operational role alone never grants the
    // Member Portal, and that Member Portal access is not required for the Operations Console.
    fullName: "Foundation Test — Warehouse Operator",
    organization: null,
    platformAdminRole: "WAREHOUSE",
  },
];

// ---------------------------------------------------------------------------
// Catalogue fixtures — Feature 002 (T006a)
// ---------------------------------------------------------------------------

/**
 * Deterministic public-catalogue rows for Feature 002's runtime checks (status gating, canary
 * leakage, and later metadata/sitemap/JSON-LD/cache assertions).
 *
 * This EXTENDS the fixture architecture above rather than forking it: same script, same privileged
 * boundary, same `npm run test:seed` / `test:seed:teardown` entry points, same discipline of fixed
 * ids, idempotent upsert and exact teardown. There is deliberately no second seed system.
 *
 * WHAT IS CREATED — nothing beyond the approved public catalogue surface:
 *   - one row in each reference table (`UNIQUE (slug)` is the idempotency key);
 *   - one `PUBLISHED` coffee linked to the active origin and to all five reference rows;
 *   - one `DRAFT` and one `ARCHIVED` coffee — the only other values the `coffees` CHECK allows;
 *   - two `ACTIVE` origins (one carrying the published coffee, one deliberately empty so the
 *     zero-coffee empty state can be exercised), plus one `INACTIVE` and one `ARCHIVED` origin —
 *     likewise the only other values the `origins` CHECK allows;
 *   - one certification on the published coffee, with the file reference left NULL.
 *
 * WHAT IS DELIBERATELY NOT CREATED: media rows (their file reference is NOT NULL, so a row would
 * require inventing an asset — forbidden while MEDIA-01 stands; placeholders cover this instead),
 * member listings, lots, member prices, warehouse rows, reference-price rows, inquiry records, and
 * any commission configuration. None of that is needed to prove the public boundary, and creating it
 * would contradict the public DTO contract.
 *
 * `created_by` / `updated_by` are left NULL throughout, so the catalogue introduces no coupling to a
 * profile row and teardown order stays independent of the identity fixtures.
 */
const CATALOGUE_IDS = {
  region: "f0000000-0000-4000-8000-000000000021",
  coffeeType: "f0000000-0000-4000-8000-000000000022",
  variety: "f0000000-0000-4000-8000-000000000023",
  processingMethod: "f0000000-0000-4000-8000-000000000024",
  packagingType: "f0000000-0000-4000-8000-000000000025",
  tag: "f0000000-0000-4000-8000-000000000026",
  originActive: "f0000000-0000-4000-8000-000000000031",
  originInactive: "f0000000-0000-4000-8000-000000000032",
  originArchived: "f0000000-0000-4000-8000-000000000033",
  originActiveEmpty: "f0000000-0000-4000-8000-000000000034",
  coffeePublished: "f0000000-0000-4000-8000-000000000041",
  coffeeDraft: "f0000000-0000-4000-8000-000000000042",
  coffeeArchived: "f0000000-0000-4000-8000-000000000043",
  certification: "f0000000-0000-4000-8000-000000000051",
} as const;

const CATALOGUE_SLUGS = {
  region: "public-test-region",
  coffeeType: "public-test-type",
  variety: "public-test-variety",
  processingMethod: "public-test-process",
  packagingType: "public-test-packaging",
  tag: "public-test-tag",
  originActive: "public-test-origin-active",
  originInactive: "public-test-origin-inactive",
  originArchived: "public-test-origin-archived",
  originActiveEmpty: "public-test-origin-empty",
  coffeePublished: "public-test-coffee-published",
  coffeeDraft: "public-test-coffee-draft",
  coffeeArchived: "public-test-coffee-archived",
} as const;

/**
 * PRIVATE CANARY VALUES.
 *
 * Each sentinel is placed ONLY in a value that must never reach a public surface, so a leakage test
 * can follow the *value* rather than trusting a field *name*:
 *
 *   - the description of every non-public coffee and origin — proves status gating;
 *   - the certification identifier — proves field-level allowlisting of a column RLS *does* expose
 *     but the public DTO contract withholds by default.
 *
 * The owner-organization canary is already provided by the identity fixtures' display names above,
 * so no extra row is created for it.
 *
 * These strings are non-secret test sentinels: they carry no credential, no personal data and no
 * commercial value. They exist to fail loudly if the boundary breaks.
 */
const CATALOGUE_CANARIES = {
  coffeeDraft: "HILLSCANARY-COFFEE-DRAFT-4F1A93C7",
  coffeeArchived: "HILLSCANARY-COFFEE-ARCHIVED-8B2E57D0",
  originInactive: "HILLSCANARY-ORIGIN-INACTIVE-1C6D40AB",
  originArchived: "HILLSCANARY-ORIGIN-ARCHIVED-5E9F82B4",
  certificateNumber: "HILLSCANARY-CERTNUMBER-2A7C63EF",
} as const;

/** Creates or reconciles the catalogue fixtures. Safe to run repeatedly. */
async function seedCatalogue(admin: SupabaseClient): Promise<void> {
  console.log("\nSeeding 002-public-website catalogue fixtures…\n");

  const upsert = async (
    table: string,
    row: Record<string, unknown>
  ): Promise<void> => {
    const { error } = await admin.from(table).upsert(row, { onConflict: "id" });
    if (error) throw new SafeFixtureError(`${table} upsert failed.`);
  };

  // 1. Reference/taxonomy. Each needs only name + slug; the fixed id keeps upsert idempotent.
  await upsert("regions", {
    id: CATALOGUE_IDS.region,
    name: "Public Test Region",
    slug: CATALOGUE_SLUGS.region,
    country_code: "ET",
  });
  await upsert("coffee_types", {
    id: CATALOGUE_IDS.coffeeType,
    name: "Public Test Type",
    slug: CATALOGUE_SLUGS.coffeeType,
  });
  await upsert("coffee_varieties", {
    id: CATALOGUE_IDS.variety,
    coffee_type_id: CATALOGUE_IDS.coffeeType,
    name: "Public Test Variety",
    slug: CATALOGUE_SLUGS.variety,
  });
  await upsert("processing_methods", {
    id: CATALOGUE_IDS.processingMethod,
    name: "Public Test Process",
    slug: CATALOGUE_SLUGS.processingMethod,
  });
  await upsert("packaging_types", {
    id: CATALOGUE_IDS.packagingType,
    name: "Public Test Packaging",
    slug: CATALOGUE_SLUGS.packagingType,
  });
  await upsert("tags", {
    id: CATALOGUE_IDS.tag,
    name: "Public Test Tag",
    slug: CATALOGUE_SLUGS.tag,
  });

  // 2. Origins. One ACTIVE (public) plus the two non-public statuses the CHECK constraint allows,
  //    each carrying its own canary in the description.
  await upsert("origins", {
    id: CATALOGUE_IDS.originActive,
    region_id: CATALOGUE_IDS.region,
    name: "Public Test Origin Active",
    slug: CATALOGUE_SLUGS.originActive,
    country_code: "ET",
    description: "Active public test origin. Safe to publish.",
    status: "ACTIVE",
  });
  await upsert("origins", {
    id: CATALOGUE_IDS.originInactive,
    region_id: CATALOGUE_IDS.region,
    name: "Public Test Origin Inactive",
    slug: CATALOGUE_SLUGS.originInactive,
    country_code: "ET",
    description: CATALOGUE_CANARIES.originInactive,
    status: "INACTIVE",
  });
  await upsert("origins", {
    id: CATALOGUE_IDS.originArchived,
    region_id: CATALOGUE_IDS.region,
    name: "Public Test Origin Archived",
    slug: CATALOGUE_SLUGS.originArchived,
    country_code: "ET",
    description: CATALOGUE_CANARIES.originArchived,
    status: "ARCHIVED",
  });
  // A SECOND ACTIVE origin, deliberately with no coffees linked to it.
  //
  // Added when T016 was implemented: an active origin with zero published coffees must render an
  // honest empty state and still return 200, and the original fixture set could not express that
  // case — its only ACTIVE origin carries the published coffee. Public data, so no canary.
  await upsert("origins", {
    id: CATALOGUE_IDS.originActiveEmpty,
    region_id: CATALOGUE_IDS.region,
    name: "Public Test Origin Without Coffees",
    slug: CATALOGUE_SLUGS.originActiveEmpty,
    country_code: "ET",
    description: "Active public test origin with no published coffees. Safe to publish.",
    status: "ACTIVE",
  });

  // 3. Coffees. The PUBLISHED row is linked to every reference row so the public DTO renders its
  //    full shape; the two non-public rows carry canaries.
  await upsert("coffees", {
    id: CATALOGUE_IDS.coffeePublished,
    origin_id: CATALOGUE_IDS.originActive,
    coffee_type_id: CATALOGUE_IDS.coffeeType,
    variety_id: CATALOGUE_IDS.variety,
    processing_method_id: CATALOGUE_IDS.processingMethod,
    packaging_type_id: CATALOGUE_IDS.packagingType,
    name: "Public Test Coffee Published",
    slug: CATALOGUE_SLUGS.coffeePublished,
    description: "Published public test coffee. Safe to publish.",
    status: "PUBLISHED",
  });
  await upsert("coffees", {
    id: CATALOGUE_IDS.coffeeDraft,
    origin_id: CATALOGUE_IDS.originActive,
    name: "Public Test Coffee Draft",
    slug: CATALOGUE_SLUGS.coffeeDraft,
    description: CATALOGUE_CANARIES.coffeeDraft,
    status: "DRAFT",
  });
  await upsert("coffees", {
    id: CATALOGUE_IDS.coffeeArchived,
    origin_id: CATALOGUE_IDS.originActive,
    name: "Public Test Coffee Archived",
    slug: CATALOGUE_SLUGS.coffeeArchived,
    description: CATALOGUE_CANARIES.coffeeArchived,
    status: "ARCHIVED",
  });

  // 4. One tag link on the published coffee. Composite primary key, so that is the conflict target.
  const { error: linkError } = await admin
    .from("coffee_tags")
    .upsert(
      { coffee_id: CATALOGUE_IDS.coffeePublished, tag_id: CATALOGUE_IDS.tag },
      { onConflict: "coffee_id,tag_id" }
    );
  if (linkError) throw new SafeFixtureError("coffee_tags upsert failed.");

  // 5. Certification on the published coffee. The file reference stays NULL (it is nullable), so no
  //    asset is invented. Its identifier carries a canary because the DTO contract withholds that
  //    column by default even though RLS exposes it.
  await upsert("coffee_certifications", {
    id: CATALOGUE_IDS.certification,
    coffee_id: CATALOGUE_IDS.coffeePublished,
    name: "Public Test Certification",
    certificate_number: CATALOGUE_CANARIES.certificateNumber,
    file_asset_id: null,
    expires_at: "2030-01-01",
  });

  console.log(
    `  published coffee   ${CATALOGUE_SLUGS.coffeePublished}\n` +
      `  non-public coffees ${CATALOGUE_SLUGS.coffeeDraft}, ${CATALOGUE_SLUGS.coffeeArchived}\n` +
      `  active origins     ${CATALOGUE_SLUGS.originActive}, ${CATALOGUE_SLUGS.originActiveEmpty}\n` +
      `  non-public origins ${CATALOGUE_SLUGS.originInactive}, ${CATALOGUE_SLUGS.originArchived}\n` +
      `  reference rows     region, type, variety, process, packaging, tag\n` +
      `  certification      1 (file reference NULL)`
  );
}

/**
 * Deletes exactly the catalogue rows `seedCatalogue()` creates, in foreign-key-safe order.
 *
 * Not deleted, deliberately: the `audit_logs` rows appended by `trg_audit_coffees` when a `coffees`
 * row is inserted or deleted. Those belong to the approved baseline's append-only audit trail, which
 * this script must never remove — the same rule the identity teardown already follows.
 */
async function teardownCatalogue(admin: SupabaseClient): Promise<void> {
  console.log("\nTearing down 002-public-website catalogue fixtures…\n");

  const coffeeIds = [
    CATALOGUE_IDS.coffeePublished,
    CATALOGUE_IDS.coffeeDraft,
    CATALOGUE_IDS.coffeeArchived,
  ];
  const originIds = [
    CATALOGUE_IDS.originActive,
    CATALOGUE_IDS.originInactive,
    CATALOGUE_IDS.originArchived,
    CATALOGUE_IDS.originActiveEmpty,
  ];

  const deleteByIds = async (
    table: string,
    column: string,
    ids: readonly string[]
  ): Promise<void> => {
    const { error } = await admin.from(table).delete().in(column, ids);
    if (error) throw new SafeFixtureError(`${table} delete failed.`);
  };

  // Children first, then the rows they reference.
  await deleteByIds("coffee_certifications", "id", [CATALOGUE_IDS.certification]);
  await deleteByIds("coffee_tags", "coffee_id", coffeeIds);
  await deleteByIds("coffees", "id", coffeeIds);
  await deleteByIds("origins", "id", originIds);
  await deleteByIds("tags", "id", [CATALOGUE_IDS.tag]);
  await deleteByIds("packaging_types", "id", [CATALOGUE_IDS.packagingType]);
  await deleteByIds("processing_methods", "id", [
    CATALOGUE_IDS.processingMethod,
  ]);
  // Varieties reference types, so varieties go first.
  await deleteByIds("coffee_varieties", "id", [CATALOGUE_IDS.variety]);
  await deleteByIds("coffee_types", "id", [CATALOGUE_IDS.coffeeType]);
  await deleteByIds("regions", "id", [CATALOGUE_IDS.region]);

  console.log(
    `  removed ${coffeeIds.length} coffee(s), ${originIds.length} origin(s), ` +
      `1 certification, 1 tag link and 6 reference row(s).`
  );
}

// ---------------------------------------------------------------------------
// Phase 8 (003 T029) — authorization/state-variant fixtures
// ---------------------------------------------------------------------------

/**
 * Every id below is fixed (same discipline as `ORGANIZATION_IDS`/`KYB_APPLICATION_IDS` above), in a
 * distinct numeric range (0x61+) so it can never collide with the 001/002 fixture ids already in use.
 *
 * These EXTEND the existing fixture architecture — same script, same privileged boundary, same
 * `npm run test:seed` / `test:seed:teardown` entry points — rather than forking a second seed system.
 * Each organization exists ONLY because a specific T029/Phase 9 requirement names it; none is
 * speculative ("do not invent unnecessary product states").
 */
const PHASE89_ORGANIZATION_IDS = {
  pendingKyb: "f0000000-0000-4000-8000-000000000061",
  completeDraft: "f0000000-0000-4000-8000-000000000062",
  underReview: "f0000000-0000-4000-8000-000000000063",
  suspended: "f0000000-0000-4000-8000-000000000064",
  blockedMember: "f0000000-0000-4000-8000-000000000065",
  mfaMember: "f0000000-0000-4000-8000-000000000066",
  multiOrgA: "f0000000-0000-4000-8000-000000000067",
  multiOrgB: "f0000000-0000-4000-8000-000000000068",
} as const;

const PHASE89_KYB_APPLICATION_IDS = {
  pendingKyb: "f0000000-0000-4000-8000-000000000071",
  completeDraft: "f0000000-0000-4000-8000-000000000072",
  underReview: "f0000000-0000-4000-8000-000000000073",
  suspended: "f0000000-0000-4000-8000-000000000074",
  blockedMember: "f0000000-0000-4000-8000-000000000075",
  mfaMember: "f0000000-0000-4000-8000-000000000076",
  multiOrgA: "f0000000-0000-4000-8000-000000000077",
  multiOrgB: "f0000000-0000-4000-8000-000000000078",
} as const;

/**
 * `completeDraft`'s 5 required documents (T032 "complete valid DRAFT → SUBMITTED"). Written directly
 * (service-role), bypassing `attach_kyb_document`'s real-Storage-object check — this fixture proves
 * the METADATA-level completeness/transition contract (`checkKybCompleteness`, `submit_kyb_application`),
 * not the upload path itself (already covered live by RUN B and the KYB-upload-transport fix).
 * `file_assets`/`kyb_documents` ids are fixed for the same idempotency reason every other fixture id
 * is: without a fixed id + upsert target, re-running the seed would insert 5 MORE rows every time.
 */
const COMPLETE_DRAFT_DOCUMENT_IDS: Record<
  "TRADE_LICENSE" | "PROOF_OF_INCORPORATION" | "AUTHORIZED_SIGNATORY_ID" | "UBO_DECLARATION" | "BANKING_EVIDENCE",
  { fileAssetId: string; documentId: string }
> = {
  TRADE_LICENSE: { fileAssetId: "f0000000-0000-4000-8000-000000000081", documentId: "f0000000-0000-4000-8000-000000000091" },
  PROOF_OF_INCORPORATION: { fileAssetId: "f0000000-0000-4000-8000-000000000082", documentId: "f0000000-0000-4000-8000-000000000092" },
  AUTHORIZED_SIGNATORY_ID: { fileAssetId: "f0000000-0000-4000-8000-000000000083", documentId: "f0000000-0000-4000-8000-000000000093" },
  UBO_DECLARATION: { fileAssetId: "f0000000-0000-4000-8000-000000000084", documentId: "f0000000-0000-4000-8000-000000000094" },
  BANKING_EVIDENCE: { fileAssetId: "f0000000-0000-4000-8000-000000000085", documentId: "f0000000-0000-4000-8000-000000000095" },
};

/**
 * One supporting document per ALREADY-approved org (`buyerOnly`/`buyerAndSeller`) — minimum data
 * T030's cross-organization isolation test needs to prove `kyb_documents` (via its `file_assets`
 * join) is tenant-scoped, on top of the existing `kyb_applications` rows those fixtures already have.
 */
const CROSS_ORG_ISOLATION_DOCUMENT_IDS = {
  buyerOnly: { fileAssetId: "f0000000-0000-4000-8000-000000000096", documentId: "f0000000-0000-4000-8000-000000000098" },
  buyerAndSeller: { fileAssetId: "f0000000-0000-4000-8000-000000000097", documentId: "f0000000-0000-4000-8000-000000000099" },
} as const;

type Phase89Organization = {
  id: string;
  kybApplicationId: string;
  legalName: string;
  displayName: string;
  organizationStatus: "PENDING_KYB" | "UNDER_REVIEW" | "ACTIVE" | "SUSPENDED";
  kybStatus: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED";
  canBuy: boolean;
  canSell: boolean;
  registeredAddress: string | null;
  businessActivity: string | null;
};

type Phase89Fixture = {
  label: string;
  email: string;
  fullName: string;
  isBlocked: boolean;
  organizations: readonly Phase89Organization[];
};

const PHASE89_FIXTURES: readonly Phase89Fixture[] = [
  {
    label: "pending-kyb",
    email: "pending-kyb+foundation-test@example.com",
    fullName: "Foundation Test — Pending KYB",
    isBlocked: false,
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.pendingKyb,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.pendingKyb,
        legalName: "Foundation Test Pending KYB FZE",
        displayName: "Foundation Test — Pending KYB",
        organizationStatus: "PENDING_KYB",
        kybStatus: "DRAFT",
        canBuy: true,
        canSell: false,
        // Deliberately incomplete — T032's "incomplete DRAFT submission blocked" fixture.
        registeredAddress: null,
        businessActivity: null,
      },
    ],
  },
  {
    label: "complete-draft",
    email: "complete-draft+foundation-test@example.com",
    fullName: "Foundation Test — Complete Draft",
    isBlocked: false,
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.completeDraft,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.completeDraft,
        legalName: "Foundation Test Complete Draft FZE",
        displayName: "Foundation Test — Complete Draft",
        organizationStatus: "PENDING_KYB",
        kybStatus: "DRAFT",
        canBuy: true,
        canSell: false,
        // Complete — T032's "complete valid DRAFT → SUBMITTED" fixture. Resettable to DRAFT via
        // `--reset-complete-draft-application` after a test transitions it to SUBMITTED.
        registeredAddress: "Foundation Test Free Zone, Building 9, Dubai, UAE",
        businessActivity: "Green coffee import and wholesale distribution.",
      },
    ],
  },
  {
    label: "under-review",
    email: "under-review+foundation-test@example.com",
    fullName: "Foundation Test — Under Review",
    isBlocked: false,
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.underReview,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.underReview,
        legalName: "Foundation Test Under Review FZE",
        displayName: "Foundation Test — Under Review",
        organizationStatus: "UNDER_REVIEW",
        kybStatus: "UNDER_REVIEW",
        canBuy: true,
        canSell: false,
        registeredAddress: "Foundation Test Free Zone, Building 4, Dubai, UAE",
        businessActivity: "Green coffee import.",
      },
    ],
  },
  {
    label: "suspended",
    email: "suspended+foundation-test@example.com",
    fullName: "Foundation Test — Suspended",
    isBlocked: false,
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.suspended,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.suspended,
        legalName: "Foundation Test Suspended FZE",
        displayName: "Foundation Test — Suspended",
        // Previously approved, now suspended — T031's freshness-toggle fixture
        // (`--set-suspended-organization-status=`).
        organizationStatus: "SUSPENDED",
        kybStatus: "APPROVED",
        canBuy: true,
        canSell: false,
        registeredAddress: "Foundation Test Free Zone, Building 7, Dubai, UAE",
        businessActivity: "Green coffee import.",
      },
    ],
  },
  {
    label: "blocked-member",
    email: "blocked-member+foundation-test@example.com",
    fullName: "Foundation Test — Blocked Member",
    // Otherwise-fully-approved organization, BUT the user is blocked — proves blocking overrides an
    // already-approved organization, not merely an additional restriction on a pending one.
    isBlocked: true,
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.blockedMember,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.blockedMember,
        legalName: "Foundation Test Blocked Member FZE",
        displayName: "Foundation Test — Blocked Member",
        organizationStatus: "ACTIVE",
        kybStatus: "APPROVED",
        canBuy: true,
        canSell: false,
        registeredAddress: "Foundation Test Free Zone, Building 2, Dubai, UAE",
        businessActivity: "Green coffee import.",
      },
    ],
  },
  {
    label: "mfa-member",
    email: "mfa-member+foundation-test@example.com",
    fullName: "Foundation Test — MFA Member",
    isBlocked: false,
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.mfaMember,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.mfaMember,
        legalName: "Foundation Test MFA Member FZE",
        displayName: "Foundation Test — MFA Member",
        organizationStatus: "ACTIVE",
        kybStatus: "APPROVED",
        canBuy: true,
        canSell: false,
        registeredAddress: "Foundation Test Free Zone, Building 3, Dubai, UAE",
        businessActivity: "Green coffee import.",
      },
    ],
  },
  {
    label: "multi-org",
    email: "multi-org+foundation-test@example.com",
    fullName: "Foundation Test — Multi Org",
    isBlocked: false,
    // Two ACTIVE + APPROVED organizations for the SAME user — T028/T002 multi-org acting-organization
    // proof ("never organizations[0]", explicit selection required, fresh switch resolution).
    organizations: [
      {
        id: PHASE89_ORGANIZATION_IDS.multiOrgA,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.multiOrgA,
        legalName: "Foundation Test Multi Org A FZE",
        displayName: "Foundation Test — Multi Org A",
        organizationStatus: "ACTIVE",
        kybStatus: "APPROVED",
        canBuy: true,
        canSell: false,
        registeredAddress: "Foundation Test Free Zone, Building 5, Dubai, UAE",
        businessActivity: "Green coffee import.",
      },
      {
        id: PHASE89_ORGANIZATION_IDS.multiOrgB,
        kybApplicationId: PHASE89_KYB_APPLICATION_IDS.multiOrgB,
        legalName: "Foundation Test Multi Org B FZE",
        displayName: "Foundation Test — Multi Org B",
        organizationStatus: "ACTIVE",
        kybStatus: "APPROVED",
        canBuy: true,
        canSell: true,
        registeredAddress: "Foundation Test Free Zone, Building 6, Dubai, UAE",
        businessActivity: "Green coffee import and resale.",
      },
    ],
  },
  {
    // T029 variant 5 — authenticated user with NO organization at all.
    label: "no-organization",
    email: "no-organization+foundation-test@example.com",
    fullName: "Foundation Test — No Organization",
    isBlocked: false,
    organizations: [],
  },
];

async function seedPhase89(admin: SupabaseClient, password: string): Promise<void> {
  console.log("\nSeeding 003-auth-membership-kyb Phase 8/9 fixtures…\n");

  for (const fixture of PHASE89_FIXTURES) {
    const { userId, created } = await ensureAuthUser(admin, fixture.email, password);

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: fixture.fullName,
        company_name: fixture.organizations[0]?.displayName ?? null,
        is_blocked: fixture.isBlocked,
      },
      { onConflict: "id" }
    );
    if (profileError) throw new SafeFixtureError("profiles upsert failed (Phase 8/9).");

    for (const org of fixture.organizations) {
      const { error: orgError } = await admin.from("organizations").upsert(
        {
          id: org.id,
          legal_name: org.legalName,
          display_name: org.displayName,
          account_type: org.canSell ? "SELLER" : "BUYER",
          status: org.organizationStatus,
          is_hills_internal: false,
          can_buy: org.canBuy,
          can_sell: org.canSell,
        },
        { onConflict: "id" }
      );
      if (orgError) throw new SafeFixtureError("organizations upsert failed (Phase 8/9).");

      const submittedAt = org.kybStatus === "DRAFT" ? null : new Date(0).toISOString();
      const decidedAt = org.kybStatus === "APPROVED" ? new Date(0).toISOString() : null;
      const { error: kybError } = await admin.from("kyb_applications").upsert(
        {
          id: org.kybApplicationId,
          organization_id: org.id,
          submitted_by: userId,
          status: org.kybStatus,
          registered_address: org.registeredAddress,
          business_activity: org.businessActivity,
          submitted_at: submittedAt,
          decided_at: decidedAt,
        },
        { onConflict: "id" }
      );
      if (kybError) throw new SafeFixtureError("kyb_applications upsert failed (Phase 8/9).");

      const { error: memberError } = await admin.from("organization_members").upsert(
        { organization_id: org.id, user_id: userId, member_role: "OWNER", is_active: true },
        { onConflict: "organization_id,user_id" }
      );
      if (memberError) throw new SafeFixtureError("organization_members upsert failed (Phase 8/9).");
    }

    console.log(`  ${created ? "created" : "reused "}  ${fixture.label.padEnd(17)} ${fixture.email}`);
  }

  // `completeDraft`'s 5 required documents — metadata only (no real Storage object behind them; see
  // the constant's own doc comment for why that is safe for this fixture's purpose).
  for (const [documentType, ids] of Object.entries(COMPLETE_DRAFT_DOCUMENT_IDS)) {
    await upsertFixtureKybDocument(admin, {
      fileAssetId: ids.fileAssetId,
      documentId: ids.documentId,
      organizationId: PHASE89_ORGANIZATION_IDS.completeDraft,
      applicationId: PHASE89_KYB_APPLICATION_IDS.completeDraft,
      documentType,
      status: "ACCEPTED",
    });
  }

  // One supporting document each for the pre-existing approved 001 fixtures, so T030 can prove
  // `kyb_documents` isolation on top of the `kyb_applications` isolation those fixtures already allow.
  await upsertFixtureKybDocument(admin, {
    fileAssetId: CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerOnly.fileAssetId,
    documentId: CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerOnly.documentId,
    organizationId: ORGANIZATION_IDS.buyerOnly,
    applicationId: KYB_APPLICATION_IDS.buyerOnly,
    documentType: "TRADE_LICENSE",
    status: "ACCEPTED",
  });
  await upsertFixtureKybDocument(admin, {
    fileAssetId: CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerAndSeller.fileAssetId,
    documentId: CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerAndSeller.documentId,
    organizationId: ORGANIZATION_IDS.buyerAndSeller,
    applicationId: KYB_APPLICATION_IDS.buyerAndSeller,
    documentType: "TRADE_LICENSE",
    status: "ACCEPTED",
  });

  console.log(
    `\n  ${PHASE89_FIXTURES.length} Phase 8/9 identities, ` +
      `${PHASE89_FIXTURES.reduce((n, f) => n + f.organizations.length, 0)} organizations, ` +
      `${Object.keys(COMPLETE_DRAFT_DOCUMENT_IDS).length + 2} supporting kyb_documents.`
  );
}

async function upsertFixtureKybDocument(
  admin: SupabaseClient,
  input: {
    fileAssetId: string;
    documentId: string;
    organizationId: string;
    applicationId: string;
    documentType: string;
    status: "PENDING" | "ACCEPTED" | "REJECTED";
  }
): Promise<void> {
  const { error: fileAssetError } = await admin.from("file_assets").upsert(
    {
      id: input.fileAssetId,
      organization_id: input.organizationId,
      bucket_name: "kyb-evidence",
      object_path: `org/${input.organizationId}/application/${input.applicationId}/${input.documentType.toLowerCase()}-fixture.pdf`,
      original_name: `${input.documentType.toLowerCase()}-fixture.pdf`,
      mime_type: "application/pdf",
      size_bytes: 1024,
      is_private: true,
    },
    { onConflict: "id" }
  );
  if (fileAssetError) throw new SafeFixtureError("file_assets upsert failed (Phase 8/9).");

  const { error: documentError } = await admin.from("kyb_documents").upsert(
    {
      id: input.documentId,
      application_id: input.applicationId,
      document_type: input.documentType,
      file_asset_id: input.fileAssetId,
      version: 1,
      status: input.status,
    },
    { onConflict: "id" }
  );
  if (documentError) throw new SafeFixtureError("kyb_documents upsert failed (Phase 8/9).");
}

/**
 * Deletes exactly the Phase 8/9 rows `seedPhase89()` creates, in foreign-key-safe order.
 *
 * NOT DELETED, DELIBERATELY: `audit_logs`/`account_status_history` rows the database's own triggers
 * append (same append-only-audit rule the 001 teardown already follows), and `agreement_acceptances`
 * rows any Phase 9 test live-inserted for these fixtures — `authenticated` holds no DELETE grant on
 * that table (by design; see `lib/agreements/acceptance-status.ts`), and this script never uses its
 * service-role connection to bypass that for evidence rows. When either kind of real evidence still
 * points at an organization or profile, that row is RETAINED rather than force-deleted — see
 * `deleteOrganizationsRetainingAuditEvidence`/`deleteAuthUsersRetainingAuditEvidence`, and this
 * function's own logged summary for exactly which fixtures that affected on a given run. Retained
 * rows are documented SYNTHETIC AUDIT PRINCIPALS: real evidence-shaped rows tagged only by belonging
 * to an obviously-synthetic `+foundation-test@example.com` organization/user, never colliding with
 * real data, and consistent with "do not delete immutable audit history just to make teardown clean."
 */
async function teardownPhase89(admin: SupabaseClient): Promise<void> {
  console.log("\nTearing down 003-auth-membership-kyb Phase 8/9 fixtures…\n");

  const userIdByFixtureLabel = new Map<string, string>();
  const userIds: string[] = [];
  for (const fixture of PHASE89_FIXTURES) {
    const userId = await findAuthUserIdByEmail(admin, fixture.email);
    if (userId !== null) {
      userIds.push(userId);
      userIdByFixtureLabel.set(fixture.label, userId);
    }
  }

  const organizationIds = Object.values(PHASE89_ORGANIZATION_IDS);
  const kybApplicationIds = Object.values(PHASE89_KYB_APPLICATION_IDS);
  const documentIds = [
    ...Object.values(COMPLETE_DRAFT_DOCUMENT_IDS).map((d) => d.documentId),
    CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerOnly.documentId,
    CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerAndSeller.documentId,
  ];
  const fileAssetIds = [
    ...Object.values(COMPLETE_DRAFT_DOCUMENT_IDS).map((d) => d.fileAssetId),
    CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerOnly.fileAssetId,
    CROSS_ORG_ISOLATION_DOCUMENT_IDS.buyerAndSeller.fileAssetId,
  ];

  const deleteByIds = async (table: string, column: string, ids: readonly string[]): Promise<void> => {
    if (ids.length === 0) return;
    const { error } = await admin.from(table).delete().in(column, ids);
    if (error) throw new SafeFixtureError(`${table} delete failed (Phase 8/9).`);
  };

  await deleteByIds("kyb_documents", "id", documentIds);
  await deleteByIds("file_assets", "id", fileAssetIds);

  if (userIds.length > 0) {
    const { error } = await admin.from("platform_admins").delete().in("user_id", userIds);
    if (error) throw new SafeFixtureError("platform_admins delete failed (Phase 8/9).");
  }

  await deleteByIds("organization_members", "organization_id", organizationIds);
  await deleteByIds("kyb_applications", "id", kybApplicationIds);

  const { deleted: deletedOrganizations, retained: retainedOrganizations } =
    await deleteOrganizationsRetainingAuditEvidence(admin, organizationIds);

  // A user whose organization is retained (real agreement_acceptances evidence) is attempted anyway
  // below — `deleteAuthUsersRetainingAuditEvidence` treats any failure (that FK included, plus e.g. a
  // real audit_logs.actor_user_id row from a live test's authenticated RPC call) as retained.
  const { deleted: deletedUsers, retained: retainedUserIds } = await deleteAuthUsersRetainingAuditEvidence(
    admin,
    userIds
  );
  const retainedUserIdSet = new Set(retainedUserIds);
  const retainedUserLabels = PHASE89_FIXTURES.filter((fixture) => {
    const userId = userIdByFixtureLabel.get(fixture.label);
    return userId !== undefined && retainedUserIdSet.has(userId);
  }).map((fixture) => fixture.label);

  if (retainedOrganizations.length > 0 || retainedUserIds.length > 0) {
    console.log(
      `  RETAINED (documented, not a failure): ${retainedUserLabels.join(", ") || "(no fixture user, org only)"} — ` +
        `organization(s) [${retainedOrganizations.join(", ") || "none"}], user(s) [${retainedUserIds.join(", ") || "none"}] — ` +
        `still referenced by real audit evidence (agreement_acceptances and/or audit_logs) a live ` +
        `test produced. No DELETE grant/privilege bypass is used to force this through.`
    );
  }

  console.log(
    `  removed ${deletedUsers.length} auth user(s) + profile(s), ${deletedOrganizations.length} organization(s), ` +
      `${kybApplicationIds.length} kyb application(s), ${documentIds.length} kyb_documents row(s).`
  );
}

/**
 * T031 freshness-proof control: flips ONLY the `suspended` fixture's organization between ACTIVE and
 * SUSPENDED. Scoped to that one fixed organization id — never an arbitrary caller-supplied id — the
 * same narrow-control precedent `setBuyerAndSellerCanSell` already established.
 */
async function setSuspendedOrganizationStatus(admin: SupabaseClient, status: "ACTIVE" | "SUSPENDED"): Promise<void> {
  const { data, error } = await admin
    .from("organizations")
    .update({ status })
    .eq("id", PHASE89_ORGANIZATION_IDS.suspended)
    .select("id")
    .maybeSingle();

  if (error) throw new SafeFixtureError("fixture organization status update failed.");
  if (!data) throw new Error("suspended fixture is missing; run npm run test:seed first");
}

/**
 * T032 restore control: resets `completeDraft`'s application back to `DRAFT` (undoing a test's own
 * `DRAFT -> SUBMITTED` transition) so the fixture is reusable across runs. `authenticated` has no
 * direct UPDATE grant on `kyb_applications` (every mutation is RPC-mediated), so only this privileged
 * script can restore it — the same reason `setBuyerAndSellerCanSell` exists for its own column.
 */
async function resetCompleteDraftApplication(admin: SupabaseClient): Promise<void> {
  // `submitted_by` is NOT NULL (`kyb_applications` schema) — it is the fixture owner both before and
  // after submission (`create_kyb_draft` sets it at DRAFT creation, `transition_kyb_application`
  // re-asserts it at SUBMITTED), so only `status`/`submitted_at` need resetting here.
  const { data, error } = await admin
    .from("kyb_applications")
    .update({ status: "DRAFT", submitted_at: null })
    .eq("id", PHASE89_KYB_APPLICATION_IDS.completeDraft)
    .select("id")
    .maybeSingle();

  if (error) throw new SafeFixtureError("fixture application reset failed.");
  if (!data) throw new Error("complete-draft fixture is missing; run npm run test:seed first");
}

// ---------------------------------------------------------------------------
// Feature 005 Phase 5 (T016–T019) — inventory/custody/ownership fixtures
// ---------------------------------------------------------------------------

/**
 * EXTENDS the existing fixture architecture (same script, same privileged boundary, same
 * `npm run test:seed` / `test:seed:teardown` entry points) rather than a second framework, per the
 * run directive. Reuses the ALREADY-APPROVED identity fixtures as the two organizations under test —
 * `buyerOnly` (Org A) and `buyerAndSeller` (Org B) from `ORGANIZATION_IDS` above, plus Phase 8/9's
 * `underReview` (Org C) as the unrelated third party for the ownership-ledger negative case — rather
 * than inventing new member identities.
 *
 * One synthetic HILLS-internal organization is added ONLY because `coffee_offers`' own
 * `validate_offer_transition` trigger requires a `seller_type = 'HILLS'` listing's seller to be a
 * real `is_hills_internal = true, status = 'ACTIVE'` organization (confirmed live during the Feature
 * 005 reconciliation's DB-OPEN-12 proof) — the same technique that proof already used, made
 * persistent and idempotent here instead of a throwaway scratch script.
 *
 * Fixed ids in their own `05000000-...` range (Feature 005), never colliding with the 001/002/003
 * ranges already in use. DISTINCTIVE, NON-ROUND quantities (T017): chosen so that no fixture value's
 * sum or difference with another coincides with any other fixture value in this set — an agent that
 * accidentally reintroduces `available - reserved` or `available + reserved` arithmetic produces a
 * value that provably does not match any genuine fixture number.
 */
const INVENTORY_FIXTURE_IDS = {
  hillsOrg: "05000000-0000-4000-8000-000000000001",
  coffee: "05000000-0000-4000-8000-000000000014",
  warehouse: "05000000-0000-4000-8000-000000000002",
  lotA: "05000000-0000-4000-8000-000000000003",
  lotB: "05000000-0000-4000-8000-000000000004",
  offerA: "05000000-0000-4000-8000-000000000005",
  offerB: "05000000-0000-4000-8000-000000000006",
  hillsPositionA: "05000000-0000-4000-8000-000000000007",
  hillsPositionB: "05000000-0000-4000-8000-000000000008",
  positionA: "05000000-0000-4000-8000-000000000009",
  positionB: "05000000-0000-4000-8000-00000000000a",
  multiOrgPositionA: "05000000-0000-4000-8000-000000000015",
  multiOrgPositionB: "05000000-0000-4000-8000-000000000016",
  orderA: "05000000-0000-4000-8000-00000000000b",
  orderB: "05000000-0000-4000-8000-00000000000c",
  orderItemA: "05000000-0000-4000-8000-00000000000d",
  orderItemB: "05000000-0000-4000-8000-00000000000e",
  allocationA: "05000000-0000-4000-8000-00000000000f",
  allocationB: "05000000-0000-4000-8000-000000000010",
  eventAToOrgAIncoming: "05000000-0000-4000-8000-000000000011",
  eventAToB: "05000000-0000-4000-8000-000000000012",
  eventBToC: "05000000-0000-4000-8000-000000000013",
} as const;

/**
 * A DEDICATED synthetic `coffees` row, deliberately NOT the catalogue's shared `coffeePublished` — an
 * earlier version of this fixture reused that row and it broke `teardownCatalogue()`'s own delete
 * (confirmed empirically: `coffees delete failed` once the two lots below, retained as append-only
 * ledger evidence, still held a foreign key to it). Owning a private `coffees` row here decouples
 * Feature 005's retained evidence from Feature 002's catalogue lifecycle entirely.
 */
const INVENTORY_FIXTURE_COFFEE_ID = INVENTORY_FIXTURE_IDS.coffee;

const INVENTORY_FIXTURE_QUANTITIES = {
  // Org A's position: an intentionally odd, non-round pair — see this section's own header comment.
  positionAAvailable: 743.271,
  positionAReserved: 88.654,
  // Org B's position: a different odd, non-round pair.
  positionBAvailable: 512.938,
  positionBReserved: 41.276,
  // One real user belongs to both Phase 8/9 multi-org fixtures; these rows make the acting-org
  // proof positive on both contexts instead of confusing two single-org sessions for one user.
  multiOrgPositionAAvailable: 91.123,
  multiOrgPositionAReserved: 17.456,
  multiOrgPositionBAvailable: 64.789,
  multiOrgPositionBReserved: 9.321,
  // Org A's storage allocation.
  allocationAQuantity: 317.409,
  allocationAReleased: 52.183,
  // Org B's storage allocation.
  allocationBQuantity: 201.517,
  allocationBReleased: 19.842,
} as const;

async function seedInventoryFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nSeeding 005-inventory-custody-storage Phase 5 fixtures…\n");

  const buyerOnlyUserId = await findAuthUserIdByEmail(admin, FIXTURES[0]!.email);
  const buyerAndSellerUserId = await findAuthUserIdByEmail(admin, FIXTURES[1]!.email);
  if (!buyerOnlyUserId || !buyerAndSellerUserId) {
    throw new SafeFixtureError("001 identity fixtures are missing; run npm run test:seed first.");
  }

  const upsert = async (table: string, row: Record<string, unknown>, onConflict = "id"): Promise<void> => {
    const { error } = await admin.from(table).upsert(row, { onConflict });
    if (error) throw new SafeFixtureError(`${table} upsert failed (Feature 005 Phase 5): ${error.message}`);
  };

  /**
   * `inventory_ownership_events` is append-only at the database level (`prevent_ownership_event_mutation`
   * fires unconditionally on UPDATE, for every role) — an `upsert()`'s `ON CONFLICT DO UPDATE` path
   * would hit that trigger and fail on any re-run once the row already exists. Insert-if-absent keeps
   * this seed idempotent without ever attempting the disallowed update.
   */
  const insertIfAbsent = async (table: string, row: Record<string, unknown> & { id: string }): Promise<void> => {
    const { data: existing, error: selectError } = await admin.from(table).select("id").eq("id", row.id).maybeSingle();
    if (selectError) throw new SafeFixtureError(`${table} existence check failed (Feature 005 Phase 5): ${selectError.message}`);
    if (existing) return;

    const { error: insertError } = await admin.from(table).insert(row);
    if (insertError) throw new SafeFixtureError(`${table} insert failed (Feature 005 Phase 5): ${insertError.message}`);
  };

  await upsert("organizations", {
    id: INVENTORY_FIXTURE_IDS.hillsOrg,
    legal_name: "Feature 005 Fixture — Hills Internal FZE",
    display_name: "Feature 005 Fixture — Hills Internal",
    account_type: "HILLS_INTERNAL",
    status: "ACTIVE",
    is_hills_internal: true,
    can_buy: true,
    can_sell: true,
  });

  // This is an exact synthetic system organization, never an acting organization for a real user.
  // Clear only its fixed-id memberships on every idempotent seed so historical fixture residue
  // cannot accidentally grant its internal capabilities to any authenticated identity.
  const { error: hillsMembershipCleanupError } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", INVENTORY_FIXTURE_IDS.hillsOrg);
  if (hillsMembershipCleanupError) {
    throw new SafeFixtureError("Feature 005 Hills-internal membership cleanup failed.");
  }

  await upsert("warehouses", {
    id: INVENTORY_FIXTURE_IDS.warehouse,
    owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    code: "F005-WH",
    name: "Feature 005 Fixture Warehouse",
    is_active: true,
  });

  // Own, dedicated coffee row — see `INVENTORY_FIXTURE_COFFEE_ID`'s own comment for why this is
  // never the shared catalogue `coffeePublished` row. Deliberately `DRAFT`: `PUBLISHED` would make
  // this synthetic row appear on the real public catalogue (`public_read_coffees`'s own RLS is
  // `status = 'PUBLISHED'`), which nothing in this fixture's actual purpose requires — no Feature 005
  // function conditions on the coffee's own status.
  await upsert("coffees", {
    id: INVENTORY_FIXTURE_IDS.coffee,
    name: "Feature 005 Fixture Coffee",
    slug: "feature-005-fixture-coffee",
    status: "DRAFT",
  });

  await upsert("coffee_lots", {
    id: INVENTORY_FIXTURE_IDS.lotA,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_code: "F005-LOT-A",
    total_quantity_kg: 1000,
    status: "AVAILABLE",
    source_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
  });
  await upsert("coffee_lots", {
    id: INVENTORY_FIXTURE_IDS.lotB,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_code: "F005-LOT-B",
    total_quantity_kg: 1000,
    status: "AVAILABLE",
    source_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
  });

  // Hills' own backing position for each lot — required by `validate_offer_transition`'s own
  // inventory check before it will accept a `seller_type = 'HILLS'` listing.
  await upsert("inventory_positions", {
    id: INVENTORY_FIXTURE_IDS.hillsPositionA,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: 1000,
    reserved_quantity_kg: 0,
  });
  await upsert("inventory_positions", {
    id: INVENTORY_FIXTURE_IDS.hillsPositionB,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: 1000,
    reserved_quantity_kg: 0,
  });

  // These support only the fixture order-item chain. Keep them non-public too: their transition
  // validator permits an existing PUBLISHED fixture to remain PUBLISHED but forbids a backwards
  // PUBLISHED → DRAFT transition, so `is_visible: false` is the stable idempotent guard.
  await upsert("coffee_offers", {
    id: INVENTORY_FIXTURE_IDS.offerA,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    seller_type: "HILLS",
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    quantity_kg: 1000,
    price_per_kg: 5,
    status: "PUBLISHED",
    is_visible: false,
    created_by: buyerOnlyUserId,
  });
  await upsert("coffee_offers", {
    id: INVENTORY_FIXTURE_IDS.offerB,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    seller_type: "HILLS",
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    quantity_kg: 1000,
    price_per_kg: 5,
    status: "PUBLISHED",
    is_visible: false,
    created_by: buyerAndSellerUserId,
  });

  // Org A's and Org B's OWN positions — the rows T016/T017's isolation/fidelity proofs actually read.
  await upsert("inventory_positions", {
    id: INVENTORY_FIXTURE_IDS.positionA,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    owner_organization_id: ORGANIZATION_IDS.buyerOnly,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.positionAAvailable,
    reserved_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.positionAReserved,
  });
  await upsert("inventory_positions", {
    id: INVENTORY_FIXTURE_IDS.positionB,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    owner_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.positionBAvailable,
    reserved_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.positionBReserved,
  });
  await upsert("inventory_positions", {
    id: INVENTORY_FIXTURE_IDS.multiOrgPositionA,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    owner_organization_id: PHASE89_ORGANIZATION_IDS.multiOrgA,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.multiOrgPositionAAvailable,
    reserved_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.multiOrgPositionAReserved,
  });
  await upsert("inventory_positions", {
    id: INVENTORY_FIXTURE_IDS.multiOrgPositionB,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    owner_organization_id: PHASE89_ORGANIZATION_IDS.multiOrgB,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.multiOrgPositionBAvailable,
    reserved_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.multiOrgPositionBReserved,
  });

  // Orders left at DRAFT deliberately — `can_view_order`/`order_items_view`/`orders_view` do not
  // condition on order status, only org membership (confirmed live during the T010 reconciliation
  // proof), so DRAFT avoids the multi-step status-transition trigger chain entirely.
  await upsert("orders", {
    id: INVENTORY_FIXTURE_IDS.orderA,
    buyer_organization_id: ORGANIZATION_IDS.buyerOnly,
    status: "DRAFT",
    order_code: "F005-FIX-ORDER-A",
    created_by: buyerOnlyUserId,
  });
  await upsert("orders", {
    id: INVENTORY_FIXTURE_IDS.orderB,
    buyer_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    status: "DRAFT",
    order_code: "F005-FIX-ORDER-B",
    created_by: buyerAndSellerUserId,
  });

  await upsert("order_items", {
    id: INVENTORY_FIXTURE_IDS.orderItemA,
    order_id: INVENTORY_FIXTURE_IDS.orderA,
    offer_id: INVENTORY_FIXTURE_IDS.offerA,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    quantity_kg: 10,
    unit_price_per_kg: 5,
    product_name_snapshot: "Feature 005 Fixture Coffee A",
    lot_code_snapshot: "F005-LOT-A",
    seller_type_snapshot: "HILLS",
  });
  await upsert("order_items", {
    id: INVENTORY_FIXTURE_IDS.orderItemB,
    order_id: INVENTORY_FIXTURE_IDS.orderB,
    offer_id: INVENTORY_FIXTURE_IDS.offerB,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    quantity_kg: 10,
    unit_price_per_kg: 5,
    product_name_snapshot: "Feature 005 Fixture Coffee B",
    lot_code_snapshot: "F005-LOT-B",
    seller_type_snapshot: "HILLS",
  });

  await upsert("storage_allocations", {
    id: INVENTORY_FIXTURE_IDS.allocationA,
    order_item_id: INVENTORY_FIXTURE_IDS.orderItemA,
    owner_organization_id: ORGANIZATION_IDS.buyerOnly,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    quantity_kg: INVENTORY_FIXTURE_QUANTITIES.allocationAQuantity,
    released_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.allocationAReleased,
    status: "STORED",
  });
  await upsert("storage_allocations", {
    id: INVENTORY_FIXTURE_IDS.allocationB,
    order_item_id: INVENTORY_FIXTURE_IDS.orderItemB,
    owner_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    quantity_kg: INVENTORY_FIXTURE_QUANTITIES.allocationBQuantity,
    released_quantity_kg: INVENTORY_FIXTURE_QUANTITIES.allocationBReleased,
    status: "STORED",
  });

  // Ownership ledger: three events proving BOTH directions for Org A, plus one event between Org B
  // and the unrelated Org C (`underReview`) that Org A must never see.
  await insertIfAbsent("inventory_ownership_events", {
    id: INVENTORY_FIXTURE_IDS.eventAToOrgAIncoming,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    from_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    to_organization_id: ORGANIZATION_IDS.buyerOnly,
    quantity_kg: 100,
    event_type: "INITIAL_ALLOCATION",
    reason: "Feature 005 fixture — initial allocation to Org A",
  });
  await insertIfAbsent("inventory_ownership_events", {
    id: INVENTORY_FIXTURE_IDS.eventAToB,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    from_organization_id: ORGANIZATION_IDS.buyerOnly,
    to_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    quantity_kg: 50,
    event_type: "RESALE",
    reason: "Feature 005 fixture — Org A resells to Org B",
  });
  await insertIfAbsent("inventory_ownership_events", {
    id: INVENTORY_FIXTURE_IDS.eventBToC,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    from_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    to_organization_id: PHASE89_ORGANIZATION_IDS.underReview,
    quantity_kg: 25,
    event_type: "RESALE",
    reason: "Feature 005 fixture — Org B resells to Org C (unrelated to Org A)",
  });

  console.log(
    `  seeded 1 hills-internal org, 1 warehouse, 2 lots, 2 offers, 6 positions, 2 orders, ` +
      `2 order items, 2 storage allocations, 3 ownership events.`
  );
}

/**
 * Deletes exactly the rows `seedInventoryFixtures()` creates, in foreign-key-safe order. The
 * `inventory_ownership_events` rows are append-only at the database level
 * (`prevent_ownership_event_mutation`, `trg_ownership_events_append_only` — BEFORE UPDATE OR DELETE).
 * The trigger body is an unconditional `raise exception`, with no role check of any kind — so it
 * fires for EVERY role, including this script's own service-role connection (which does hold a raw
 * DELETE grant on this table; the trigger, not the grant, is what actually blocks the delete). This
 * teardown does NOT attempt to delete them — they are documented, intentionally-retained synthetic
 * ledger evidence, the same "retained synthetic audit principal" precedent
 * `deleteOrganizationsRetainingAuditEvidence` already established for other append-only/audit-backed
 * rows in this script.
 *
 * Rows those retained events reference by foreign key, directly or transitively, must ALSO be
 * retained, or their own delete would fail with a foreign-key violation (confirmed empirically:
 * earlier versions of this function attempted to delete `coffee_lots` and then the shared catalogue
 * `coffees` row, and each failed with exactly that error before this function's dependency chain was
 * corrected):
 *   - `INVENTORY_FIXTURE_IDS.lotA`/`lotB` (`inventory_ownership_events.lot_id`) — both events'
 *     `lot_id` points here.
 *   - `INVENTORY_FIXTURE_IDS.coffee` (`coffee_lots.coffee_id`) — the dedicated, non-catalogue coffee
 *     row `lotA`/`lotB` themselves reference.
 *   - `INVENTORY_FIXTURE_IDS.hillsOrg` (`inventory_ownership_events.from_organization_id`/
 *     `to_organization_id`, and `coffee_lots.source_organization_id`) — the synthetic HILLS-internal
 *     organization.
 * The retained events also point at the existing fixture organizations Org A, Org B, and Org C as
 * their source/destination. The later 001/003 teardown removes every membership, KYB application,
 * and platform-admin row before attempting those organization deletes; if an immutable event or
 * audit-history FK still requires one of those organization rows, the shared teardown retains it as
 * an inert evidence target. This function does not attempt to delete those cross-feature identities.
 *
 * The Feature 005-owned retained chain is inert: no active membership, no capability granted to any real user, no longer even
 * referenced by any position/offer/order row once the rest of this teardown completes, and (the
 * coffee row) never visible on the public catalogue (`status = 'DRAFT'`) — only an inert foreign-key
 * target for the retained ledger evidence.
 */
async function teardownInventoryFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nTearing down 005-inventory-custody-storage Phase 5 fixtures…\n");

  const deleteByIds = async (table: string, ids: readonly string[]): Promise<void> => {
    const { error } = await admin.from(table).delete().in("id", ids);
    if (error) throw new SafeFixtureError(`${table} delete failed (Feature 005 Phase 5): ${error.message}`);
  };

  await deleteByIds("storage_allocations", [INVENTORY_FIXTURE_IDS.allocationA, INVENTORY_FIXTURE_IDS.allocationB]);
  await deleteByIds("order_items", [INVENTORY_FIXTURE_IDS.orderItemA, INVENTORY_FIXTURE_IDS.orderItemB]);
  await deleteByIds("orders", [INVENTORY_FIXTURE_IDS.orderA, INVENTORY_FIXTURE_IDS.orderB]);
  await deleteByIds("inventory_positions", [
    INVENTORY_FIXTURE_IDS.positionA,
    INVENTORY_FIXTURE_IDS.positionB,
    INVENTORY_FIXTURE_IDS.multiOrgPositionA,
    INVENTORY_FIXTURE_IDS.multiOrgPositionB,
    INVENTORY_FIXTURE_IDS.hillsPositionA,
    INVENTORY_FIXTURE_IDS.hillsPositionB,
  ]);
  await deleteByIds("coffee_offers", [INVENTORY_FIXTURE_IDS.offerA, INVENTORY_FIXTURE_IDS.offerB]);
  await deleteByIds("warehouses", [INVENTORY_FIXTURE_IDS.warehouse]);

  console.log(
    "  removed 2 storage allocations, 2 order items, 2 orders, 6 positions, 2 offers, 1 warehouse.\n" +
      "  RETAINED (documented, not a failure): 3 inventory_ownership_events rows, the 2 coffee_lots " +
      "rows they reference, their dedicated DRAFT coffee, and the 'Feature 005 Fixture — Hills Internal' " +
      "organization — the ledger " +
      "is append-only at the database level (the BEFORE DELETE/UPDATE trigger raises unconditionally " +
      "for every role), and the lots/organization those events reference cannot be removed without " +
      "violating that same foreign-key constraint. None carries any active membership or capability " +
      "beyond being an inert foreign-key target for this synthetic evidence."
  );
}

/**
 * Read-only, exact-id proof used by the Phase 5 fixture lifecycle audit. It never infers fixture
 * health from labels or broad searches: every count is over the documented fixed IDs. The seed path
 * checks the entire usable fixture graph; the post-teardown path checks both the removable rows and
 * the deliberately immutable evidence chain.
 */
async function verifyInventoryFixtures(admin: SupabaseClient, state: "seeded" | "torn-down"): Promise<void> {
  const ids = {
    organization: [INVENTORY_FIXTURE_IDS.hillsOrg],
    coffee: [INVENTORY_FIXTURE_IDS.coffee],
    warehouse: [INVENTORY_FIXTURE_IDS.warehouse],
    lots: [INVENTORY_FIXTURE_IDS.lotA, INVENTORY_FIXTURE_IDS.lotB],
    offers: [INVENTORY_FIXTURE_IDS.offerA, INVENTORY_FIXTURE_IDS.offerB],
    positions: [
      INVENTORY_FIXTURE_IDS.hillsPositionA,
      INVENTORY_FIXTURE_IDS.hillsPositionB,
      INVENTORY_FIXTURE_IDS.positionA,
      INVENTORY_FIXTURE_IDS.positionB,
      INVENTORY_FIXTURE_IDS.multiOrgPositionA,
      INVENTORY_FIXTURE_IDS.multiOrgPositionB,
    ],
    orders: [INVENTORY_FIXTURE_IDS.orderA, INVENTORY_FIXTURE_IDS.orderB],
    items: [INVENTORY_FIXTURE_IDS.orderItemA, INVENTORY_FIXTURE_IDS.orderItemB],
    allocations: [INVENTORY_FIXTURE_IDS.allocationA, INVENTORY_FIXTURE_IDS.allocationB],
    events: [
      INVENTORY_FIXTURE_IDS.eventAToOrgAIncoming,
      INVENTORY_FIXTURE_IDS.eventAToB,
      INVENTORY_FIXTURE_IDS.eventBToC,
    ],
  } as const;

  const countExactIds = async (table: string, rowIds: readonly string[], expectedCount: number): Promise<void> => {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).in("id", rowIds);
    if (error || count !== expectedCount) {
      throw new SafeFixtureError(`Feature 005 ${state} fixture verification failed for ${table}.`);
    }
  };

  const seeded = state === "seeded";
  await countExactIds("organizations", ids.organization, 1);
  await countExactIds("coffees", ids.coffee, 1);
  await countExactIds("coffee_lots", ids.lots, 2);
  await countExactIds("inventory_ownership_events", ids.events, 3);
  await countExactIds("warehouses", ids.warehouse, seeded ? 1 : 0);
  await countExactIds("coffee_offers", ids.offers, seeded ? 2 : 0);
  await countExactIds("inventory_positions", ids.positions, seeded ? 6 : 0);
  await countExactIds("orders", ids.orders, seeded ? 2 : 0);
  await countExactIds("order_items", ids.items, seeded ? 2 : 0);
  await countExactIds("storage_allocations", ids.allocations, seeded ? 2 : 0);

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, is_hills_internal, can_buy, can_sell")
    .eq("id", INVENTORY_FIXTURE_IDS.hillsOrg)
    .maybeSingle();
  if (
    organizationError ||
    !organization ||
    organization.is_hills_internal !== true ||
    organization.can_buy !== true ||
    organization.can_sell !== true
  ) {
    throw new SafeFixtureError("Feature 005 Hills-internal organization verification failed.");
  }

  const { data: coffee, error: coffeeError } = await admin
    .from("coffees")
    .select("id, status")
    .eq("id", INVENTORY_FIXTURE_IDS.coffee)
    .maybeSingle();
  if (coffeeError || coffee?.status !== "DRAFT") {
    throw new SafeFixtureError("Feature 005 dedicated coffee visibility verification failed.");
  }

  // This organization deliberately has internal capabilities for its system role, but it is not a
  // real user's acting organization: it must never have an active membership in either state.
  const { count: hillsMembershipCount, error: hillsMembershipError } = await admin
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", INVENTORY_FIXTURE_IDS.hillsOrg);
  if (hillsMembershipError || hillsMembershipCount !== 0) {
    throw new SafeFixtureError("Feature 005 Hills-internal membership safety verification failed.");
  }

  console.log(`  verified Feature 005 ${state} fixture state using exact fixed IDs.`);
}

/**
 * Safely proves the privileged path reaches the database's append-only guard. The UPDATE is
 * intentionally rejected by the BEFORE trigger, so the statement rolls back before any audit row
 * can be emitted and the ledger value remains unchanged. This remains in the fixture script — never
 * in application runtime or a test process that can see the service-role credential.
 */
async function verifyInventoryAppendOnlyGuard(admin: SupabaseClient): Promise<void> {
  const expectedReason = "Feature 005 fixture — initial allocation to Org A";
  const { error } = await admin
    .from("inventory_ownership_events")
    .update({ reason: "forbidden Feature 005 append-only probe" })
    .eq("id", INVENTORY_FIXTURE_IDS.eventAToOrgAIncoming);

  if (!error || !error.message.includes("inventory_ownership_events_is_append_only")) {
    throw new SafeFixtureError("Feature 005 ownership ledger append-only guard did not refuse a privileged update.");
  }

  const { data, error: readError } = await admin
    .from("inventory_ownership_events")
    .select("reason")
    .eq("id", INVENTORY_FIXTURE_IDS.eventAToOrgAIncoming)
    .maybeSingle();
  if (readError || data?.reason !== expectedReason) {
    throw new SafeFixtureError("Feature 005 ownership ledger append-only probe changed evidence.");
  }

  console.log("  verified Feature 005 ownership ledger append-only guard through a refused privileged update.");
}

// ---------------------------------------------------------------------------
// Feature 006 RUN A (T001–T008) — marketplace/listing fixtures
// ---------------------------------------------------------------------------

/**
 * EXTENDS the existing fixture architecture — reuses Feature 005's `hillsOrg`/`warehouse`/`lotA`/
 * `lotB`/`hillsPositionA`/`hillsPositionB`/`positionA`(Org A)/`positionB`(Org B) fixtures rather than
 * re-creating parallel ones, and the SAME identity fixtures (`buyerOnly` = Org A, canSell=false;
 * `buyerAndSeller` = Org B, canSell=true).
 *
 * Fixed ids in their own `06000000-...` range (Feature 006), never colliding with 001/003/005's
 * ranges.
 */
const LISTING_FIXTURE_IDS = {
  warehouseInactive: "06000000-0000-4000-8000-000000000001",
  positionOrgBOnLotA: "06000000-0000-4000-8000-000000000002",
  positionOrgBInactiveWarehouse: "06000000-0000-4000-8000-000000000003",
  offerPublished: "06000000-0000-4000-8000-000000000006",
  offerSoldOut: "06000000-0000-4000-8000-000000000007",
  /**
   * A DEDICATED lot (never Feature 005's `lotA`/`lotB`) — `coffee_offers` carries a partial UNIQUE
   * index, `uq_active_offer_per_lot_owner` (`(lot_id, seller_organization_id) WHERE deleted_at IS
   * NULL AND status NOT IN ('ARCHIVED','REJECTED','SOLD_OUT')`), confirmed empirically (an earlier
   * version of this fixture tried to reuse `lotA` and collided with Feature 005's own `offerA`, which
   * already occupies that lot+owner's one allowed "active" slot). `offerPublished`
   * (PARTIALLY_FILLED, inside the partial index) and `offerSoldOut` (SOLD_OUT, exempt from it) can
   * still coexist on this SAME new lot without colliding with each other.
   */
  lotC: "06000000-0000-4000-8000-000000000009",
  hillsPositionC: "06000000-0000-4000-8000-00000000000a",
} as const;

async function seedListingFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nSeeding 006-marketplace-listings-resale Phase 1/2 fixtures…\n");

  const buyerAndSellerUserId = await findAuthUserIdByEmail(admin, FIXTURES[1]!.email);
  if (!buyerAndSellerUserId) throw new SafeFixtureError("001 identity fixtures are missing; run npm run test:seed first.");

  const upsert = async (table: string, row: Record<string, unknown>): Promise<void> => {
    const { error } = await admin.from(table).upsert(row, { onConflict: "id" });
    if (error) throw new SafeFixtureError(`${table} upsert failed (Feature 006): ${error.message}`);
  };

  /** Same insert-if-absent discipline as Feature 005's ownership events — these rows must never be
   * re-`UPDATE`d by a repeated seed run, since some carry a status the trigger would legally but
   * non-idempotently re-transition (`trg_listing_status_history` fires on every real status change). */
  const insertIfAbsent = async (table: string, row: Record<string, unknown> & { id: string }): Promise<boolean> => {
    const { data: existing, error: selectError } = await admin.from(table).select("id").eq("id", row.id).maybeSingle();
    if (selectError) throw new SafeFixtureError(`${table} existence check failed (Feature 006): ${selectError.message}`);
    if (existing) return false;

    const { error: insertError } = await admin.from(table).insert(row);
    if (insertError) throw new SafeFixtureError(`${table} insert failed (Feature 006): ${insertError.message}`);
    return true;
  };

  // A second warehouse, deliberately INACTIVE — the only authoritative custody-adjacent fact
  // `lib/listings/eligibility.ts` checks (`CUSTODY_NOT_ELIGIBLE`).
  await upsert("warehouses", {
    id: LISTING_FIXTURE_IDS.warehouseInactive,
    owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    code: "F006-WH-INACTIVE",
    name: "Feature 006 Fixture — Inactive Warehouse",
    is_active: false,
  });

  // Org B owns a position on lot A too, but has NEVER purchased lot A through a settled order —
  // proves `NOT_HILLS_SOURCED` without touching Org B's genuine lot-B provenance below.
  await upsert("inventory_positions", {
    id: LISTING_FIXTURE_IDS.positionOrgBOnLotA,
    lot_id: INVENTORY_FIXTURE_IDS.lotA,
    owner_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: 200,
    reserved_quantity_kg: 0,
  });

  // Org B owns a position on lot B inside the INACTIVE warehouse — proves `CUSTODY_NOT_ELIGIBLE`.
  await upsert("inventory_positions", {
    id: LISTING_FIXTURE_IDS.positionOrgBInactiveWarehouse,
    lot_id: INVENTORY_FIXTURE_IDS.lotB,
    owner_organization_id: ORGANIZATION_IDS.buyerAndSeller,
    warehouse_id: LISTING_FIXTURE_IDS.warehouseInactive,
    available_quantity_kg: 50,
    reserved_quantity_kg: 0,
  });

  // A dedicated new lot (never Feature 005's `lotA`/`lotB` — see `LISTING_FIXTURE_IDS.lotC`'s own
  // comment for why), with hillsOrg's own backing position (required by `validate_offer_transition`
  // before it will accept a `seller_type = 'HILLS'` listing, exactly as Feature 005's `hillsPositionA`/
  // `hillsPositionB` already established for `lotA`/`lotB`).
  await upsert("coffee_lots", {
    id: LISTING_FIXTURE_IDS.lotC,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_code: "F006-LOT-C",
    total_quantity_kg: 1000,
    status: "AVAILABLE",
    source_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
  });
  await upsert("inventory_positions", {
    id: LISTING_FIXTURE_IDS.hillsPositionC,
    lot_id: LISTING_FIXTURE_IDS.lotC,
    owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: 1000,
    reserved_quantity_kg: 0,
  });

  // A real PUBLISHED (well, PARTIALLY_FILLED) HILLS listing — T002's buyer-browse positive-read
  // fixture, and a genuine partial-fill fixture for `lib/listings/fills.ts`'s live proof (quantity
  // 100, reserved 15.5, filled 24.5 → remaining 60, deliberately non-round to detect accidental
  // arithmetic drift).
  const createdPublished = await insertIfAbsent("coffee_offers", {
    id: LISTING_FIXTURE_IDS.offerPublished,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_id: LISTING_FIXTURE_IDS.lotC,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    seller_type: "HILLS",
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    title: "Feature 006 Fixture — Published Listing",
    quantity_kg: 100,
    reserved_quantity_kg: 15.5,
    filled_quantity_kg: 24.5,
    price_per_kg: 12.75,
    currency: "USD",
    status: "PARTIALLY_FILLED",
    created_by: buyerAndSellerUserId,
  });

  // A real SOLD_OUT HILLS listing, on the SAME dedicated lot (SOLD_OUT is exempt from
  // `uq_active_offer_per_lot_owner`'s partial index, so this coexists with `offerPublished` above
  // without colliding) — empirically proves the `member_read_published_offers` policy's
  // `(remaining) > 0` clause makes SOLD_OUT unreadable by a buyer even by direct id
  // (`lib/listings/browse.ts`'s own documented schema-vs-spec finding).
  await insertIfAbsent("coffee_offers", {
    id: LISTING_FIXTURE_IDS.offerSoldOut,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_id: LISTING_FIXTURE_IDS.lotC,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    seller_type: "HILLS",
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    title: "Feature 006 Fixture — Sold Out Listing",
    quantity_kg: 50,
    reserved_quantity_kg: 0,
    filled_quantity_kg: 50,
    price_per_kg: 10,
    currency: "USD",
    status: "SOLD_OUT",
    created_by: buyerAndSellerUserId,
  });

  console.log(
    `  seeded 1 inactive warehouse, 2 extra Org B positions, 1 dedicated lot+position, ` +
      `${createdPublished ? "1 published listing (new)" : "published listing (reused)"}, 1 sold-out listing.`
  );
}

/**
 * Deletes exactly the mutable rows `seedListingFixtures()` creates. `coffee_offers` rows are NOT
 * append-only in general, but this teardown still does not attempt to reset their status backward
 * (no product reason to) — it simply deletes them, which cascades to their own
 * `listing_status_history`/`offer_documents`/`offer_sensory_notes`/`offer_tags` rows
 * (`ON DELETE CASCADE`, confirmed against the live schema report), so nothing is orphaned or
 * separately retained the way Feature 005's append-only ledger events are.
 */
async function teardownListingFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nTearing down 006-marketplace-listings-resale Phase 1/2 fixtures…\n");

  const deleteByIds = async (table: string, ids: readonly string[]): Promise<void> => {
    const { error } = await admin.from(table).delete().in("id", ids);
    if (error) throw new SafeFixtureError(`${table} delete failed (Feature 006): ${error.message}`);
  };

  await deleteByIds("coffee_offers", [LISTING_FIXTURE_IDS.offerPublished, LISTING_FIXTURE_IDS.offerSoldOut]);
  await deleteByIds("inventory_positions", [
    LISTING_FIXTURE_IDS.positionOrgBOnLotA,
    LISTING_FIXTURE_IDS.positionOrgBInactiveWarehouse,
    LISTING_FIXTURE_IDS.hillsPositionC,
  ]);
  await deleteByIds("coffee_lots", [LISTING_FIXTURE_IDS.lotC]);
  await deleteByIds("warehouses", [LISTING_FIXTURE_IDS.warehouseInactive]);

  console.log("  removed 2 listings (cascading their own status history), 3 positions, 1 lot, 1 warehouse.");
}

// ---------------------------------------------------------------------------
// Supabase admin access
// ---------------------------------------------------------------------------

function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Finds an existing Auth user by email. The Admin API exposes no get-by-email, so this pages
 * through the user list. Returning the existing id is what makes user creation idempotent.
 */
async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new SafeFixtureError("Failed to list auth users.");

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );
    if (match) return match.id;

    if (data.users.length < perPage) return null;
  }
}

/** Creates the Auth user if absent; otherwise reuses it and resets its password. */
async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string
): Promise<{ userId: string; created: boolean }> {
  const existingId = await findAuthUserIdByEmail(admin, email);

  if (existingId !== null) {
    // Re-assert the documented password so a re-run always leaves a usable fixture, even if the
    // password was rotated in .env.local since the fixture was first created.
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    });
    if (error) throw new SafeFixtureError("Failed to update auth user.");
    return { userId: existingId, created: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fixture: "001-platform-foundation" },
  });
  if (error || !data.user) throw new SafeFixtureError("Failed to create auth user.");
  return { userId: data.user.id, created: true };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(admin: SupabaseClient, password: string): Promise<void> {
  console.log("Seeding 001-platform-foundation test fixtures…\n");

  for (const fixture of FIXTURES) {
    const { userId, created } = await ensureAuthUser(
      admin,
      fixture.email,
      password
    );

    // `profiles` is not auto-created by any trigger in the approved baseline, and
    // organization_members / platform_admins both reference it, so it must exist first.
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: fixture.fullName,
        company_name: fixture.organization?.displayName ?? null,
        is_blocked: false,
      },
      { onConflict: "id" }
    );
    if (profileError) {
      throw new SafeFixtureError("profiles upsert failed.");
    }

    if (fixture.organization !== null) {
      const org = fixture.organization;

      const { error: orgError } = await admin.from("organizations").upsert(
        {
          id: org.id,
          legal_name: org.legalName,
          display_name: org.displayName,
          account_type: org.accountType,
          status: "ACTIVE",
          is_hills_internal: false,
          can_buy: org.canBuy,
          can_sell: org.canSell,
        },
        { onConflict: "id" }
      );
      if (orgError) {
        throw new SafeFixtureError("organizations upsert failed.");
      }

      // `organization_can_buy`/`organization_can_sell` require an APPROVED KYB application for a
      // non-internal organization, so the capability the fixture claims is the capability the
      // database's own functions will actually attest.
      const { error: kybError } = await admin.from("kyb_applications").upsert(
        {
          id: org.kybApplicationId,
          organization_id: org.id,
          submitted_by: userId,
          status: "APPROVED",
          submitted_at: new Date(0).toISOString(),
          decided_at: new Date(0).toISOString(),
        },
        { onConflict: "id" }
      );
      if (kybError) {
        throw new SafeFixtureError("kyb_applications upsert failed.");
      }

      const { error: memberError } = await admin
        .from("organization_members")
        .upsert(
          {
            organization_id: org.id,
            user_id: userId,
            member_role: "OWNER",
            is_active: true,
          },
          { onConflict: "organization_id,user_id" }
        );
      if (memberError) {
        throw new SafeFixtureError("organization_members upsert failed.");
      }
    }

    if (fixture.platformAdminRole !== null) {
      const { error: adminError } = await admin.from("platform_admins").upsert(
        {
          user_id: userId,
          role: fixture.platformAdminRole,
          is_active: true,
        },
        { onConflict: "user_id" }
      );
      if (adminError) {
        throw new SafeFixtureError("platform_admins upsert failed.");
      }
    }

    console.log(
      `  ${created ? "created" : "reused "}  ${fixture.label.padEnd(17)} ${fixture.email}`
    );
    console.log(`             user_id=${userId}`);
    if (fixture.organization) {
      console.log(
        `             organization_id=${fixture.organization.id} ` +
          `can_buy=${fixture.organization.canBuy} can_sell=${fixture.organization.canSell}`
      );
    }
    if (fixture.platformAdminRole) {
      console.log(`             platform_admins.role=${fixture.platformAdminRole}`);
    }
  }

  console.log(
    "\nDone. Passwords are read from TEST_FIXTURE_PASSWORD and never printed."
  );
}

/**
 * Changes only the capability flag used by T030's cross-request freshness proof.
 *
 * The authenticated fixture must not be allowed to mutate this authorization-critical flag under
 * RLS. Keeping this narrowly-scoped control in the already-approved fixture script preserves that
 * production boundary while allowing the integration test to change and immediately restore the
 * one documented test row. No arbitrary organization id or column is accepted from the caller.
 */
async function setBuyerAndSellerCanSell(
  admin: SupabaseClient,
  canSell: boolean
): Promise<void> {
  const { data, error } = await admin
    .from("organizations")
    .update({ can_sell: canSell })
    .eq("id", ORGANIZATION_IDS.buyerAndSeller)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new SafeFixtureError("fixture capability update failed.");
  }
  if (!data) {
    throw new Error(
      "buyer-and-seller fixture is missing; run npm run test:seed first"
    );
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Deletes each given organization individually, tolerating a foreign-key violation (Postgres
 * `23503`) as an INTENTIONALLY RETAINED synthetic evidence target rather than letting it abort the
 * whole teardown run. This is the concrete case the run directive names: "if foreign keys require
 * retained synthetic audit principals: block/disable them safely, document exactly why they remain,
 * do not fabricate complete deletion." A live test's `agreement_acceptances` insert (Phase 6/7's own
 * `agreement-acceptance.test.ts`, and this run's T030/T034 tests) is real evidence-shaped data this
 * script never deletes (`authenticated` holds no DELETE grant on that table, and this script does not
 * use its own service-role privilege to bypass that for evidence rows either) — its `organization_id`
 * foreign key is exactly what then blocks that organization's own deletion. Retained organizations
 * are still safe: they carry no live capability beyond being a foreign-key target (their
 * `organization_members`/`kyb_applications`/`platform_admins` rows are deleted by the caller before
 * this runs), so nothing "accidentally usable" survives — only an inert row a protected evidence
 * record (or an immutable Feature 005 ownership event) still points at. The function deliberately
 * does not claim every `23503` is audit history: callers must document the concrete FK when adding a
 * new immutable reference.
 */
async function deleteOrganizationsRetainingAuditEvidence(
  admin: SupabaseClient,
  organizationIds: readonly string[]
): Promise<{ deleted: string[]; retained: string[] }> {
  const deleted: string[] = [];
  const retained: string[] = [];

  for (const organizationId of organizationIds) {
    const { error } = await admin.from("organizations").delete().eq("id", organizationId);
    if (!error) {
      deleted.push(organizationId);
      continue;
    }
    if (error.code === "23503") {
      retained.push(organizationId);
      continue;
    }
    throw new SafeFixtureError("organizations delete failed.");
  }

  return { deleted, retained };
}

/**
 * The auth-user counterpart of `deleteOrganizationsRetainingAuditEvidence` above, generalized rather
 * than keyed to one specific table: the Auth Admin API's `deleteUser` reports any referencing-row
 * failure as a generic `500 "Database error deleting user"` (no distinguishable Postgres error code
 * the way PostgREST table deletes give one), so this treats ANY failure as "retained," not only a
 * `agreement_acceptances` one. Confirmed against a real case this run surfaced live: a fixture whose
 * own test drove a REAL, RLS-respecting `submit_kyb_application` RPC call — executed AS that fixture
 * user, unlike every other fixture's rows, which are written by this script's own service-role
 * connection with no `auth.uid()` — leaves a real, non-null `audit_logs.actor_user_id` row pointing at
 * that profile. `audit_logs` is the platform's own append-only audit trail (documented elsewhere in
 * this file as never removed), so the correct outcome is exactly this: the affected user is retained,
 * not force-deleted through some new privileged bypass.
 */
async function deleteAuthUsersRetainingAuditEvidence(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<{ deleted: string[]; retained: string[] }> {
  const deleted: string[] = [];
  const retained: string[] = [];

  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) {
      deleted.push(userId);
      continue;
    }
    retained.push(userId);
  }

  return { deleted, retained };
}

/**
 * Deletes exactly the rows `seed()` creates, in foreign-key-safe order.
 *
 * Not deleted, deliberately: `audit_logs` and `account_status_history` rows written by the
 * database's own triggers. Those are the approved baseline's append-only audit trail
 * (Constitution auditability); removing them would mean deleting audit history, which this
 * script must never do. Ordinarily they carry a NULL actor (the service-role connection has no
 * `auth.uid()`), so they hold no fixture credential material — but a fixture whose OWN test drove a
 * real, RLS-respecting Server Action/RPC call (rather than this script's own privileged writes) can
 * leave a real, non-null `audit_logs.actor_user_id` pointing at that profile. When that happens, this
 * organization/user pair is retained rather than force-deleted — see
 * `deleteOrganizationsRetainingAuditEvidence`/`deleteAuthUsersRetainingAuditEvidence`.
 */
async function teardown(admin: SupabaseClient): Promise<void> {
  console.log("Tearing down 001-platform-foundation test fixtures…\n");

  const userIdByFixtureLabel = new Map<string, string>();
  const userIds: string[] = [];
  for (const fixture of FIXTURES) {
    const userId = await findAuthUserIdByEmail(admin, fixture.email);
    if (userId !== null) {
      userIds.push(userId);
      userIdByFixtureLabel.set(fixture.label, userId);
    }
  }

  const organizationIds = Object.values(ORGANIZATION_IDS);
  const kybApplicationIds = Object.values(KYB_APPLICATION_IDS);

  if (userIds.length > 0) {
    const { error } = await admin
      .from("platform_admins")
      .delete()
      .in("user_id", userIds);
    if (error) throw new SafeFixtureError("platform_admins delete failed.");
  }

  const { error: memberError } = await admin
    .from("organization_members")
    .delete()
    .in("organization_id", organizationIds);
  if (memberError) {
    throw new SafeFixtureError("organization_members delete failed.");
  }

  const { error: kybError } = await admin
    .from("kyb_applications")
    .delete()
    .in("id", kybApplicationIds);
  if (kybError) {
    throw new SafeFixtureError("kyb_applications delete failed.");
  }

  const { deleted: deletedOrganizations, retained: retainedOrganizations } =
    await deleteOrganizationsRetainingAuditEvidence(admin, organizationIds);

  // Deleting the Auth user cascades to `profiles` (profiles.id references auth.users ON DELETE
  // CASCADE), which is why every referencing row above is removed first. Attempted for every fixture
  // regardless of whether its organization was retained — `deleteAuthUsersRetainingAuditEvidence`
  // treats ANY failure (an `agreement_acceptances.user_id` block, or a real `audit_logs.actor_user_id`
  // row from a live test's authenticated RPC call) as a retained synthetic audit principal, never a
  // hard failure to force through.
  const { deleted: deletedUsers, retained: retainedUserIds } = await deleteAuthUsersRetainingAuditEvidence(
    admin,
    userIds
  );
  const retainedUserIdSet = new Set(retainedUserIds);
  const retainedUserLabels = FIXTURES.filter((fixture) => {
    const userId = userIdByFixtureLabel.get(fixture.label);
    return userId !== undefined && retainedUserIdSet.has(userId);
  }).map((fixture) => fixture.label);

  if (retainedOrganizations.length > 0 || retainedUserIds.length > 0) {
    console.log(
      `  RETAINED (documented, not a failure): ${retainedUserLabels.join(", ") || "(no fixture user, org only)"} — ` +
        `organization(s) [${retainedOrganizations.join(", ") || "none"}], user(s) [${retainedUserIds.join(", ") || "none"}] — ` +
        `still referenced by real audit evidence (agreement_acceptances and/or audit_logs) a live ` +
        `test produced. No DELETE grant/privilege bypass is used to force this through.`
    );
  }

  console.log(
    `  removed ${deletedUsers.length} auth user(s) + profile(s), ${deletedOrganizations.length} organization(s), ` +
      `${kybApplicationIds.length} kyb application(s), and their membership/admin rows.`
  );
  console.log("\nDone. No other rows were touched.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvLocal();

  const isTeardown = process.argv.includes("--teardown");
  const capabilityArgumentPrefix = "--set-buyer-and-seller-can-sell=";
  const capabilityArgument = process.argv.find((argument) =>
    argument.startsWith(capabilityArgumentPrefix)
  );
  const suspendedStatusArgumentPrefix = "--set-suspended-organization-status=";
  const suspendedStatusArgument = process.argv.find((argument) =>
    argument.startsWith(suspendedStatusArgumentPrefix)
  );
  const isResetCompleteDraft = process.argv.includes("--reset-complete-draft-application");
  const isVerifyInventoryFixtures = process.argv.includes("--verify-inventory-fixtures");
  const isVerifyInventoryAppendOnly = process.argv.includes("--verify-inventory-append-only");
  const admin = createAdminClient();

  if (isVerifyInventoryFixtures && isVerifyInventoryAppendOnly) {
    throw new SafeFixtureError("Choose only one Feature 005 inventory verification operation.");
  }

  if (isVerifyInventoryFixtures) {
    await verifyInventoryFixtures(admin, "seeded");
    return;
  }

  if (isVerifyInventoryAppendOnly) {
    await verifyInventoryAppendOnlyGuard(admin);
    return;
  }

  if (capabilityArgument) {
    const value = capabilityArgument.slice(capabilityArgumentPrefix.length);
    if (value !== "true" && value !== "false") {
      throw new SafeFixtureError(
        "--set-buyer-and-seller-can-sell must be exactly true or false"
      );
    }

    await setBuyerAndSellerCanSell(admin, value === "true");
    return;
  }

  if (suspendedStatusArgument) {
    const value = suspendedStatusArgument.slice(suspendedStatusArgumentPrefix.length);
    if (value !== "ACTIVE" && value !== "SUSPENDED") {
      throw new SafeFixtureError(
        "--set-suspended-organization-status must be exactly ACTIVE or SUSPENDED"
      );
    }

    await setSuspendedOrganizationStatus(admin, value);
    return;
  }

  if (isResetCompleteDraft) {
    await resetCompleteDraftApplication(admin);
    return;
  }

  if (isTeardown) {
    // Feature 006 FIRST: its positions reference Feature 005's `lotA`/`lotB` (retained permanently by
    // Feature 005's own teardown, so no ordering conflict there), but torn down first regardless to
    // keep the same "newest feature torn down first" discipline every other extension here follows.
    // Feature 005 Phase 5 NEXT: its rows reference the 001/003 identity fixtures
    // (`buyerOnly`/`buyerAndSeller`/`underReview` organizations), so it must be
    // torn down before any of those are removed, or its remaining FKs would block their deletion.
    // Catalogue next: it is the leaf of the REMAINING dependency order and never references an
    // identity row. Phase 8/9 BEFORE 001's own teardown: `CROSS_ORG_ISOLATION_DOCUMENT_IDS`'s
    // `file_assets` rows hold a (non-cascading) foreign key to the 001 `buyerOnly`/`buyerAndSeller`
    // organizations — those must be removed before `teardown()` can delete those organizations, or
    // the delete fails with a foreign-key violation.
    await teardownListingFixtures(admin);
    await teardownInventoryFixtures(admin);
    await teardownCatalogue(admin);
    await teardownPhase89(admin);
    await teardown(admin);
    await verifyInventoryFixtures(admin, "torn-down");
    return;
  }

  const password = requireEnv("TEST_FIXTURE_PASSWORD");
  await seed(admin, password);
  await seedCatalogue(admin);
  await seedPhase89(admin, password);
  // Feature 005 Phase 5: depends on the 001 identity fixtures (buyerOnly/buyerAndSeller) and
  // Phase 8/9's `underReview` organization. Its dedicated DRAFT coffee is intentionally independent
  // of Feature 002's catalogue fixtures, so no public catalogue row is coupled to this lifecycle.
  await seedInventoryFixtures(admin);
  // Feature 006 LAST: depends on Feature 005's hillsOrg/warehouse/lots/positions/offerB.
  await seedListingFixtures(admin);
}

main().catch((error: unknown) => {
  // Only deliberately-authored safe messages may reach stderr. Unexpected SDK/database errors
  // are mapped generically so their raw payload, stack and request/session context stay private.
  const safeMessage =
    error instanceof SafeFixtureError ||
    (error instanceof Error &&
      error.message.startsWith("Missing required environment variable "))
      ? error.message
      : "Unexpected fixture operation failure.";
  console.error(
    `\nFixture script failed: ${safeMessage}`
  );
  process.exitCode = 1;
});
