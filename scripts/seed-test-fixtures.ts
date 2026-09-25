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
  label: "buyer-only" | "buyer-and-seller" | "warehouse-admin" | "finance-admin" | "delivery-admin" | "compliance-reviewer" | "catalogue-admin" | "auditor" | "super-admin" | "f013-finance" | "f013-warehouse" | "f013-auditor" | "f013-admin";
  email: string;
  fullName: string;
  organization: FixtureOrganization | null;
  platformAdminRole: "WAREHOUSE" | "FINANCE" | "ADMIN" | "COMPLIANCE" | "AUDITOR" | "SUPER_ADMIN" | null;
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
  {
    label: "finance-admin",
    email: "finance-admin+foundation-test@example.com",
    // No organization — mirrors warehouse-admin exactly. This fixture stays deliberately narrow:
    // `admin_review_payment()` accepts FINANCE through `is_finance_operator()`. T013's separate,
    // opt-in `T013_DELIVERY_ADMIN_FIXTURE` below is the ONLY fixture allowed to exercise a genuinely
    // ADMIN-only transition such as DISPUTED.
    fullName: "Foundation Test — Finance Operator",
    organization: null,
    platformAdminRole: "FINANCE",
  },
];

/**
 * Feature 009 T013's human-approved, disposable ADMIN proof identity. It is intentionally NOT part
 * of `FIXTURES`, so normal `npm run test:seed` never creates or reactivates it. The guarded
 * `--prepare-t013-live-fixtures` command creates it only after proving there is no stale T013
 * business residue; `--cleanup-t013-live-fixtures` removes its ADMIN capability and deletes or bans
 * the auth principal deterministically. It has no organization membership and is never SUPER_ADMIN.
 */
const T013_DELIVERY_ADMIN_FIXTURE: Fixture = {
  label: "delivery-admin",
  email: "delivery-admin+t013-test@example.com",
  fullName: "Feature 009 Test — Delivery Admin",
  organization: null,
  platformAdminRole: "ADMIN",
};

/**
 * Feature 010 RUN B's human-authorized, disposable COMPLIANCE proof identity — the SAME shape and
 * lifecycle as `T013_DELIVERY_ADMIN_FIXTURE` (never part of `FIXTURES`, so `npm run test:seed` never
 * creates it; only `--prepare-compliance-fixture` creates/reactivates it, and
 * `--cleanup-compliance-fixture` removes the capability and deletes or blocks+bans the principal).
 * Role is exactly `COMPLIANCE` — never ADMIN, never SUPER_ADMIN — with no organization membership,
 * so every Feature 010 compliance proof runs as a genuinely narrow operator, and the standing
 * FINANCE/WAREHOUSE fixtures are never broadened.
 */
const RUN_B_COMPLIANCE_FIXTURE: Fixture = {
  label: "compliance-reviewer",
  email: "compliance-reviewer+t010-test@example.com",
  fullName: "Feature 010 Test — Compliance Reviewer",
  organization: null,
  platformAdminRole: "COMPLIANCE",
};

/**
 * Feature 010 RUN E's human-authorized (2026-09-16), disposable platform-ADMIN identity for the
 * catalogue proofs (T021–T024: catalogue RLS is `is_platform_admin()` only, and no standing ADMIN
 * fixture exists). SAME shape and lifecycle as the two disposable fixtures above: never part of
 * `FIXTURES`; created/reactivated only by `--prepare-catalogue-admin-fixture`; de-privileged
 * (capability row removed, principal deleted or blocked+banned) by `--cleanup-catalogue-admin-fixture`.
 * Role is exactly `ADMIN` — never SUPER_ADMIN — with no organization membership.
 */
const RUN_E_CATALOGUE_ADMIN_FIXTURE: Fixture = {
  label: "catalogue-admin",
  email: "catalogue-admin+t021-test@example.com",
  fullName: "Feature 010 Test — Catalogue Admin",
  organization: null,
  platformAdminRole: "ADMIN",
};

/**
 * Feature 010 RUN E's human-authorized (2026-09-16), disposable AUDITOR identity for the read-only
 * audit proofs (T025/T026). Role is exactly `AUDITOR` — never ADMIN, never SUPER_ADMIN — no
 * organization membership; same prepare/cleanup lifecycle as the COMPLIANCE fixture.
 */
const RUN_E_AUDITOR_FIXTURE: Fixture = {
  label: "auditor",
  email: "auditor+t025-test@example.com",
  fullName: "Feature 010 Test — Auditor",
  organization: null,
  platformAdminRole: "AUDITOR",
};

/**
 * Feature 010 RUN F's human-authorized (2026-09-17, decision H1), disposable SUPER_ADMIN identity for
 * the Phase 9 system-configuration proofs (T027/T028/T042–T045/T029). It is the ONLY way a test can
 * satisfy `is_super_admin()`: `platform_admins` is writable solely by an existing super admin (none
 * exists live), so this seed-time service-role creation is the bootstrap — never a product path.
 * Role is exactly `SUPER_ADMIN`, no organization membership, same prepare/cleanup lifecycle as the
 * other disposable fixtures; de-privileged (`activeCapability: false`) after every run.
 */
const RUN_F_SUPER_ADMIN_FIXTURE: Fixture = {
  label: "super-admin",
  email: "super-admin+t027-test@example.com",
  fullName: "Feature 010 Test — Super Admin",
  organization: null,
  platformAdminRole: "SUPER_ADMIN",
};

/**
 * Feature 010 RUN F — the fixed identifiers of every configuration row the RUN F live suite CREATES
 * through the console's own SUPER_ADMIN layer, and the ONE standing fixture user (`no-organization`,
 * a member with no organization and no operational role) that T027 temporarily grants a role to.
 * Commission policies are dated 2099 so they can never be selected by `checkout_order`; the tax and
 * shipping rules use the user-assigned ISO code `ZZ` (no real country); the payment account carries
 * placeholder identifiers. Nothing seeded by another feature (the real AE VAT rule, the real ADMIN
 * row) is ever matched by these predicates.
 */
const RUN_F_CONFIG_ROWS = {
  policyNamePrefix: "RUN F ",
  ruleCountryCode: "ZZ",
  accountNamePrefix: "RUN F ",
  roleTargetEmail: "no-organization+foundation-test@example.com",
} as const;

async function cleanupRunFConfigRows(admin: SupabaseClient): Promise<void> {
  const removed: Record<string, number> = {};
  const count = async (label: string, promise: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
    const { data, error } = await promise;
    if (error) throw new SafeFixtureError(`RUN F config-row cleanup failed (${label}).`);
    removed[label] = data?.length ?? 0;
  };
  // Tiers cascade with their policy (FK ON DELETE CASCADE).
  await count("commission_policies", admin.from("commission_policies").delete().like("name", `${RUN_F_CONFIG_ROWS.policyNamePrefix}%`).select("id"));
  await count("tax_rules", admin.from("tax_rules").delete().eq("country_code", RUN_F_CONFIG_ROWS.ruleCountryCode).select("id"));
  await count("shipping_rules", admin.from("shipping_rules").delete().eq("country_code", RUN_F_CONFIG_ROWS.ruleCountryCode).select("id"));
  await count("payment_accounts", admin.from("payment_accounts").delete().like("account_name", `${RUN_F_CONFIG_ROWS.accountNamePrefix}%`).select("id"));
  const targetId = await findAuthUserIdByEmail(admin, RUN_F_CONFIG_ROWS.roleTargetEmail);
  if (targetId) await count("platform_admins(role target)", admin.from("platform_admins").delete().eq("user_id", targetId).select("user_id"));
  console.log(JSON.stringify({ removed }));
}

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
  /** Feature 010 RUN E (T023) — the ONE coffee the admin console may publish/unpublish in a live proof. */
  coffeeRunEProof: "f0000000-0000-4000-8000-000000000044",
  /** Feature 010 RUN E (T024) — ONE metadata-only media record on the proof coffee (no bytes, no bucket exists). */
  coffeeRunEProofFileAsset: "f0000000-0000-4000-8000-000000000045",
  coffeeRunEProofMedia: "f0000000-0000-4000-8000-000000000046",
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
  coffeeRunEProof: "public-test-coffee-run-e-proof",
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
  // Feature 010 RUN E (T023): a dedicated DRAFT coffee the admin console publishes and unpublishes in
  // its live public-cache proof. It deliberately carries NO canary description (it is meant to be
  // publicly visible while published) and is restored to DRAFT by `--reset-run-e-catalogue-fixture`.
  await upsert("coffees", {
    id: CATALOGUE_IDS.coffeeRunEProof,
    origin_id: CATALOGUE_IDS.originActive,
    coffee_type_id: CATALOGUE_IDS.coffeeType,
    name: "Public Test Coffee — Run E Proof",
    slug: CATALOGUE_SLUGS.coffeeRunEProof,
    description: "Feature 010 RUN E publish/unpublish proof coffee. Safe to publish transiently.",
    status: "DRAFT",
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
    CATALOGUE_IDS.coffeeRunEProof,
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
  await deleteByIds("coffee_media", "id", [CATALOGUE_IDS.coffeeRunEProofMedia]);
  await deleteByIds("coffees", "id", coffeeIds);
  await deleteByIds("file_assets", "id", [CATALOGUE_IDS.coffeeRunEProofFileAsset]);
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
  // re-asserts it at SUBMITTED), so only `status`/`submitted_at` need resetting here. Feature 010
  // RUN B: a compliance DECISION also stamps `decided_at`/`decided_by`/`rejection_reason` and may
  // move the ORGANIZATION (PENDING_KYB → ACTIVE/REJECTED), so those are restored to canonical too.
  // History rows (`kyb_reviews`, `account_status_history`, `audit_logs`) are never deleted.
  const { data, error } = await admin
    .from("kyb_applications")
    .update({ status: "DRAFT", submitted_at: null, decided_at: null, decided_by: null, rejection_reason: null })
    .eq("id", PHASE89_KYB_APPLICATION_IDS.completeDraft)
    .select("id")
    .maybeSingle();

  if (error) throw new SafeFixtureError("fixture application reset failed.");
  if (!data) throw new Error("complete-draft fixture is missing; run npm run test:seed first");

  // Feature 010 RUN E: a live test may have staged one required document (see
  // `stageCompleteDraftDocument`); restore its canonical ACCEPTED / no-expiry state.
  const { error: documentError } = await admin.from("kyb_documents").update({ status: "ACCEPTED", expires_at: null }).eq("id", COMPLETE_DRAFT_DOCUMENT_IDS.TRADE_LICENSE.documentId).neq("status", "SUPERSEDED");
  if (documentError) throw new SafeFixtureError("fixture document reset failed.");

  const { error: organizationError } = await admin
    .from("organizations")
    .update({ status: "PENDING_KYB" })
    .eq("id", PHASE89_ORGANIZATION_IDS.completeDraft);
  if (organizationError) throw new SafeFixtureError("fixture organization reset failed.");
}

/**
 * Feature 010 RUN B (T010) restore control: the `suspended` fixture's canonical state is
 * organization `SUSPENDED` with an `APPROVED` application. A compliance suspension/reinstatement
 * proof moves both; this restores both (history rows retained).
 */
async function resetSuspendedFixture(admin: SupabaseClient): Promise<void> {
  const { error: applicationError } = await admin
    .from("kyb_applications")
    .update({ status: "APPROVED", rejection_reason: null })
    .eq("id", PHASE89_KYB_APPLICATION_IDS.suspended);
  if (applicationError) throw new SafeFixtureError("suspended fixture application reset failed.");
  await setSuspendedOrganizationStatus(admin, "SUSPENDED");
}

/**
 * Feature 010 RUN J (T010 / DB-OPEN-22) — read-only proof snapshot for the `suspended` fixture:
 * the organization, its application, its `account_status_history` and `kyb_reviews` rows (history is
 * never deleted — counts only grow), and a fingerprint of EVERY OTHER organization's
 * id/status/updated_at/can_buy/can_sell so a run can prove no unrelated organization changed.
 * Service-role inspection only (a pure COMPLIANCE role cannot read `account_status_history` —
 * that policy is intentionally unchanged).
 */
/**
 * Reads EVERY row of an append-only history for the T010 snapshots. PostgREST caps a single response at 1000 rows, and these
 * tables only ever grow (every live run appends), so an un-paginated read silently truncates once a fixture organization passes
 * 1000 history rows and the tests' positional "rows appended since the snapshot" comparison then sees nothing.
 */
async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ data: T[] | null; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return { data: rows, error: null };
  }
}

async function inspectSuspendedOrganization(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const organizationId = PHASE89_ORGANIZATION_IDS.suspended;
  const applicationId = PHASE89_KYB_APPLICATION_IDS.suspended;
  const [organization, application, history, reviews, others] = await Promise.all([
    admin.from("organizations").select("id, status, legal_name, tax_number, can_buy, can_sell, updated_at").eq("id", organizationId).single(),
    admin.from("kyb_applications").select("id, status, rejection_reason, decided_by").eq("id", applicationId).single(),
    readAllRows((from, to) => admin.from("account_status_history").select("id, old_status, new_status, changed_by, reason, created_at").eq("organization_id", organizationId).order("created_at").order("id").range(from, to)),
    readAllRows((from, to) => admin.from("kyb_reviews").select("id, decision, reviewer_user_id, reason, created_at").eq("application_id", applicationId).order("created_at").order("id").range(from, to)),
    admin.from("organizations").select("id, status, updated_at, can_buy, can_sell").neq("id", organizationId).order("id"),
  ]);
  if (organization.error || application.error || history.error || reviews.error || others.error) {
    throw new SafeFixtureError("Feature 010 T010 suspended-organization inspection failed.");
  }
  const { data: canBuy, error: canBuyError } = await admin.rpc("organization_can_buy", { p_organization_id: organizationId });
  if (canBuyError) throw new SafeFixtureError("Feature 010 T010 organization_can_buy probe failed.");
  return {
    organization: organization.data,
    application: application.data,
    organizationCanBuy: canBuy === true,
    accountStatusHistory: history.data,
    kybReviews: reviews.data,
    totalOrganizations: (others.data?.length ?? 0) + 1,
    otherOrganizationsFingerprint: JSON.stringify(others.data),
  };
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
  /**
   * Feature 010 RUN B (T011) — compliance listing-review fixtures. Each is a HILLS-owned listing on
   * its OWN dedicated lot (the `uq_active_offer_per_lot_owner` partial index allows only one active
   * offer per lot+owner, and `lotC` is already taken by `offerPublished`). `offerPendingReview` is
   * the queue row a compliance operator decides (APPROVED/REJECTED); `offerReviewLive` is the
   * PUBLISHED row a compliance operator suspends. `--reset-listing-review-fixtures` walks each back
   * to its canonical status through the trigger-permitted graph (history rows are retained).
   */
  lotE: "06000000-0000-4000-8000-00000000000b",
  hillsPositionE: "06000000-0000-4000-8000-00000000000c",
  offerPendingReview: "06000000-0000-4000-8000-00000000000d",
  lotF: "06000000-0000-4000-8000-00000000000e",
  hillsPositionF: "06000000-0000-4000-8000-00000000000f",
  offerReviewLive: "06000000-0000-4000-8000-000000000010",
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

  // Feature 010 RUN B (T011) — two more HILLS listings for compliance review, each on its own lot.
  for (const [lotId, positionId] of [
    [LISTING_FIXTURE_IDS.lotE, LISTING_FIXTURE_IDS.hillsPositionE],
    [LISTING_FIXTURE_IDS.lotF, LISTING_FIXTURE_IDS.hillsPositionF],
  ] as const) {
    await upsert("coffee_lots", {
      id: lotId,
      coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
      lot_code: `F010-REVIEW-${lotId.slice(-2)}`,
      total_quantity_kg: 100,
      status: "AVAILABLE",
      source_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    });
    await upsert("inventory_positions", {
      id: positionId,
      lot_id: lotId,
      owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
      warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
      available_quantity_kg: 100,
      reserved_quantity_kg: 0,
    });
  }
  await insertIfAbsent("coffee_offers", {
    id: LISTING_FIXTURE_IDS.offerPendingReview,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_id: LISTING_FIXTURE_IDS.lotE,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    seller_type: "HILLS",
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    title: "Feature 010 Fixture — Listing Awaiting Review",
    quantity_kg: 10,
    reserved_quantity_kg: 0,
    filled_quantity_kg: 0,
    price_per_kg: 11,
    currency: "USD",
    status: "PENDING_REVIEW",
    created_by: buyerAndSellerUserId,
  });
  await insertIfAbsent("coffee_offers", {
    id: LISTING_FIXTURE_IDS.offerReviewLive,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_id: LISTING_FIXTURE_IDS.lotF,
    seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    seller_type: "HILLS",
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    title: "Feature 010 Fixture — Live Listing For Suspension",
    quantity_kg: 10,
    reserved_quantity_kg: 0,
    filled_quantity_kg: 0,
    price_per_kg: 11,
    currency: "USD",
    status: "PUBLISHED",
    created_by: buyerAndSellerUserId,
  });

  console.log(
    `  seeded 1 inactive warehouse, 2 extra Org B positions, 1 dedicated lot+position, ` +
      `${createdPublished ? "1 published listing (new)" : "published listing (reused)"}, 1 sold-out listing, ` +
      `2 compliance-review listings (Feature 010).`
  );
}

/**
 * Feature 010 RUN B (T011) restore control: walks the two compliance-review listing fixtures back to
 * their canonical statuses through `validate_offer_transition`'s own permitted graph (never a raw
 * status overwrite the trigger would refuse), clearing `rejection_reason`. `listing_reviews` and
 * `listing_status_history` rows are never deleted (retained synthetic history, like every other
 * ledger in this file).
 */
async function resetListingReviewFixtures(admin: SupabaseClient): Promise<void> {
  const step = async (offerId: string, status: string): Promise<void> => {
    const { error } = await admin.from("coffee_offers").update({ status, rejection_reason: null }).eq("id", offerId);
    if (error) throw new SafeFixtureError(`listing review fixture reset failed (${status}): ${error.message}`);
  };
  const current = async (offerId: string): Promise<string> => {
    const { data, error } = await admin.from("coffee_offers").select("status").eq("id", offerId).maybeSingle();
    if (error || !data) throw new SafeFixtureError("listing review fixture is missing; run npm run test:seed first.");
    return data.status as string;
  };

  // offerPendingReview → PENDING_REVIEW. Permitted paths: REJECTED→DRAFT, APPROVED→ARCHIVED, and any
  // status with no trigger branch (SUSPENDED/ARCHIVED) → DRAFT; then DRAFT→PENDING_REVIEW.
  {
    const status = await current(LISTING_FIXTURE_IDS.offerPendingReview);
    if (status !== "PENDING_REVIEW") {
      if (status === "APPROVED") await step(LISTING_FIXTURE_IDS.offerPendingReview, "ARCHIVED");
      if (status !== "DRAFT") await step(LISTING_FIXTURE_IDS.offerPendingReview, "DRAFT");
      await step(LISTING_FIXTURE_IDS.offerPendingReview, "PENDING_REVIEW");
    } else {
      await step(LISTING_FIXTURE_IDS.offerPendingReview, "PENDING_REVIEW");
    }
  }
  // offerReviewLive → PUBLISHED. `validate_offer_transition` gates every UPDATE INTO
  // APPROVED/REJECTED/PUBLISHED/SUSPENDED on `is_compliance_operator()` (confirmed live:
  // `compliance_required_for_listing_state`), which a service-role session never satisfies — so this
  // privileged script deliberately does NOT force the row back to PUBLISHED. The compliance test
  // restores it through the real COMPLIANCE session (SUSPENDED→PUBLISHED has no trigger branch);
  // this command only reports the current status honestly.
  const liveStatus = await current(LISTING_FIXTURE_IDS.offerReviewLive);
  console.log(JSON.stringify({ listingReviewFixtures: "reset", offerPendingReview: "PENDING_REVIEW", offerReviewLive: liveStatus, offerReviewLiveRestoredByCompliance: liveStatus !== "PUBLISHED" }));
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

  await deleteByIds("coffee_offers", [LISTING_FIXTURE_IDS.offerPublished, LISTING_FIXTURE_IDS.offerSoldOut, LISTING_FIXTURE_IDS.offerPendingReview, LISTING_FIXTURE_IDS.offerReviewLive]);
  await deleteByIds("inventory_positions", [
    LISTING_FIXTURE_IDS.positionOrgBOnLotA,
    LISTING_FIXTURE_IDS.positionOrgBInactiveWarehouse,
    LISTING_FIXTURE_IDS.hillsPositionC,
    LISTING_FIXTURE_IDS.hillsPositionE,
    LISTING_FIXTURE_IDS.hillsPositionF,
  ]);
  await deleteByIds("coffee_lots", [LISTING_FIXTURE_IDS.lotC, LISTING_FIXTURE_IDS.lotE, LISTING_FIXTURE_IDS.lotF]);
  await deleteByIds("warehouses", [LISTING_FIXTURE_IDS.warehouseInactive]);

  console.log("  removed 2 listings (cascading their own status history), 3 positions, 1 lot, 1 warehouse.");
}

// ---------------------------------------------------------------------------
// Checkout fixtures — Feature 007 RUN B (T008–T011)
// ---------------------------------------------------------------------------

/**
 * A DEDICATED HILLS listing for the transactional checkout tests. `checkout_order()` genuinely
 * mutates `coffee_offers.reserved_quantity_kg`/`inventory_positions.reserved_quantity_kg` and
 * creates reservation/proforma/payment rows — running that against Feature 006's `offerPublished`
 * would break its own exact-number live assertions (100 / 15.5 / 24.5). This lot/position/offer
 * trio exists ONLY so checkout can be exercised against real rows nothing else asserts on.
 *
 * `--reset-checkout-fixtures` (test-only, service-role setup/teardown — the SAME approved
 * convention as `--set-suspended-organization-status`) deletes every order that references this
 * offer (cascading its items, shipments, financials, proforma, payment and reservation rows) and
 * restores the offer/position reserved quantities to zero, so the tests are deterministic across
 * repeated runs. `--inspect-checkout-order=<id>` prints a JSON integrity snapshot (reservation,
 * proforma, payment, ownership-event counts + the offer/position reserved mirror) — a TEST-ONLY
 * privileged read; no runtime code reads `inventory_reservations`.
 */
const CHECKOUT_FIXTURE_IDS = {
  lotD: "07000000-0000-4000-8000-000000000001",
  hillsPositionD: "07000000-0000-4000-8000-000000000002",
  offerCheckout: "07000000-0000-4000-8000-000000000003",
} as const;

const CHECKOUT_FIXTURE_QUANTITY_KG = 50;

async function seedCheckoutFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nSeeding 007-orders-checkout-reservations RUN B checkout fixtures…\n");

  const buyerAndSellerUserId = await findAuthUserIdByEmail(admin, FIXTURES[1]!.email);
  if (!buyerAndSellerUserId) throw new SafeFixtureError("001 identity fixtures are missing; run npm run test:seed first.");

  const upsert = async (table: string, row: Record<string, unknown>): Promise<void> => {
    const { error } = await admin.from(table).upsert(row, { onConflict: "id" });
    if (error) throw new SafeFixtureError(`${table} upsert failed (Feature 007): ${error.message}`);
  };

  await upsert("coffee_lots", {
    id: CHECKOUT_FIXTURE_IDS.lotD,
    coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
    lot_code: "F007-LOT-D",
    total_quantity_kg: 1000,
    status: "AVAILABLE",
    source_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
  });
  await upsert("inventory_positions", {
    id: CHECKOUT_FIXTURE_IDS.hillsPositionD,
    lot_id: CHECKOUT_FIXTURE_IDS.lotD,
    owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
    available_quantity_kg: 1000,
    reserved_quantity_kg: 0,
  });

  const { data: existing } = await admin.from("coffee_offers").select("id").eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout).maybeSingle();
  if (!existing) {
    const { error } = await admin.from("coffee_offers").insert({
      id: CHECKOUT_FIXTURE_IDS.offerCheckout,
      coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
      lot_id: CHECKOUT_FIXTURE_IDS.lotD,
      seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
      seller_type: "HILLS",
      warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
      title: "Feature 007 Fixture — Checkout Listing",
      quantity_kg: CHECKOUT_FIXTURE_QUANTITY_KG,
      reserved_quantity_kg: 0,
      filled_quantity_kg: 0,
      price_per_kg: 10,
      currency: "USD",
      status: "PUBLISHED",
      created_by: buyerAndSellerUserId,
    });
    if (error) throw new SafeFixtureError(`coffee_offers insert failed (Feature 007): ${error.message}`);
  }

  console.log("  seeded 1 dedicated lot+position and 1 PUBLISHED checkout listing.");
}

/** Deletes every order that references the checkout listing, then restores its reserved mirrors to zero. */
async function resetCheckoutFixtures(admin: SupabaseClient): Promise<void> {
  const { data: items, error: itemsError } = await admin.from("order_items").select("order_id").eq("offer_id", CHECKOUT_FIXTURE_IDS.offerCheckout);
  if (itemsError) throw new SafeFixtureError(`order_items lookup failed (Feature 007 reset): ${itemsError.message}`);
  const orderIds = [...new Set((items ?? []).map((row) => row.order_id as string))];

  if (orderIds.length > 0) {
    // `proforma_invoice_items.order_item_id` has NO cascade (confirmed live) — it would block the
    // `orders -> order_items` cascade, so the proforma items are removed explicitly first.
    const { data: proformas, error: proformaError } = await admin.from("proforma_invoices").select("id").in("order_id", orderIds);
    if (proformaError) throw new SafeFixtureError(`proforma_invoices lookup failed (Feature 007 reset): ${proformaError.message}`);
    const proformaIds = (proformas ?? []).map((row) => row.id as string);
    if (proformaIds.length > 0) {
      const { error: itemsDeleteError } = await admin.from("proforma_invoice_items").delete().in("proforma_id", proformaIds);
      if (itemsDeleteError) throw new SafeFixtureError(`proforma_invoice_items delete failed (Feature 007 reset): ${itemsDeleteError.message}`);
    }

    const { error } = await admin.from("orders").delete().in("id", orderIds);
    if (error) throw new SafeFixtureError(`orders delete failed (Feature 007 reset): ${error.message}`);
  }

  const { error: offerError } = await admin
    .from("coffee_offers")
    .update({ reserved_quantity_kg: 0, filled_quantity_kg: 0, status: "PUBLISHED" })
    .eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout);
  if (offerError) throw new SafeFixtureError(`coffee_offers reset failed (Feature 007 reset): ${offerError.message}`);

  const { error: positionError } = await admin
    .from("inventory_positions")
    .update({ reserved_quantity_kg: 0, available_quantity_kg: 1000 })
    .eq("id", CHECKOUT_FIXTURE_IDS.hillsPositionD);
  if (positionError) throw new SafeFixtureError(`inventory_positions reset failed (Feature 007 reset): ${positionError.message}`);

  console.log(JSON.stringify({ removedOrders: orderIds.length }));
}

/** TEST-ONLY privileged integrity snapshot for one order (printed as a single JSON line). */
async function inspectCheckoutOrder(admin: SupabaseClient, orderId: string): Promise<void> {
  const [reservations, proformas, payments, ownershipEvents, offer, position, financials, statusHistory, lotOwnershipEvents, order, orderAudit] = await Promise.all([
    admin.from("inventory_reservations").select("id, status, expires_at").eq("order_id", orderId),
    admin.from("proforma_invoices").select("id, proforma_code, status").eq("order_id", orderId),
    admin.from("payments").select("id, status, amount").eq("order_id", orderId),
    admin.from("inventory_ownership_events").select("id", { count: "exact", head: true }),
    admin.from("coffee_offers").select("reserved_quantity_kg, filled_quantity_kg, status").eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout).single(),
    admin.from("inventory_positions").select("reserved_quantity_kg, available_quantity_kg, owner_organization_id").eq("id", CHECKOUT_FIXTURE_IDS.hillsPositionD).single(),
    // Feature 007 RUN D (T019/T020) — the financial snapshot cardinality and the transition history.
    admin.from("order_financials").select("order_id, buyer_total_amount, base_subtotal, calculated_at").eq("order_id", orderId),
    admin.from("order_status_history").select("old_status, new_status, created_at").eq("order_id", orderId).order("created_at", { ascending: true }),
    // Feature 007 RUN D (T023) — ownership/title events scoped to the dedicated checkout lot.
    admin.from("inventory_ownership_events").select("id", { count: "exact", head: true }).eq("lot_id", CHECKOUT_FIXTURE_IDS.lotD),
    admin.from("orders").select("status, hold_started_at, hold_expires_at, idempotency_key, correlation_id").eq("id", orderId).maybeSingle(),
    // Feature 007 RUN D (T020) — every persisted version of the order row (`write_audit_log` records
    // old/new jsonb on each UPDATE), so a test can prove the server-owned intent key was never rotated.
    admin.from("audit_logs").select("new_data, created_at").eq("entity_type", "orders").eq("entity_id", orderId).order("created_at", { ascending: true }),
  ]);
  for (const result of [reservations, proformas, payments, ownershipEvents, offer, position, financials, statusHistory, lotOwnershipEvents, order, orderAudit]) {
    if (result.error) throw new SafeFixtureError("Checkout inspection read failed (Feature 007).");
  }

  const reservationIds = (reservations.data ?? []).map((row) => row.id as string);
  let reservationItems: Array<{ quantity_kg: number; offer_id: string }> = [];
  if (reservationIds.length > 0) {
    const { data, error } = await admin.from("inventory_reservation_items").select("quantity_kg, offer_id").in("reservation_id", reservationIds);
    if (error) throw new SafeFixtureError("Checkout inspection read failed (Feature 007).");
    reservationItems = (data ?? []) as Array<{ quantity_kg: number; offer_id: string }>;
  }

  console.log(
    JSON.stringify({
      reservations: reservations.data ?? [],
      reservationItems,
      proformas: proformas.data ?? [],
      payments: payments.data ?? [],
      ownershipEventCount: ownershipEvents.count ?? 0,
      offer: offer.data,
      position: position.data,
      financials: financials.data ?? [],
      statusHistory: statusHistory.data ?? [],
      lotOwnershipEventCount: lotOwnershipEvents.count ?? 0,
      order: order.data ?? null,
      idempotencyKeyHistory: [
        ...new Set(
          (orderAudit.data ?? [])
            .map((row) => (row.new_data as { idempotency_key?: string | null } | null)?.idempotency_key ?? null)
            .filter((key): key is string => typeof key === "string")
        ),
      ],
    })
  );
}

/**
 * Feature 007 RUN D (T022) — TEST-ONLY privileged mirror snapshot for the dedicated checkout
 * listing: the listing mirror (`coffee_offers.reserved_quantity_kg`), the inventory source of truth
 * (`inventory_positions.reserved_quantity_kg`), and the authoritative reservation rows behind them
 * (the sum of ACTIVE `inventory_reservation_items` for this offer and for this position). Read-only.
 */
async function inspectCheckoutMirrors(admin: SupabaseClient): Promise<void> {
  const [offer, position, activeReservations] = await Promise.all([
    admin.from("coffee_offers").select("quantity_kg, reserved_quantity_kg, filled_quantity_kg, status").eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout).single(),
    admin.from("inventory_positions").select("available_quantity_kg, reserved_quantity_kg").eq("id", CHECKOUT_FIXTURE_IDS.hillsPositionD).single(),
    admin.from("inventory_reservations").select("id").eq("status", "ACTIVE"),
  ]);
  for (const result of [offer, position, activeReservations]) {
    if (result.error) throw new SafeFixtureError("Checkout mirror inspection read failed (Feature 007).");
  }

  const activeIds = (activeReservations.data ?? []).map((row) => row.id as string);
  let items: Array<{ reservation_id: string; offer_id: string; inventory_position_id: string | null; quantity_kg: number }> = [];
  if (activeIds.length > 0) {
    const { data, error } = await admin.from("inventory_reservation_items").select("reservation_id, offer_id, inventory_position_id, quantity_kg").in("reservation_id", activeIds);
    if (error) throw new SafeFixtureError("Checkout mirror inspection read failed (Feature 007).");
    items = (data ?? []) as typeof items;
  }
  const offerItems = items.filter((item) => item.offer_id === CHECKOUT_FIXTURE_IDS.offerCheckout);
  const positionItems = items.filter((item) => item.inventory_position_id === CHECKOUT_FIXTURE_IDS.hillsPositionD);

  console.log(
    JSON.stringify({
      offer: offer.data,
      position: position.data,
      activeReservationItemsForOfferKg: offerItems.reduce((total, item) => total + Number(item.quantity_kg), 0),
      activeReservationItemsForPositionKg: positionItems.reduce((total, item) => total + Number(item.quantity_kg), 0),
      activeReservationCountForOffer: new Set(offerItems.map((item) => item.reservation_id)).size,
    })
  );
}

/**
 * TEST-ONLY "force expiry" (spec 007 PS4's own independent-test wording: "create a hold, force
 * expiry, trigger the expiry path"). Backdates ONLY the order's ACTIVE `inventory_reservations.
 * expires_at` — the one column `expire_order_hold()` actually consults — to one minute ago.
 * `orders.hold_expires_at` is deliberately NOT touched: it cannot be (DB-OPEN-15 —
 * `validate_order_transition` refuses every UPDATE that leaves an order in `HOLD`), and the
 * application's staleness check therefore uses a caller-supplied reference instant in tests. This
 * simulates the passage of 20 minutes; it does not release anything itself — the release still
 * happens only inside `expire_order_hold()`, exactly as in production.
 */
async function ageCheckoutHold(admin: SupabaseClient, orderId: string): Promise<void> {
  const pastIso = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await admin.from("inventory_reservations").update({ expires_at: pastIso }).eq("order_id", orderId).eq("status", "ACTIVE").select("id");
  if (error) throw new SafeFixtureError(`inventory_reservations backdate failed (Feature 007 test setup): ${error.message}`);
  console.log(JSON.stringify({ agedReservations: (data ?? []).length }));
}

/**
 * Feature 007 DB blocker run (DB-OPEN-16 hardening) — TEST-ONLY negative probe, same precedent as
 * `--verify-inventory-append-only`: attempts, with the most privileged table writer available (the
 * service role, which bypasses RLS), a DIRECT `coffee_offers` UPDATE that has exactly the reservation-only
 * shape checkout_order() produces — status/quantity/filled unchanged, reserved increased to leave zero
 * unreserved — but WITHOUT checkout_order()'s transaction-local marker. `validate_offer_transition` must
 * refuse it with cannot_publish_empty_listing. If it were ever accepted, the previous reserved value is
 * restored immediately (a decrease, always permitted) and `restored: true` is reported so the test fails.
 */
async function probeDirectFullReservation(admin: SupabaseClient): Promise<void> {
  const { data: before, error: readError } = await admin
    .from("coffee_offers")
    .select("quantity_kg, filled_quantity_kg, reserved_quantity_kg, status")
    .eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout)
    .single();
  if (readError || !before) throw new SafeFixtureError("Checkout listing read failed (Feature 007 probe).");

  const fullReservation = Number(before.quantity_kg) - Number(before.filled_quantity_kg);
  const { error } = await admin.from("coffee_offers").update({ reserved_quantity_kg: fullReservation }).eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout);

  let restored = false;
  if (!error) {
    const { error: restoreError } = await admin.from("coffee_offers").update({ reserved_quantity_kg: before.reserved_quantity_kg }).eq("id", CHECKOUT_FIXTURE_IDS.offerCheckout);
    if (restoreError) throw new SafeFixtureError("Probe restore failed (Feature 007) — reset the checkout fixtures.");
    restored = true;
  }

  console.log(JSON.stringify({ refused: error !== null, message: error?.message ?? null, restored, reservedBefore: Number(before.reserved_quantity_kg), attemptedReserved: fullReservation, status: before.status }));
}

async function teardownCheckoutFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nTearing down 007-orders-checkout-reservations checkout fixtures…\n");
  await resetCheckoutFixtures(admin);
  const deleteByIds = async (table: string, ids: readonly string[]): Promise<void> => {
    const { error } = await admin.from(table).delete().in("id", ids);
    if (error) throw new SafeFixtureError(`${table} delete failed (Feature 007): ${error.message}`);
  };
  await deleteByIds("coffee_offers", [CHECKOUT_FIXTURE_IDS.offerCheckout]);
  await deleteByIds("inventory_positions", [CHECKOUT_FIXTURE_IDS.hillsPositionD]);
  await deleteByIds("coffee_lots", [CHECKOUT_FIXTURE_IDS.lotD]);
  console.log("  removed 1 checkout listing, 1 position, 1 lot.");
}

// ---------------------------------------------------------------------------
// 009-delivery-shipments RUN A2 T013 fixtures
// ---------------------------------------------------------------------------

/**
 * Two DEDICATED listings for Feature 009's live delivery-reservation/settlement proof (T013),
 * deliberately separate from Feature 007's own `CHECKOUT_FIXTURE_IDS.offerCheckout` (its own header
 * warns reuse breaks its exact-number live assertions) and sized for two different purposes:
 *   - `offerDeliveryMain` (200kg): the shared listing for every positive-path scenario.
 *   - `offerDeliveryScarce` (5kg): a deliberately small-capacity listing for the insufficient-
 *     inventory-at-settlement negative case (T013 item 8), engineered independently so it can never
 *     interfere with the main listing's own assertions.
 * T013 cleanup is intentionally narrower than a generic "orders referencing offer" operation. It
 * accepts only rows that prove they belong to the two dedicated lots/offers AND to a `T013-ORD-`
 * order created by one of the documented buyer fixtures. An unknown row on either fixture offer
 * stops cleanup before any DELETE. `--inspect-delivery-*` are TEST-ONLY privileged reads, the same
 * approved convention as Feature 007's own `inspectCheckoutOrder`/`inspectCheckoutMirrors`.
 */
const DELIVERY_FIXTURE_IDS = {
  lotMain: "09000000-0000-4000-8000-000000000001",
  hillsPositionMain: "09000000-0000-4000-8000-000000000002",
  offerDeliveryMain: "09000000-0000-4000-8000-000000000003",
  lotScarce: "09000000-0000-4000-8000-000000000004",
  hillsPositionScarce: "09000000-0000-4000-8000-000000000005",
  offerDeliveryScarce: "09000000-0000-4000-8000-000000000006",
} as const;

const DELIVERY_FIXTURE_QUANTITY_KG = { main: 200, scarce: 5 } as const;

async function seedDeliveryFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nSeeding 009-delivery-shipments RUN A2 T013 delivery fixtures…\n");

  const upsert = async (table: string, row: Record<string, unknown>): Promise<void> => {
    const { error } = await admin.from(table).upsert(row, { onConflict: "id" });
    if (error) throw new SafeFixtureError(`${table} upsert failed (Feature 009): ${error.message}`);
  };
  const buyerAndSellerUserId = await findAuthUserIdByEmail(admin, FIXTURES[1]!.email);
  if (!buyerAndSellerUserId) throw new SafeFixtureError("001 identity fixtures are missing; run npm run test:seed first.");

  const seedListing = async (lotId: string, positionId: string, offerId: string, lotCode: string, quantityKg: number, title: string): Promise<void> => {
    await upsert("coffee_lots", {
      id: lotId,
      coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
      lot_code: lotCode,
      total_quantity_kg: Math.max(quantityKg, 1000),
      status: "AVAILABLE",
      source_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
    });
    await upsert("inventory_positions", {
      id: positionId,
      lot_id: lotId,
      owner_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
      warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
      available_quantity_kg: Math.max(quantityKg, 1000),
      reserved_quantity_kg: 0,
    });
    const { data: existing } = await admin.from("coffee_offers").select("id").eq("id", offerId).maybeSingle();
    if (!existing) {
      const { error } = await admin.from("coffee_offers").insert({
        id: offerId,
        coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
        lot_id: lotId,
        seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
        seller_type: "HILLS",
        warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
        title,
        quantity_kg: quantityKg,
        reserved_quantity_kg: 0,
        filled_quantity_kg: 0,
        price_per_kg: 10,
        currency: "USD",
        status: "PUBLISHED",
        created_by: buyerAndSellerUserId,
      });
      if (error) throw new SafeFixtureError(`coffee_offers insert failed (Feature 009, ${lotCode}): ${error.message}`);
    }
  };

  await seedListing(DELIVERY_FIXTURE_IDS.lotMain, DELIVERY_FIXTURE_IDS.hillsPositionMain, DELIVERY_FIXTURE_IDS.offerDeliveryMain, "F009-LOT-MAIN", DELIVERY_FIXTURE_QUANTITY_KG.main, "Feature 009 Fixture — Delivery Main Listing");
  await seedListing(DELIVERY_FIXTURE_IDS.lotScarce, DELIVERY_FIXTURE_IDS.hillsPositionScarce, DELIVERY_FIXTURE_IDS.offerDeliveryScarce, "F009-LOT-SCARCE", DELIVERY_FIXTURE_QUANTITY_KG.scarce, "Feature 009 Fixture — Delivery Scarce Listing");

  console.log("  seeded 2 dedicated lot+position pairs and 2 PUBLISHED delivery listings (200kg main, 5kg scarce).");
}

const T013_ORDER_PREFIX = "T013-ORD-";
const T013_SHIPMENT_PREFIX = "T013-SHP-";
const T013_PAYMENT_PROOF_PREFIX = "t013-payment-proofs/";
const T013_RESALE_DENIAL_TITLE = "T013 Fixture — delivery-reserved resale denial";

type T013FixtureActors = {
  buyerOnlyUserId: string;
  buyerAndSellerUserId: string;
};

type T013Residue = {
  scopeProblems: string[];
  orders: Array<{ id: string; order_code: string; buyer_organization_id: string; created_by: string; status: string }>;
  orderItems: Array<{ id: string; order_id: string; offer_id: string; lot_id: string; seller_organization_id: string }>;
  allDeliveryOfferItems: Array<{ id: string; order_id: string; offer_id: string; lot_id: string }>;
  resaleOffers: Array<{ id: string; source_purchase_order_item_id: string | null; lot_id: string; seller_organization_id: string; created_by: string; title: string | null }>;
  shipments: Array<{ id: string; order_id: string; shipment_code: string; created_by: string }>;
  shipmentItems: Array<{ id: string; shipment_id: string; order_item_id: string }>;
  proformas: Array<{ id: string; order_id: string }>;
  storageAllocations: Array<{ id: string; order_item_id: string | null; owner_organization_id: string; lot_id: string; warehouse_id: string; warehouse_location_id: string | null }>;
  payouts: Array<{ id: string; order_id: string }>;
  taxInvoices: Array<{ id: string; order_id: string }>;
  paymentProofAssets: Array<{ id: string; object_path: string; bucket_name: string; uploaded_by: string | null; organization_id: string | null }>;
  buyerPositions: Array<{ id: string; lot_id: string; owner_organization_id: string; warehouse_id: string | null; warehouse_location_id: string | null }>;
  immutableOwnershipEvents: Array<{ id: string; order_item_id: string | null }>;
};

const deliveryOfferIds = [DELIVERY_FIXTURE_IDS.offerDeliveryMain, DELIVERY_FIXTURE_IDS.offerDeliveryScarce] as const;
const deliveryLotIds = [DELIVERY_FIXTURE_IDS.lotMain, DELIVERY_FIXTURE_IDS.lotScarce] as const;
const t013BuyerOrganizationIds = [ORGANIZATION_IDS.buyerOnly, ORGANIZATION_IDS.buyerAndSeller] as const;

async function getT013FixtureActors(admin: SupabaseClient): Promise<T013FixtureActors> {
  const [buyerOnlyUserId, buyerAndSellerUserId] = await Promise.all([
    findAuthUserIdByEmail(admin, FIXTURES[0]!.email),
    findAuthUserIdByEmail(admin, FIXTURES[1]!.email),
  ]);
  if (!buyerOnlyUserId || !buyerAndSellerUserId) {
    throw new SafeFixtureError("T013 buyer fixtures are missing; run npm run test:seed first.");
  }
  return { buyerOnlyUserId, buyerAndSellerUserId };
}

function throwT013ReadError(): never {
  throw new SafeFixtureError("T013 fixture cleanup inspection failed; no cleanup was performed.");
}

/**
 * Reads the entire, deliberately small T013 cleanup scope before any mutation. Every later DELETE is
 * by an exact id array captured here; this function deliberately does not accept arbitrary ids.
 */
async function readT013Residue(admin: SupabaseClient): Promise<T013Residue> {
  const actors = await getT013FixtureActors(admin);
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, order_code, buyer_organization_id, created_by, status")
    .like("order_code", `${T013_ORDER_PREFIX}%`)
    .order("id", { ascending: true });
  if (ordersError) throwT013ReadError();
  const orderRows = orders ?? [];
  const orderIds = orderRows.map((row) => row.id);

  const { data: allDeliveryOfferItems, error: allDeliveryOfferItemsError } = await admin
    .from("order_items")
    .select("id, order_id, offer_id, lot_id")
    .in("offer_id", [...deliveryOfferIds]);
  if (allDeliveryOfferItemsError) throwT013ReadError();

  const emptyResidue: T013Residue = {
    scopeProblems: [],
    orders: orderRows,
    orderItems: [],
    allDeliveryOfferItems: allDeliveryOfferItems ?? [],
    resaleOffers: [],
    shipments: [],
    shipmentItems: [],
    proformas: [],
    storageAllocations: [],
    payouts: [],
    taxInvoices: [],
    paymentProofAssets: [],
    buyerPositions: [],
    immutableOwnershipEvents: [],
  };
  if (orderIds.length === 0) {
    const { data: assets, error: assetsError } = await admin
      .from("file_assets")
      .select("id, object_path, bucket_name, uploaded_by, organization_id")
      .like("object_path", `${T013_PAYMENT_PROOF_PREFIX}%`);
    if (assetsError) throwT013ReadError();
    const { data: positions, error: positionsError } = await admin
      .from("inventory_positions")
      .select("id, lot_id, owner_organization_id, warehouse_id, warehouse_location_id")
      .in("lot_id", [...deliveryLotIds])
      .in("owner_organization_id", [...t013BuyerOrganizationIds]);
    if (positionsError) throwT013ReadError();
    // Feature 005 T014 / DB-OPEN-19: a position with append-only variance history can never be deleted (FK ON DELETE RESTRICT) and is
    // retained by design — it is not "residue without a tagged order".
    const retainedIds = await positionsWithVarianceHistory(admin, (positions ?? []).map((row) => row.id));
    const removablePositions = (positions ?? []).filter((row) => !retainedIds.has(row.id));
    const scopeProblems: string[] = [];
    if ((allDeliveryOfferItems ?? []).length > 0) scopeProblems.push("delivery offer item is not attached to a tagged T013 order");
    if ((assets ?? []).length > 0) scopeProblems.push("tagged T013 payment-proof metadata has no tagged T013 order");
    if (removablePositions.length > 0) scopeProblems.push("buyer delivery position exists without a tagged T013 order");
    return { ...emptyResidue, scopeProblems, paymentProofAssets: assets ?? [], buyerPositions: removablePositions };
  }

  const [itemsResult, shipmentsResult, proformasResult, payoutsResult, taxInvoicesResult] = await Promise.all([
    admin.from("order_items").select("id, order_id, offer_id, lot_id, seller_organization_id").in("order_id", orderIds),
    admin.from("order_shipments").select("id, order_id, shipment_code, created_by").in("order_id", orderIds),
    admin.from("proforma_invoices").select("id, order_id").in("order_id", orderIds),
    admin.from("payouts").select("id, order_id").in("order_id", orderIds),
    admin.from("tax_invoices").select("id, order_id").in("order_id", orderIds),
  ]);
  if (itemsResult.error || shipmentsResult.error || proformasResult.error || payoutsResult.error || taxInvoicesResult.error) throwT013ReadError();
  const orderItems = itemsResult.data ?? [];
  const shipmentRows = shipmentsResult.data ?? [];
  const orderItemIds = orderItems.map((row) => row.id);
  const shipmentIds = shipmentRows.map((row) => row.id);

  const [shipmentItemsResult, allocationsResult, eventsResult, resaleOffersResult, assetsResult, positionsResult] = await Promise.all([
    shipmentIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin.from("shipment_items").select("id, shipment_id, order_item_id").in("shipment_id", shipmentIds),
    orderItemIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin.from("storage_allocations").select("id, order_item_id, owner_organization_id, lot_id, warehouse_id, warehouse_location_id").in("order_item_id", orderItemIds),
    orderItemIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin.from("inventory_ownership_events").select("id, order_item_id").in("order_item_id", orderItemIds),
    orderItemIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin.from("coffee_offers").select("id, source_purchase_order_item_id, lot_id, seller_organization_id, created_by, title").in("source_purchase_order_item_id", orderItemIds),
    admin.from("file_assets").select("id, object_path, bucket_name, uploaded_by, organization_id").like("object_path", `${T013_PAYMENT_PROOF_PREFIX}%`),
    admin.from("inventory_positions").select("id, lot_id, owner_organization_id, warehouse_id, warehouse_location_id").in("lot_id", [...deliveryLotIds]).in("owner_organization_id", [...t013BuyerOrganizationIds]),
  ]);
  if (shipmentItemsResult.error || allocationsResult.error || eventsResult.error || resaleOffersResult.error || assetsResult.error || positionsResult.error) throwT013ReadError();

  const retainedPositionIds = await positionsWithVarianceHistory(admin, (positionsResult.data ?? []).map((row) => row.id));

  const residue: T013Residue = {
    scopeProblems: [],
    orders: orderRows,
    orderItems,
    allDeliveryOfferItems: allDeliveryOfferItems ?? [],
    resaleOffers: resaleOffersResult.data ?? [],
    shipments: shipmentRows,
    shipmentItems: shipmentItemsResult.data ?? [],
    proformas: proformasResult.data ?? [],
    storageAllocations: allocationsResult.data ?? [],
    payouts: payoutsResult.data ?? [],
    taxInvoices: taxInvoicesResult.data ?? [],
    paymentProofAssets: assetsResult.data ?? [],
    buyerPositions: (positionsResult.data ?? []).filter((row) => !retainedPositionIds.has(row.id)), // variance history is retained by design (see above)
    immutableOwnershipEvents: eventsResult.data ?? [],
  };

  const permittedUsers = new Set([actors.buyerOnlyUserId, actors.buyerAndSellerUserId]);
  const permittedOrganizations = new Set(t013BuyerOrganizationIds);
  const permittedOrders = new Set(orderIds);
  const permittedItems = new Set(orderItemIds);
  const permittedShipments = new Set(shipmentIds);
  const expectedPaymentProofPaths = new Set(orderIds.map((orderId) => `${T013_PAYMENT_PROOF_PREFIX}${orderId}.metadata`));

  if (residue.orders.some((row) => !row.order_code.startsWith(T013_ORDER_PREFIX) || !permittedOrganizations.has(row.buyer_organization_id as (typeof t013BuyerOrganizationIds)[number]) || !permittedUsers.has(row.created_by))) residue.scopeProblems.push("tagged order identity is not one of the two documented buyer fixtures");
  if (residue.allDeliveryOfferItems.some((row) => !permittedOrders.has(row.order_id))) residue.scopeProblems.push("delivery offer item is not attached to a tagged T013 order");
  if (residue.orderItems.some((row) => !permittedOrders.has(row.order_id) || !deliveryOfferIds.includes(row.offer_id as (typeof deliveryOfferIds)[number]) || !deliveryLotIds.includes(row.lot_id as (typeof deliveryLotIds)[number]) || row.seller_organization_id !== INVENTORY_FIXTURE_IDS.hillsOrg)) residue.scopeProblems.push("tagged order item does not match the two dedicated Hills delivery fixtures");
  if (residue.shipments.some((row) => !permittedOrders.has(row.order_id) || !row.shipment_code.startsWith(T013_SHIPMENT_PREFIX) || !permittedUsers.has(row.created_by))) residue.scopeProblems.push("tagged shipment identity does not match the documented T013 scope");
  if (residue.shipmentItems.some((row) => !permittedShipments.has(row.shipment_id) || !permittedItems.has(row.order_item_id))) residue.scopeProblems.push("tagged shipment item is not linked to its exact tagged parent");
  if (residue.resaleOffers.some((row) => !permittedItems.has(row.source_purchase_order_item_id ?? "") || row.lot_id !== DELIVERY_FIXTURE_IDS.lotMain || row.seller_organization_id !== ORGANIZATION_IDS.buyerAndSeller || row.created_by !== actors.buyerAndSellerUserId || row.title !== T013_RESALE_DENIAL_TITLE)) residue.scopeProblems.push("T013 resale control listing does not match its exact documented identity");
  if (residue.storageAllocations.some((row) => !permittedItems.has(row.order_item_id ?? "") || !permittedOrganizations.has(row.owner_organization_id as (typeof t013BuyerOrganizationIds)[number]) || !deliveryLotIds.includes(row.lot_id as (typeof deliveryLotIds)[number]) || row.warehouse_id !== INVENTORY_FIXTURE_IDS.warehouse || row.warehouse_location_id !== null)) residue.scopeProblems.push("T013 storage allocation is not attached to the exact fixture ownership/custody key");
  if (residue.payouts.length > 0) residue.scopeProblems.push("unexpected T013 payout exists; this driver only uses Hills seller fixtures");
  if (residue.taxInvoices.length > 0) residue.scopeProblems.push("unexpected T013 tax invoice exists");
  if (residue.paymentProofAssets.some((row) => !expectedPaymentProofPaths.has(row.object_path) || row.bucket_name !== "t013-test-artifacts" || row.uploaded_by === null || row.organization_id === null)) residue.scopeProblems.push("T013 payment-proof metadata does not match its exact fixture path or owner");
  if (residue.buyerPositions.some((row) => !permittedOrganizations.has(row.owner_organization_id as (typeof t013BuyerOrganizationIds)[number]) || row.warehouse_id !== INVENTORY_FIXTURE_IDS.warehouse || row.warehouse_location_id !== null)) residue.scopeProblems.push("buyer delivery position does not match the exact fixture custody key");

  return residue;
}

function t013ResidueSummary(residue: T013Residue): Record<string, unknown> {
  const statusCounts = residue.orders.reduce<Record<string, number>>((counts, order) => {
    counts[order.status] = (counts[order.status] ?? 0) + 1;
    return counts;
  }, {});
  return {
    taggedOrders: residue.orders.length,
    orderStatusCounts: statusCounts,
    orderItems: residue.orderItems.length,
    resaleOffers: residue.resaleOffers.length,
    shipments: residue.shipments.length,
    shipmentItems: residue.shipmentItems.length,
    storageAllocations: residue.storageAllocations.length,
    metadataOnlyPaymentProofAssets: residue.paymentProofAssets.length,
    buyerDeliveryPositions: residue.buyerPositions.length,
    immutableOwnershipEvents: residue.immutableOwnershipEvents.length,
    scopeProblems: residue.scopeProblems,
  };
}

async function deleteExactIds(admin: SupabaseClient, table: string, ids: readonly string[], label: string): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await admin.from(table).delete().in("id", [...ids]).select("id");
  if (error || (data?.length ?? 0) !== ids.length) {
    throw new SafeFixtureError(`T013 ${label} cleanup did not delete the pre-verified exact set.`);
  }
  return data!.length;
}

/**
 * Removes only current T013 business state. `inventory_ownership_events` is append-only history and
 * is intentionally retained (exact synthetic ids are reported); no active orders, allocations,
 * payment-proof metadata, or buyer delivery positions remain after this function returns.
 */
async function cleanupT013BusinessResidue(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const residue = await readT013Residue(admin);
  if (residue.scopeProblems.length > 0) {
    throw new SafeFixtureError("T013 cleanup scope mismatch; refusing to mutate any fixture row.");
  }
  const orderIds = residue.orders.map((row) => row.id);
  const orderItemIds = residue.orderItems.map((row) => row.id);
  const proformaIds = residue.proformas.map((row) => row.id);
  const immutableEventIds = residue.immutableOwnershipEvents.map((row) => row.id);

  if (orderIds.length > 0) {
    const { data: proformaItems, error: proformaItemsError } = await admin.from("proforma_invoice_items").select("id").in("proforma_id", proformaIds);
    if (proformaItemsError) throw new SafeFixtureError("T013 proforma cleanup inspection failed; no further cleanup was performed.");
    await deleteExactIds(admin, "proforma_invoice_items", (proformaItems ?? []).map((row) => row.id), "proforma invoice items");
    await deleteExactIds(admin, "storage_allocations", residue.storageAllocations.map((row) => row.id), "storage allocations");
    await deleteExactIds(admin, "coffee_offers", residue.resaleOffers.map((row) => row.id), "resale-denial control listings");
    await deleteExactIds(admin, "orders", orderIds, "orders");
  }

  await deleteExactIds(admin, "file_assets", residue.paymentProofAssets.map((row) => row.id), "payment-proof metadata");
  await deleteExactIds(admin, "inventory_positions", residue.buyerPositions.map((row) => row.id), "buyer delivery positions");

  // `validate_offer_transition()`'s own live state machine has NO edge from PARTIALLY_FILLED back to
  // PUBLISHED (confirmed empirically: an UPDATE attempting it is refused with
  // `compliance_required_for_listing_state`/`invalid_listing_transition` regardless of caller
  // authority, since PARTIALLY_FILLED may only advance to SUSPENDED/SOLD_OUT/ARCHIVED) — and a
  // successful T013 settlement legitimately moves the fixture offer to PARTIALLY_FILLED, exactly the
  // real behavior DB-BLOCK-07 is proving. Restoring the baseline therefore deletes and re-inserts the
  // row (a fresh INSERT has no `old.status` to compare against, so the trigger's UPDATE-only
  // transition/compliance block does not apply — the SAME bypass `seedDeliveryFixtures`'s own
  // creation path already relies on), rather than attempting an UPDATE the live trigger cannot permit.
  const restoreOffer = async (offerId: string, lotId: string, quantityKg: number, title: string): Promise<void> => {
    const buyerAndSellerUserId = await findAuthUserIdByEmail(admin, FIXTURES[1]!.email);
    if (!buyerAndSellerUserId) throw new SafeFixtureError("T013 delivery offer restore: 001 identity fixtures are missing.");
    const { error: deleteError } = await admin.from("coffee_offers").delete().eq("id", offerId).eq("seller_organization_id", INVENTORY_FIXTURE_IDS.hillsOrg);
    if (deleteError) throw new SafeFixtureError("T013 delivery offer restore delete failed.");
    const { data, error: insertError } = await admin
      .from("coffee_offers")
      .insert({
        id: offerId,
        coffee_id: INVENTORY_FIXTURE_COFFEE_ID,
        lot_id: lotId,
        seller_organization_id: INVENTORY_FIXTURE_IDS.hillsOrg,
        seller_type: "HILLS",
        warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
        title,
        quantity_kg: quantityKg,
        reserved_quantity_kg: 0,
        filled_quantity_kg: 0,
        price_per_kg: 10,
        currency: "USD",
        status: "PUBLISHED",
        created_by: buyerAndSellerUserId,
      })
      .select("id");
    if (insertError || data?.length !== 1) throw new SafeFixtureError("T013 delivery offer restore did not affect its exact fixture row.");
  };
  const restorePosition = async (positionId: string): Promise<void> => {
    const { data, error } = await admin
      .from("inventory_positions")
      .update({ reserved_quantity_kg: 0, available_quantity_kg: 1000 })
      .eq("id", positionId)
      .eq("owner_organization_id", INVENTORY_FIXTURE_IDS.hillsOrg)
      .eq("warehouse_id", INVENTORY_FIXTURE_IDS.warehouse)
      .select("id");
    if (error || data?.length !== 1) throw new SafeFixtureError("T013 delivery position restore did not affect its exact fixture row.");
  };
  await restoreOffer(DELIVERY_FIXTURE_IDS.offerDeliveryMain, DELIVERY_FIXTURE_IDS.lotMain, DELIVERY_FIXTURE_QUANTITY_KG.main, "Feature 009 Fixture — Delivery Main Listing");
  await restoreOffer(DELIVERY_FIXTURE_IDS.offerDeliveryScarce, DELIVERY_FIXTURE_IDS.lotScarce, DELIVERY_FIXTURE_QUANTITY_KG.scarce, "Feature 009 Fixture — Delivery Scarce Listing");
  await restorePosition(DELIVERY_FIXTURE_IDS.hillsPositionMain);
  await restorePosition(DELIVERY_FIXTURE_IDS.hillsPositionScarce);

  const after = await readT013Residue(admin);
  if (after.orders.length !== 0 || after.allDeliveryOfferItems.length !== 0 || after.paymentProofAssets.length !== 0 || after.buyerPositions.length !== 0) {
    throw new SafeFixtureError("T013 cleanup postcondition failed; fixture state was not left clean.");
  }
  if (immutableEventIds.length > 0) {
    const { count, error } = await admin.from("inventory_ownership_events").select("id", { count: "exact", head: true }).in("id", immutableEventIds);
    if (error || count !== immutableEventIds.length) throw new SafeFixtureError("T013 immutable ownership-event retention check failed.");
  }

  return {
    before: t013ResidueSummary(residue),
    removedOrders: orderIds.length,
    removedOrderItems: orderItemIds.length,
    retainedImmutableOwnershipEvents: immutableEventIds.length,
    after: t013ResidueSummary(after),
    businessFixtureResidue: "zero",
  };
}

async function resetDeliveryFixtures(admin: SupabaseClient): Promise<void> {
  console.log(JSON.stringify(await cleanupT013BusinessResidue(admin)));
}

async function teardownDeliveryFixtures(admin: SupabaseClient): Promise<void> {
  console.log("\nTearing down 009-delivery-shipments delivery fixtures…\n");
  await resetDeliveryFixtures(admin);
  const deleteByIds = async (table: string, ids: readonly string[]): Promise<void> => {
    const { error } = await admin.from(table).delete().in("id", ids);
    if (error) throw new SafeFixtureError(`${table} delete failed (Feature 009): ${error.message}`);
  };
  await deleteByIds("coffee_offers", [DELIVERY_FIXTURE_IDS.offerDeliveryMain, DELIVERY_FIXTURE_IDS.offerDeliveryScarce]);
  await deleteByIds("inventory_positions", [DELIVERY_FIXTURE_IDS.hillsPositionMain, DELIVERY_FIXTURE_IDS.hillsPositionScarce]);
  await deleteByIds("coffee_lots", [DELIVERY_FIXTURE_IDS.lotMain, DELIVERY_FIXTURE_IDS.lotScarce]);
  console.log("  removed 2 delivery listings, 2 positions, 2 lots.");
}

/** TEST-ONLY privileged read of one inventory_positions row, by id. */
async function inspectDeliveryPosition(admin: SupabaseClient, positionId: string): Promise<void> {
  const { data, error } = await admin
    .from("inventory_positions")
    .select("id, lot_id, owner_organization_id, warehouse_id, warehouse_location_id, available_quantity_kg, reserved_quantity_kg")
    .eq("id", positionId)
    .maybeSingle();
  if (error) throw new SafeFixtureError("Delivery position inspection failed (Feature 009).");
  console.log(JSON.stringify(data ?? null));
}

/** TEST-ONLY privileged read of one buyer's position for a given lot/org (the schema's own uniqueness
 * guarantee means at most one row can match, warehouse/location held fixed by this fixture set). */
async function inspectDeliveryPositionByLotOwner(admin: SupabaseClient, lotId: string, ownerOrganizationId: string): Promise<void> {
  const { data, error } = await admin
    .from("inventory_positions")
    .select("id, available_quantity_kg, reserved_quantity_kg, warehouse_id, warehouse_location_id")
    .eq("lot_id", lotId)
    .eq("owner_organization_id", ownerOrganizationId)
    .maybeSingle();
  if (error) throw new SafeFixtureError("Delivery position-by-owner inspection failed (Feature 009).");
  console.log(JSON.stringify(data ?? null));
}

/** TEST-ONLY privileged integrity snapshot for one order: its shipments, their items, any
 * storage_allocations for its order_items, its payment, and its ACTIVE reservation (if any). Mirrors
 * `inspectCheckoutOrder`'s convention. */
async function inspectDeliveryOrder(admin: SupabaseClient, orderId: string): Promise<void> {
  const [order, items, shipments] = await Promise.all([
    admin.from("orders").select("id, status, buyer_organization_id, correlation_id").eq("id", orderId).maybeSingle(),
    admin.from("order_items").select("id, offer_id, lot_id, quantity_kg").eq("order_id", orderId),
    admin.from("order_shipments").select("id, status, settlement_verified_at, ready_at, created_by").eq("order_id", orderId),
  ]);
  for (const result of [order, items, shipments]) {
    if (result.error) throw new SafeFixtureError("Delivery order inspection failed (Feature 009).");
  }

  const shipmentIds = (shipments.data ?? []).map((row) => row.id as string);
  let shipmentItems: unknown[] = [];
  if (shipmentIds.length > 0) {
    const { data, error } = await admin
      .from("shipment_items")
      .select("id, shipment_id, order_item_id, planned_quantity_kg, delivered_quantity_kg, reserved_quantity_kg")
      .in("shipment_id", shipmentIds);
    if (error) throw new SafeFixtureError("Delivery order inspection failed (Feature 009).");
    shipmentItems = data ?? [];
  }

  const orderItemIds = (items.data ?? []).map((row) => row.id as string);
  let allocations: unknown[] = [];
  if (orderItemIds.length > 0) {
    const { data, error } = await admin
      .from("storage_allocations")
      .select("id, order_item_id, owner_organization_id, quantity_kg, released_quantity_kg, status")
      .in("order_item_id", orderItemIds);
    if (error) throw new SafeFixtureError("Delivery order inspection failed (Feature 009).");
    allocations = data ?? [];
  }

  const [payment, reservation] = await Promise.all([
    admin.from("payments").select("id, status, amount").eq("order_id", orderId).maybeSingle(),
    admin.from("inventory_reservations").select("id, status, expires_at").eq("order_id", orderId).eq("status", "ACTIVE").maybeSingle(),
  ]);

  console.log(
    JSON.stringify({
      order: order.data ?? null,
      items: items.data ?? [],
      shipments: shipments.data ?? [],
      shipmentItems,
      allocations,
      payment: payment.data ?? null,
      activeReservation: reservation.data ?? null,
    })
  );
}

/**
 * TEST-ONLY privileged setup for T013 item 8 (insufficient inventory at settlement): pre-seeds a
 * buyer-owned `inventory_positions` row at the EXACT `(lot, owner, warehouse, null location)` key
 * `admin_review_payment()`'s own title-transfer upsert will target on the SCARCE lot, with
 * `available_quantity_kg = 0` and `reserved_quantity_kg = <phantomReservedKg>` — an isolated test
 * artifact standing in for "already mostly reserved by something else". `admin_review_payment()`'s
 * own upsert only ever ADDS to `available_quantity_kg` on conflict (never touches
 * `reserved_quantity_kg` — confirmed in its own reviewed body), so this phantom reservation survives
 * the title transfer and leaves the settlement-time delivery-reservation hook genuinely short of free
 * quantity, reproducing the negative case without touching any other fixture or real data.
 */
async function seedPhantomReservation(admin: SupabaseClient, ownerOrganizationId: string, phantomReservedKg: number): Promise<void> {
  const { error } = await admin.from("inventory_positions").upsert(
    {
      lot_id: DELIVERY_FIXTURE_IDS.lotScarce,
      owner_organization_id: ownerOrganizationId,
      warehouse_id: INVENTORY_FIXTURE_IDS.warehouse,
      warehouse_location_id: null,
      available_quantity_kg: 0,
      reserved_quantity_kg: phantomReservedKg,
    },
    { onConflict: "lot_id,owner_organization_id,warehouse_id,warehouse_location_id" }
  );
  if (error) throw new SafeFixtureError(`phantom reservation seed failed (Feature 009): ${error.message}`);
  console.log(JSON.stringify({ seeded: true }));
}

// ---------------------------------------------------------------------------
// Feature 006 live-chain fixtures (T015 / T018 / T023 / T024)
// ---------------------------------------------------------------------------

/**
 * Feature 006's live proofs need a REAL member-seller listing, which needs a REAL settled purchase. The database
 * offers no shortcut (`validate_offer_transition` checks the MEMBER_SELLER purchase provenance on every write), so the
 * chain is built with the same real primitives Features 007/009 already use — nothing here writes business state:
 *
 *   Hills listing (Feature 009's standing `offerDeliveryMain`/`lotMain` fixture, reused — no new lot is created)
 *     → buyer-and-seller org buys through the real 007 checkout        (`checkout_order`)
 *     → settled by the standing FINANCE fixture                         (`admin_review_payment`)
 *     → the org owns a position + a PAID order = valid provenance       (its shipment is then cancelled to free stock)
 *     → the org lists it (real `createListingDraft`), submits, compliance approves/publishes
 *     → the buyer-only org buys from THAT listing and it is settled again (reserve → fill).
 *
 * This section adds NO writer of business state. It adds only: an exact-scope residue read, an exact-scope cleanup, and
 * read-only inspections. Every listing the proofs create carries the `F006L ` title prefix; every order/position is
 * found structurally (an order whose items sit on the dedicated fixture offer or on an `F006L ` listing, not a T013
 * order) and verified against the two documented buyer fixtures BEFORE any DELETE. `inventory_ownership_events` is
 * append-only by trigger (`prevent_ownership_event_mutation`) and `audit_logs` is retained by policy — both are
 * reported, never deleted.
 */
const F006_LISTING_TITLE_PREFIX = "F006L ";
const f006BuyerOrganizationIds = [ORGANIZATION_IDS.buyerOnly, ORGANIZATION_IDS.buyerAndSeller] as const;

type F006Residue = {
  scopeProblems: string[];
  listings: Array<{ id: string; seller_organization_id: string; lot_id: string; title: string | null; created_by: string; source_purchase_order_item_id: string | null; status: string }>;
  orders: Array<{ id: string; order_code: string; buyer_organization_id: string; created_by: string; status: string }>;
  orderItems: Array<{ id: string; order_id: string; offer_id: string; lot_id: string; seller_organization_id: string }>;
  storageAllocations: Array<{ id: string; order_item_id: string | null; owner_organization_id: string; lot_id: string; warehouse_id: string; warehouse_location_id: string | null }>;
  payouts: Array<{ id: string; order_id: string; seller_organization_id: string }>;
  proformas: Array<{ id: string; order_id: string }>;
  positions: Array<{ id: string; lot_id: string; owner_organization_id: string; warehouse_id: string | null; warehouse_location_id: string | null }>;
  immutableOwnershipEvents: Array<{ id: string; order_item_id: string | null }>;
  /** Fixture positions that carry Feature 005 variance history (DB-OPEN-19). They can never be deleted (the history's foreign key is ON DELETE RESTRICT, by design) and are RETAINED and reported, not removed. */
  retainedVariancePositions: number;
};

/**
 * Feature 005 T014 / DB-OPEN-19: the ids (of `ids`) whose position has append-only variance history. The table does not exist until the
 * migration is approved and applied — that is not a failure, it means there is no history.
 */
async function positionsWithVarianceHistory(admin: SupabaseClient, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await admin.from("inventory_variance_events").select("inventory_position_id").in("inventory_position_id", [...ids]);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return new Set();
    throw new SafeFixtureError("Feature 006 fixture inspection could not read variance history; no cleanup was performed.");
  }
  return new Set((data ?? []).map((row) => row.inventory_position_id as string));
}

function throwF006ReadError(): never {
  throw new SafeFixtureError("Feature 006 fixture inspection failed; no cleanup was performed.");
}

async function readF006Residue(admin: SupabaseClient): Promise<F006Residue> {
  const actors = await getT013FixtureActors(admin);
  const permittedUsers = new Set([actors.buyerOnlyUserId, actors.buyerAndSellerUserId]);
  const permittedOrganizations = new Set<string>(f006BuyerOrganizationIds);

  const { data: listingRows, error: listingError } = await admin
    .from("coffee_offers")
    .select("id, seller_organization_id, lot_id, title, created_by, source_purchase_order_item_id, status")
    .like("title", `${F006_LISTING_TITLE_PREFIX}%`);
  if (listingError) throwF006ReadError();
  const listings = listingRows ?? [];
  const listingIds = listings.map((row) => row.id as string);

  const { data: itemRows, error: itemError } = await admin
    .from("order_items")
    .select("id, order_id, offer_id, lot_id, seller_organization_id")
    .in("offer_id", [DELIVERY_FIXTURE_IDS.offerDeliveryMain, ...listingIds]);
  if (itemError) throwF006ReadError();
  const candidateOrderIds = [...new Set((itemRows ?? []).map((row) => row.order_id as string))];

  let orders: F006Residue["orders"] = [];
  if (candidateOrderIds.length > 0) {
    const { data, error } = await admin.from("orders").select("id, order_code, buyer_organization_id, created_by, status").in("id", candidateOrderIds);
    if (error) throwF006ReadError();
    // T013's own tagged orders belong to T013's cleanup, never to this one.
    orders = (data ?? []).filter((row) => !String(row.order_code).startsWith(T013_ORDER_PREFIX));
  }
  const orderIds = orders.map((row) => row.id);
  const orderItems = (itemRows ?? []).filter((row) => orderIds.includes(row.order_id as string)) as F006Residue["orderItems"];
  const itemIds = orderItems.map((row) => row.id);

  const empty = { data: [], error: null };
  const [allocationsResult, payoutsResult, proformasResult, eventsResult, positionsResult] = await Promise.all([
    itemIds.length === 0 ? Promise.resolve(empty) : admin.from("storage_allocations").select("id, order_item_id, owner_organization_id, lot_id, warehouse_id, warehouse_location_id").in("order_item_id", itemIds),
    orderIds.length === 0 ? Promise.resolve(empty) : admin.from("payouts").select("id, order_id, seller_organization_id").in("order_id", orderIds),
    orderIds.length === 0 ? Promise.resolve(empty) : admin.from("proforma_invoices").select("id, order_id").in("order_id", orderIds),
    itemIds.length === 0 ? Promise.resolve(empty) : admin.from("inventory_ownership_events").select("id, order_item_id").in("order_item_id", itemIds),
    admin.from("inventory_positions").select("id, lot_id, owner_organization_id, warehouse_id, warehouse_location_id").eq("lot_id", DELIVERY_FIXTURE_IDS.lotMain).in("owner_organization_id", [...f006BuyerOrganizationIds]),
  ]);
  if (allocationsResult.error || payoutsResult.error || proformasResult.error || eventsResult.error || positionsResult.error) throwF006ReadError();

  const allPositions = (positionsResult.data ?? []) as F006Residue["positions"];
  const retainedPositionIds = await positionsWithVarianceHistory(admin, allPositions.map((row) => row.id));

  const residue: F006Residue = {
    scopeProblems: [],
    listings: listings as F006Residue["listings"],
    orders,
    orderItems,
    storageAllocations: (allocationsResult.data ?? []) as F006Residue["storageAllocations"],
    payouts: (payoutsResult.data ?? []) as F006Residue["payouts"],
    proformas: (proformasResult.data ?? []) as F006Residue["proformas"],
    positions: allPositions.filter((row) => !retainedPositionIds.has(row.id)),
    immutableOwnershipEvents: (eventsResult.data ?? []) as F006Residue["immutableOwnershipEvents"],
    retainedVariancePositions: retainedPositionIds.size,
  };

  const permittedItems = new Set(itemIds);
  const permittedOffers = new Set<string>([DELIVERY_FIXTURE_IDS.offerDeliveryMain, ...listingIds]);
  if (residue.listings.some((row) => row.seller_organization_id !== ORGANIZATION_IDS.buyerAndSeller || row.lot_id !== DELIVERY_FIXTURE_IDS.lotMain || row.created_by !== actors.buyerAndSellerUserId || (row.source_purchase_order_item_id !== null && !permittedItems.has(row.source_purchase_order_item_id)))) {
    residue.scopeProblems.push("an F006L listing does not match its documented identity (seller org, lot, creator, purchase provenance)");
  }
  if (residue.orders.some((row) => !permittedOrganizations.has(row.buyer_organization_id) || !permittedUsers.has(row.created_by))) residue.scopeProblems.push("an order on the fixture offers is not one of the two documented buyer fixtures'");
  if (residue.orderItems.some((row) => !permittedOffers.has(row.offer_id) || row.lot_id !== DELIVERY_FIXTURE_IDS.lotMain)) residue.scopeProblems.push("an order item is not on the dedicated fixture lot/offers");
  if (residue.storageAllocations.some((row) => !permittedOrganizations.has(row.owner_organization_id) || row.lot_id !== DELIVERY_FIXTURE_IDS.lotMain || row.warehouse_id !== INVENTORY_FIXTURE_IDS.warehouse || row.warehouse_location_id !== null)) residue.scopeProblems.push("a storage allocation is not on the exact fixture custody key");
  if (residue.payouts.some((row) => row.seller_organization_id !== ORGANIZATION_IDS.buyerAndSeller)) residue.scopeProblems.push("a payout is not owed to the documented seller fixture");
  if (residue.positions.some((row) => row.warehouse_id !== INVENTORY_FIXTURE_IDS.warehouse || row.warehouse_location_id !== null)) residue.scopeProblems.push("a buyer position is not on the exact fixture custody key");
  return residue;
}

function f006ResidueSummary(residue: F006Residue): Record<string, unknown> {
  return {
    listings: residue.listings.length,
    orders: residue.orders.length,
    orderStatusCounts: residue.orders.reduce<Record<string, number>>((counts, order) => ({ ...counts, [order.status]: (counts[order.status] ?? 0) + 1 }), {}),
    orderItems: residue.orderItems.length,
    storageAllocations: residue.storageAllocations.length,
    payouts: residue.payouts.length,
    proformas: residue.proformas.length,
    buyerPositions: residue.positions.length,
    retainedVariancePositions: residue.retainedVariancePositions,
    immutableOwnershipEvents: residue.immutableOwnershipEvents.length,
    scopeProblems: residue.scopeProblems,
  };
}

/**
 * Removes exactly the residue `readF006Residue` proved to be in scope, in the only order the foreign keys allow:
 * orders that BUY an F006L listing → the listings → the remaining orders (which the listings' provenance pointed at).
 * The FK graph has no cascade on `payouts`, `storage_allocations` or `proforma_invoice_items`, so those go first.
 * `inventory_ownership_events` (append-only) and `audit_logs` are retained and reported, and so is any fixture position that carries
 * Feature 005 variance history (`inventory_variance_events`, append-only; its FK to the position is ON DELETE RESTRICT, so such a position
 * cannot be deleted by design — the live proof zeroes it through a resolved count, leaving an empty, reusable position).
 */
async function cleanupF006BusinessRows(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const residue = await readF006Residue(admin);
  if (residue.scopeProblems.length > 0) throw new SafeFixtureError("Feature 006 cleanup scope mismatch; refusing to mutate any fixture row.");

  const listingIds = residue.listings.map((row) => row.id);
  const ordersBuyingListings = [...new Set(residue.orderItems.filter((row) => listingIds.includes(row.offer_id)).map((row) => row.order_id))];
  const remainingOrders = residue.orders.map((row) => row.id).filter((id) => !ordersBuyingListings.includes(id));

  const proformaIds = residue.proformas.map((row) => row.id);
  if (proformaIds.length > 0) {
    const { data, error } = await admin.from("proforma_invoice_items").select("id").in("proforma_id", proformaIds);
    if (error) throw new SafeFixtureError("Feature 006 cleanup could not read proforma items; nothing further was removed.");
    await deleteExactIds(admin, "proforma_invoice_items", (data ?? []).map((row) => row.id as string), "F006 proforma invoice items");
  }
  await deleteExactIds(admin, "storage_allocations", residue.storageAllocations.map((row) => row.id), "F006 storage allocations");
  await deleteExactIds(admin, "payouts", residue.payouts.map((row) => row.id), "F006 payouts");
  await deleteExactIds(admin, "orders", ordersBuyingListings, "F006 orders on resale listings");
  await deleteExactIds(admin, "coffee_offers", listingIds, "F006 resale listings");
  await deleteExactIds(admin, "orders", remainingOrders, "F006 orders on the Hills fixture listing");
  await deleteExactIds(admin, "inventory_positions", residue.positions.map((row) => row.id), "F006 buyer positions");

  const after = await readF006Residue(admin);
  if (after.listings.length !== 0 || after.orders.length !== 0 || after.positions.length !== 0 || after.scopeProblems.length !== 0) {
    throw new SafeFixtureError("Feature 006 cleanup postcondition failed; fixture state was not left clean.");
  }
  return { before: f006ResidueSummary(residue), after: f006ResidueSummary(after), retainedImmutableOwnershipEvents: residue.immutableOwnershipEvents.length, businessFixtureResidue: "zero" };
}

const F006_COUNTED_TABLES = [
  "coffee_offers",
  "listing_status_history",
  "listing_reviews",
  "orders",
  "order_items",
  "order_status_history",
  "order_shipments",
  "shipment_items",
  "payments",
  "payment_reviews",
  "payouts",
  "proforma_invoices",
  "proforma_invoice_items",
  "inventory_positions",
  "inventory_reservations",
  "inventory_reservation_items",
  "storage_allocations",
  "inventory_ownership_events",
  "audit_logs",
  "organization_members",
  "file_assets",
] as const;

/** TEST-ONLY read-only row counts (plus active platform admins / all profiles) — the before/after evidence for cleanup. */
async function inspectF006RowCounts(admin: SupabaseClient): Promise<void> {
  const counts: Record<string, number> = {};
  for (const table of F006_COUNTED_TABLES) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) throw new SafeFixtureError(`Row count failed for ${table}.`);
    counts[table] = count ?? -1;
  }
  const admins = await admin.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("is_active", true);
  const profiles = await admin.from("profiles").select("id", { count: "exact", head: true });
  if (admins.error || profiles.error) throw new SafeFixtureError("Row count failed for platform_admins/profiles.");
  counts.platform_admins_active = admins.count ?? -1;
  counts.profiles = profiles.count ?? -1;
  console.log(JSON.stringify(counts));
}

/**
 * TEST-ONLY read-only snapshot of ONE listing: the stored columns, the ACTIVE reservation items behind its reserved
 * mirror, its seller's position for the lot, its history/review rows and the order items that bought it. The
 * reservation tables are admin-only by RLS (DB-OPEN-12), so this is the approved way for a release-blocking test to
 * see them; no runtime member code reads them.
 */
async function inspectF006Offer(admin: SupabaseClient, offerId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) throw new SafeFixtureError("--inspect-f006-offer requires a UUID.");
  const { data: offer, error: offerError } = await admin
    .from("coffee_offers")
    .select("id, status, is_visible, quantity_kg, reserved_quantity_kg, filled_quantity_kg, seller_organization_id, seller_type, lot_id, warehouse_id, warehouse_location_id, created_by, source_purchase_order_item_id")
    .eq("id", offerId)
    .maybeSingle();
  if (offerError) throw new SafeFixtureError("Feature 006 offer inspection failed.");
  if (!offer) {
    console.log(JSON.stringify({ offer: null }));
    return;
  }
  let positionQuery = admin
    .from("inventory_positions")
    .select("id, available_quantity_kg, reserved_quantity_kg")
    .eq("lot_id", offer.lot_id)
    .eq("owner_organization_id", offer.seller_organization_id)
    .eq("warehouse_id", offer.warehouse_id);
  positionQuery = offer.warehouse_location_id === null ? positionQuery.is("warehouse_location_id", null) : positionQuery.eq("warehouse_location_id", offer.warehouse_location_id);
  const [history, reviews, items, position] = await Promise.all([
    admin.from("listing_status_history").select("old_status, new_status, changed_by, reason, created_at").eq("offer_id", offerId).order("created_at", { ascending: true }),
    admin.from("listing_reviews").select("decision, reviewer_user_id, reason").eq("offer_id", offerId),
    admin.from("order_items").select("id, order_id, quantity_kg").eq("offer_id", offerId),
    positionQuery.maybeSingle(),
  ]);
  for (const result of [history, reviews, items, position]) if (result.error) throw new SafeFixtureError("Feature 006 offer inspection failed.");

  const { data: active, error: activeError } = await admin.from("inventory_reservations").select("id").eq("status", "ACTIVE");
  if (activeError) throw new SafeFixtureError("Feature 006 offer inspection failed.");
  const activeIds = (active ?? []).map((row) => row.id as string);
  let activeReservationItems: Array<{ reservation_id: string; quantity_kg: number }> = [];
  if (activeIds.length > 0) {
    const { data, error } = await admin.from("inventory_reservation_items").select("reservation_id, quantity_kg").eq("offer_id", offerId).in("reservation_id", activeIds);
    if (error) throw new SafeFixtureError("Feature 006 offer inspection failed.");
    activeReservationItems = (data ?? []) as typeof activeReservationItems;
  }
  console.log(
    JSON.stringify({
      offer,
      sellerPosition: position.data ?? null,
      statusHistory: history.data ?? [],
      reviews: reviews.data ?? [],
      orderItems: items.data ?? [],
      activeReservationCount: new Set(activeReservationItems.map((row) => row.reservation_id)).size,
      activeReservationKg: activeReservationItems.reduce((total, row) => total + Number(row.quantity_kg), 0),
    })
  );
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
/**
 * Creates exactly one T013-only metadata pointer so the buyer can exercise the production
 * `submit_payment_proof()` state-machine path. No Storage object is written or claimed: this proof
 * is about the payment/status transition, not document upload. The path is deterministic and is
 * accepted only for a pre-verified T013 order created by that order's authenticated buyer.
 */
async function createT013PaymentProofMetadata(admin: SupabaseClient, orderId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new SafeFixtureError("T013 payment-proof setup requires an exact UUID.");
  const actors = await getT013FixtureActors(admin);
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, buyer_organization_id, created_by")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order || !order.order_code.startsWith(T013_ORDER_PREFIX)) {
    throw new SafeFixtureError("T013 payment-proof setup refused a non-fixture order.");
  }
  const permittedUsers = new Set([actors.buyerOnlyUserId, actors.buyerAndSellerUserId]);
  if (!t013BuyerOrganizationIds.includes(order.buyer_organization_id as (typeof t013BuyerOrganizationIds)[number]) || !permittedUsers.has(order.created_by)) {
    throw new SafeFixtureError("T013 payment-proof setup fixture identity mismatch.");
  }

  const objectPath = `${T013_PAYMENT_PROOF_PREFIX}${orderId}.metadata`;
  const { data: existing, error: existingError } = await admin
    .from("file_assets")
    .select("id, bucket_name, object_path, uploaded_by, organization_id")
    .eq("bucket_name", "t013-test-artifacts")
    .eq("object_path", objectPath)
    .maybeSingle();
  if (existingError) throw new SafeFixtureError("T013 payment-proof metadata inspection failed.");
  if (existing) {
    if (existing.uploaded_by !== order.created_by || existing.organization_id !== order.buyer_organization_id) {
      throw new SafeFixtureError("T013 payment-proof metadata scope mismatch.");
    }
    console.log(JSON.stringify({ fileAssetId: existing.id, metadataOnly: true, reused: true }));
    return;
  }

  const { data: created, error: createError } = await admin
    .from("file_assets")
    .insert({
      uploaded_by: order.created_by,
      organization_id: order.buyer_organization_id,
      bucket_name: "t013-test-artifacts",
      object_path: objectPath,
      original_name: "t013-payment-proof-metadata.txt",
      mime_type: "text/plain",
      size_bytes: 0,
      is_private: true,
    })
    .select("id")
    .single();
  if (createError || !created) throw new SafeFixtureError("T013 payment-proof metadata setup failed.");
  console.log(JSON.stringify({ fileAssetId: created.id, metadataOnly: true, reused: false }));
}

/** Proves the standing FINANCE fixture was not broadened before T013 uses it. */
async function assertT013FinanceFixtureIsNarrow(admin: SupabaseClient): Promise<void> {
  const financeUserId = await findAuthUserIdByEmail(admin, FIXTURES[3]!.email);
  if (!financeUserId) throw new SafeFixtureError("T013 FINANCE fixture is missing; run npm run test:seed first.");
  const { data, error } = await admin.from("platform_admins").select("role, is_active").eq("user_id", financeUserId).maybeSingle();
  if (error || !data || data.role !== "FINANCE" || data.is_active !== true) {
    throw new SafeFixtureError("T013 requires the existing finance fixture to remain active FINANCE only.");
  }
}

/**
 * Creates the separately approved ADMIN-only principal. Existing identities are never silently
 * reused, re-enabled, or role-changed EXCEPT one exact, narrow prior state: the SAME identity, left
 * by this fixture's own matching cleanup with its ADMIN capability already removed, no organization
 * membership, and permanently blocked/banned (the `cleanupT013DeliveryAdminFixture` retention path
 * taken when the identity accrued real, immutable `audit_logs` references from a genuine prior T013
 * run). Reactivating that EXACT identity for a new run — never a differently-shaped one — is the same
 * "disposable per run, not literally single-use" precedent every other fixture in this file already
 * follows; any other pre-existing shape is refused, not silently altered.
 */
async function createT013DeliveryAdminFixture(admin: SupabaseClient, password: string): Promise<void> {
  await assertT013FinanceFixtureIsNarrow(admin);
  await createDisposableOperatorFixture(admin, password, T013_DELIVERY_ADMIN_FIXTURE, "feature-009-t013-delivery-admin");
}

/**
 * Feature 010 RUN B — the generic form of the T013 disposable-operator lifecycle, parameterised by
 * the fixture (and therefore its exact `platform_admins.role`). Identical semantics: an existing
 * identity is reused ONLY in the exact retained-blocked-and-banned shape its own cleanup leaves;
 * any other pre-existing shape is refused, never altered.
 */
async function createDisposableOperatorFixture(
  admin: SupabaseClient,
  password: string,
  fixture: Fixture,
  metadataTag: string,
  options: { reuseIfActive: boolean } = { reuseIfActive: false }
): Promise<void> {
  const role = fixture.platformAdminRole;
  if (role === null) throw new SafeFixtureError("A disposable operator fixture must declare its exact platform_admins.role.");
  const existingUserId = await findAuthUserIdByEmail(admin, fixture.email);
  if (existingUserId) {
    const [{ count: membershipCount, error: membershipError }, { data: capability, error: capabilityError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("organization_members").select("organization_id", { count: "exact", head: true }).eq("user_id", existingUserId),
      admin.from("platform_admins").select("role, is_active").eq("user_id", existingUserId).maybeSingle(),
      admin.from("profiles").select("is_blocked").eq("id", existingUserId).maybeSingle(),
    ]);
    if (membershipError || capabilityError || profileError || membershipCount !== 0) {
      throw new SafeFixtureError(`Existing ${role} fixture is not the exact approved disposable identity; refusing to alter it.`);
    }
    const isActiveAdmin = capability?.role === role && capability?.is_active === true;
    const isRetainedBlockedShape = !capability && profile?.is_blocked === true;
    if (isActiveAdmin) {
      // T013 (ADMIN) keeps the strict "clean up first" rule. The COMPLIANCE fixture (a narrow role,
      // no membership — re-verified above) may be reused across test files in one run.
      if (!options.reuseIfActive) {
        throw new SafeFixtureError(`${role} fixture already exists; run its cleanup command before a new live proof.`);
      }
      console.log(JSON.stringify({ userId: existingUserId, role, organizationMemberships: 0, disposable: true, reused: true }));
      return;
    }
    if (!isRetainedBlockedShape) {
      throw new SafeFixtureError(`Existing ${role} fixture is not the exact approved disposable identity; refusing to alter it.`);
    }
    const { error: unbanError } = await admin.auth.admin.updateUserById(existingUserId, { ban_duration: "none", password, email_confirm: true });
    if (unbanError) throw new SafeFixtureError(`${role} fixture reactivation (unban) failed.`);
    const { error: unblockError } = await admin.from("profiles").update({ is_blocked: false, block_reason: null }).eq("id", existingUserId);
    if (unblockError) throw new SafeFixtureError(`${role} fixture reactivation (unblock) failed.`);
    const { error: capabilityInsertError } = await admin.from("platform_admins").insert({ user_id: existingUserId, role, is_active: true });
    if (capabilityInsertError) throw new SafeFixtureError(`${role} fixture reactivation (capability grant) failed.`);
    console.log(JSON.stringify({ userId: existingUserId, role, organizationMemberships: 0, disposable: true, reactivated: true }));
    return;
  }

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email: fixture.email,
    password,
    email_confirm: true,
    user_metadata: { fixture: metadataTag },
  });
  if (createUserError || !createdUser.user) throw new SafeFixtureError(`${role} fixture auth creation failed.`);
  const userId = createdUser.user.id;

  try {
    // A live database trigger on `auth.users` now auto-creates a matching `profiles` row on user
    // creation (this file's own header predates that trigger and still documents the OLD baseline —
    // confirmed empirically: a plain INSERT here hits `profiles_pkey` immediately after `createUser`
    // returns). `upsert` keeps this function correct under either baseline without editing that
    // unrelated historical claim.
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: fixture.fullName,
        company_name: null,
        is_blocked: false,
      },
      { onConflict: "id" }
    );
    if (profileError) throw new SafeFixtureError(`${role} fixture profile creation failed.`);
    const { error: capabilityError } = await admin.from("platform_admins").insert({
      user_id: userId,
      role,
      is_active: true,
    });
    if (capabilityError) throw new SafeFixtureError(`${role} fixture capability creation failed.`);
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    throw error;
  }

  console.log(JSON.stringify({ userId, role, organizationMemberships: 0, disposable: true }));
}

/**
 * Removes the elevated capability first. Auth deletion is attempted only for this exact identity;
 * immutable-audit FK retention falls back to a blocked profile plus an Auth ban, never an active
 * ADMIN principal. No audit/history row is deleted.
 */
async function cleanupT013DeliveryAdminFixture(admin: SupabaseClient): Promise<Record<string, unknown>> {
  return cleanupDisposableOperatorFixture(admin, T013_DELIVERY_ADMIN_FIXTURE);
}

/** Feature 010 RUN B — generic form of the T013 cleanup (role read from the fixture, never assumed). */
async function cleanupDisposableOperatorFixture(admin: SupabaseClient, fixture: Fixture): Promise<Record<string, unknown>> {
  const role = fixture.platformAdminRole;
  if (role === null) throw new SafeFixtureError("A disposable operator fixture must declare its exact platform_admins.role.");
  const userId = await findAuthUserIdByEmail(admin, fixture.email);
  if (!userId) return { adminFixture: "absent", activeAdminPrivilege: false, role };

  const [{ data: capability, error: capabilityError }, { count: membershipCount, error: membershipError }, { count: auditCount, error: auditError }] = await Promise.all([
    admin.from("platform_admins").select("role, is_active").eq("user_id", userId).maybeSingle(),
    admin.from("organization_members").select("organization_id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor_user_id", userId),
  ]);
  if (capabilityError || membershipError || auditError || membershipCount !== 0 || !capability || capability.role !== role) {
    throw new SafeFixtureError(`${role} fixture cleanup scope mismatch; refusing to alter the principal.`);
  }

  const { data: removedCapability, error: removeCapabilityError } = await admin
    .from("platform_admins")
    .delete()
    .eq("user_id", userId)
    .eq("role", role)
    .select("user_id");
  if (removeCapabilityError || removedCapability?.length !== 1) {
    throw new SafeFixtureError(`${role} fixture capability removal failed.`);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (!deleteError) {
    return { adminFixture: "deleted", activeAdminPrivilege: false, role, auditReferenceCount: auditCount ?? 0 };
  }

  const [{ error: blockError }, { error: banError }] = await Promise.all([
    admin.from("profiles").update({ is_blocked: true }).eq("id", userId),
    admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }),
  ]);
  if (blockError || banError) {
    throw new SafeFixtureError(`${role} fixture was de-privileged but could not be safely disabled after Auth deletion was blocked.`);
  }
  return {
    adminFixture: "retained-blocked-and-banned",
    activeAdminPrivilege: false,
    role,
    auditReferenceCount: auditCount ?? 0,
    retentionReason: "Auth deletion was refused by an existing immutable reference; no audit/history row was deleted.",
  };
}

/**
 * Feature 010 RUN E (T023) — restores the RUN E proof coffee to `DRAFT` (exact fixed id, status column
 * only) so a failed live proof can never leave Feature 002's public catalogue with a stray published
 * fixture. Test-only service-role restore, the same convention as `--reset-listing-review-fixtures`.
 */
async function resetRunECatalogueFixture(admin: SupabaseClient): Promise<void> {
  // Idempotent: (re)creates the fixed-id row when absent (the full `seedCatalogue` also writes it) and
  // resets it to DRAFT otherwise — the row's content is a constant, so an upsert IS the reset.
  const { data, error } = await admin
    .from("coffees")
    .upsert(
      {
        id: CATALOGUE_IDS.coffeeRunEProof,
        origin_id: CATALOGUE_IDS.originActive,
        coffee_type_id: CATALOGUE_IDS.coffeeType,
        name: "Public Test Coffee — Run E Proof",
        slug: CATALOGUE_SLUGS.coffeeRunEProof,
        description: "Feature 010 RUN E publish/unpublish proof coffee. Safe to publish transiently.",
        status: "DRAFT",
      },
      { onConflict: "id" },
    )
    .select("id")
    .maybeSingle();
  if (error) throw new SafeFixtureError("RUN E catalogue fixture reset failed.");
  if (!data) throw new Error("RUN E proof coffee fixture could not be written; run npm run test:seed first (Feature 002 origin/type rows are required)");
  // T024: one metadata-only media record (same convention as the Phase 8/9 `file_assets` rows — no
  // Storage object exists behind it; no catalogue bucket exists at all) so the console's record
  // management (primary flag, sort order) has a REAL row to act on; canonical state restored here.
  const { error: fileAssetError } = await admin
    .from("file_assets")
    .upsert({ id: CATALOGUE_IDS.coffeeRunEProofFileAsset, bucket_name: "catalogue-media-fixture-no-bucket", object_path: "fixtures/run-e/proof-media.jpg", original_name: "run-e-proof-media.jpg", mime_type: "image/jpeg", size_bytes: 2048, is_private: false }, { onConflict: "id" });
  if (fileAssetError) throw new SafeFixtureError("RUN E media fixture (file_assets) reset failed.");
  const { error: mediaError } = await admin
    .from("coffee_media")
    .upsert({ id: CATALOGUE_IDS.coffeeRunEProofMedia, coffee_id: CATALOGUE_IDS.coffeeRunEProof, file_asset_id: CATALOGUE_IDS.coffeeRunEProofFileAsset, sort_order: 0, is_primary: false }, { onConflict: "id" });
  if (mediaError) throw new SafeFixtureError("RUN E media fixture (coffee_media) reset failed.");
  console.log(JSON.stringify({ coffeeId: CATALOGUE_IDS.coffeeRunEProof, slug: CATALOGUE_SLUGS.coffeeRunEProof, status: "DRAFT", mediaId: CATALOGUE_IDS.coffeeRunEProofMedia }));
}

/**
 * Feature 010 RUN E (T021/T022) — the ONLY rows the RUN E live suite CREATES through the console's
 * own `create*` functions carry these fixed slugs/codes; this removes exactly those rows again
 * (test-only service-role delete of test-created reference rows — the console itself has no delete
 * path, by design). Nothing seeded by Feature 002 is touched.
 */
const RUN_E_CREATED_ROWS = {
  coffeeSlug: "run-e-created-coffee-proof",
  /** Created (and normally removed in its own `finally`) by `scripts/live-verify-catalogue-media-translations.ts`. */
  liveMediaCoffeeSlug: "run-e-created-coffee-proof-live-media",
  originSlug: "run-e-origin-proof",
  regionSlug: "run-e-region-proof",
  tagSlug: "run-e-tag-proof",
  warehouseCode: "RUN-E-PROOF",
} as const;

/**
 * Feature 012 RUN A — dispute proof fixtures (privileged setup/teardown/inspection ONLY; the product
 * path never uses a service role).
 *
 * - `blockedOrder`: ONE standing DRAFT order owned by the `blocked-member` fixture's organization.
 *   A blocked user cannot create an order through Feature 007's flow (that is the point of being
 *   blocked), so this is the only way to give the blocked user an order it CAN view — which isolates
 *   `disputes_create`'s `NOT is_blocked_user()` clause from its `can_view_order()` clause. Same
 *   DRAFT-order precedent as Feature 005's `orderA`/`orderB` (`can_view_order` ignores status).
 * - Every dispute the live suite raises carries `DISPUTE_TEST_REASON_PREFIX`; cleanup deletes ONLY
 *   disputes that carry it AND sit on one of the three fixture orders (evidence cascades by FK).
 */
const DISPUTE_FIXTURE_IDS = {
  blockedOrder: "12000000-0000-4000-8000-000000000001",
  blockedOrderCode: "F012-FIX-ORDER-BLOCKED",
} as const;
const DISPUTE_TEST_REASON_PREFIX = "[F012-RUN-A]";
const DISPUTE_FIXTURE_ORDER_IDS = [INVENTORY_FIXTURE_IDS.orderA, INVENTORY_FIXTURE_IDS.orderB, DISPUTE_FIXTURE_IDS.blockedOrder] as const;

async function seedDisputeFixtures(admin: SupabaseClient): Promise<void> {
  const blockedUserId = await findAuthUserIdByEmail(admin, "blocked-member+foundation-test@example.com");
  if (!blockedUserId) throw new SafeFixtureError("blocked-member fixture is missing; run npm run test:seed first.");
  const { error } = await admin.from("orders").upsert(
    { id: DISPUTE_FIXTURE_IDS.blockedOrder, buyer_organization_id: PHASE89_ORGANIZATION_IDS.blockedMember, status: "DRAFT", order_code: DISPUTE_FIXTURE_IDS.blockedOrderCode, created_by: blockedUserId },
    { onConflict: "id" },
  );
  if (error) throw new SafeFixtureError("Feature 012 blocked-member fixture order upsert failed.");
}

async function cleanupDisputeTestRows(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("disputes")
    .delete()
    .in("order_id", [...DISPUTE_FIXTURE_ORDER_IDS])
    .like("reason", `${DISPUTE_TEST_REASON_PREFIX}%`)
    .select("id");
  if (error) throw new SafeFixtureError("Feature 012 dispute test-row cleanup failed.");
  const { count, error: countError } = await admin.from("disputes").select("id", { count: "exact", head: true }).in("order_id", [...DISPUTE_FIXTURE_ORDER_IDS]).like("reason", `${DISPUTE_TEST_REASON_PREFIX}%`);
  if (countError) throw new SafeFixtureError("Feature 012 dispute test-row residue check failed.");
  return { removedDisputes: data?.length ?? 0, remainingTaggedDisputes: count ?? 0 };
}

/** Read-only side-effect snapshot of the three fixture orders (orders, shipments, payments, reservations, history, custody) plus the tagged disputes. */
async function inspectDisputeFixtures(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const orderIds = [...DISPUTE_FIXTURE_ORDER_IDS];
  const [orders, shipments, payments, reservations, history, items, disputes] = await Promise.all([
    admin.from("orders").select("id, status, updated_at, correlation_id").in("id", orderIds).order("id"),
    admin.from("order_shipments").select("id, order_id, status, updated_at").in("order_id", orderIds).order("id"),
    admin.from("payments").select("id, order_id, status, updated_at").in("order_id", orderIds).order("id"),
    admin.from("inventory_reservations").select("id, order_id, status").in("order_id", orderIds).order("id"),
    admin.from("order_status_history").select("id", { count: "exact", head: true }).in("order_id", orderIds),
    admin.from("order_items").select("id").in("order_id", orderIds),
    admin.from("disputes").select("id, order_id, status, opened_by_user_id, opened_by_organization_id, resolution, resolved_by, resolved_at, correlation_id, updated_at").in("order_id", orderIds).like("reason", `${DISPUTE_TEST_REASON_PREFIX}%`).order("created_at"),
  ]);
  if (orders.error || shipments.error || payments.error || reservations.error || history.error || items.error || disputes.error) {
    throw new SafeFixtureError("Feature 012 dispute fixture inspection failed.");
  }
  const itemIds = (items.data ?? []).map((row) => row.id as string);
  const allocations = itemIds.length > 0 ? await admin.from("storage_allocations").select("id, status, quantity_kg, released_quantity_kg").in("order_item_id", itemIds).order("id") : { data: [], error: null };
  if (allocations.error) throw new SafeFixtureError("Feature 012 dispute fixture inspection failed (custody).");
  const lotIds = [...new Set(((await admin.from("order_items").select("lot_id").in("order_id", orderIds)).data ?? []).map((row) => row.lot_id as string))];
  const positions = lotIds.length > 0 ? await admin.from("inventory_positions").select("id, available_quantity_kg, reserved_quantity_kg").in("lot_id", lotIds).order("id") : { data: [], error: null };
  if (positions.error) throw new SafeFixtureError("Feature 012 dispute fixture inspection failed (positions).");
  // Zero-byte evidence proof (DB-BLOCK-01): the file-asset register and the bucket set must not move.
  const [{ count: fileAssetCount, error: fileAssetError }, { data: buckets, error: bucketError }] = await Promise.all([
    admin.from("file_assets").select("id", { count: "exact", head: true }),
    admin.storage.listBuckets(),
  ]);
  if (fileAssetError || bucketError) throw new SafeFixtureError("Feature 012 dispute fixture inspection failed (storage).");
  const disputeIds = (disputes.data ?? []).map((row) => row.id as string);
  const evidence = disputeIds.length > 0 ? await admin.from("dispute_evidence").select("id, dispute_id, note, uploaded_by, file_asset_id").in("dispute_id", disputeIds).order("created_at") : { data: [], error: null };
  if (evidence.error) throw new SafeFixtureError("Feature 012 dispute fixture inspection failed (evidence).");
  return {
    orders: orders.data,
    shipments: shipments.data,
    payments: payments.data,
    reservations: reservations.data,
    orderStatusHistoryCount: history.count ?? 0,
    storageAllocations: allocations.data,
    inventoryPositions: positions.data,
    fileAssetCount: fileAssetCount ?? 0,
    storageBuckets: (buckets ?? []).map((bucket) => ({ id: bucket.id, public: bucket.public })).sort((x, y) => x.id.localeCompare(y.id)),
    disputes: disputes.data,
    evidence: evidence.data,
  };
}

/**
 * Feature 012 RUN E (T004 / DB-OPEN-23) — read-only view of `dispute_status_history` for the tagged
 * fixture disputes, plus the table-wide row count (so a run can prove no stray history rows remain
 * once the tagged disputes are removed — history cascades with its dispute by FK).
 */
async function inspectDisputeStatusHistory(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: disputes, error } = await admin.from("disputes").select("id").in("order_id", [...DISPUTE_FIXTURE_ORDER_IDS]).like("reason", `${DISPUTE_TEST_REASON_PREFIX}%`);
  if (error) throw new SafeFixtureError("Feature 012 dispute history inspection failed (disputes).");
  const disputeIds = (disputes ?? []).map((row) => row.id as string);
  const history = disputeIds.length > 0
    ? await admin.from("dispute_status_history").select("id, dispute_id, from_status, to_status, actor_user_id, reason, correlation_id, created_at").in("dispute_id", disputeIds).order("created_at").order("id")
    : { data: [], error: null };
  if (history.error) throw new SafeFixtureError("Feature 012 dispute history inspection failed (history).");
  const { count, error: countError } = await admin.from("dispute_status_history").select("id", { count: "exact", head: true });
  if (countError) throw new SafeFixtureError("Feature 012 dispute history inspection failed (count).");
  return { taggedDisputeIds: disputeIds, history: history.data, totalHistoryRows: count ?? 0 };
}

/**
 * Feature 012 RUN E (T004 / DB-OPEN-23) — proves the database guards hold even against the SERVICE
 * ROLE (which bypasses RLS entirely, so only the triggers can refuse). Uses the newest history row of
 * a tagged fixture dispute and attempts, in order: a history UPDATE, a history DELETE, a forged
 * history INSERT, and a direct dispute status UPDATE. Each must be refused with the trigger's named
 * exception, and the targeted rows must be byte-identical afterwards. Prints only exception names.
 */
async function probeDisputeHistoryGuards(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const snapshot = await inspectDisputeStatusHistory(admin);
  const rows = snapshot.history as Array<Record<string, unknown>>;
  const target = rows[rows.length - 1];
  if (!target) throw new SafeFixtureError("Feature 012 dispute history probe needs at least one tagged history row.");
  const disputeId = target.dispute_id as string;
  const { data: disputeBefore, error: beforeError } = await admin.from("disputes").select("*").eq("id", disputeId).single();
  if (beforeError) throw new SafeFixtureError("Feature 012 dispute history probe could not read its dispute.");

  const name = (error: { message?: string } | null) => (error ? (error.message ?? "error") : null);
  const historyUpdate = await admin.from("dispute_status_history").update({ reason: "forbidden RUN E append-only probe" }).eq("id", target.id as string).select("id");
  const historyDelete = await admin.from("dispute_status_history").delete().eq("id", target.id as string).select("id");
  const historyInsert = await admin
    .from("dispute_status_history")
    .insert({ dispute_id: disputeId, from_status: "OPEN", to_status: "CLOSED", actor_user_id: target.actor_user_id, reason: "forged RUN E history row" })
    .select("id");
  const disputeUpdate = await admin.from("disputes").update({ status: disputeBefore.status === "CLOSED" ? "OPEN" : "CLOSED" }).eq("id", disputeId).select("id");

  const after = await inspectDisputeStatusHistory(admin);
  const { data: disputeAfter, error: afterError } = await admin.from("disputes").select("*").eq("id", disputeId).single();
  if (afterError) throw new SafeFixtureError("Feature 012 dispute history probe could not re-read its dispute.");
  return {
    historyUpdate: { refusal: name(historyUpdate.error), rows: historyUpdate.data?.length ?? 0 },
    historyDelete: { refusal: name(historyDelete.error), rows: historyDelete.data?.length ?? 0 },
    historyInsert: { refusal: name(historyInsert.error), rows: historyInsert.data?.length ?? 0 },
    disputeUpdate: { refusal: name(disputeUpdate.error), rows: disputeUpdate.data?.length ?? 0 },
    historyUnchanged: JSON.stringify(after.history) === JSON.stringify(snapshot.history),
    disputeUnchanged: JSON.stringify(disputeAfter) === JSON.stringify(disputeBefore),
  };
}

/**
 * Feature 012 RUN B — notification ISOLATION fixture (privileged, test-only). The product can never
 * create a notification (DB-BLOCK-04: SELECT-only policy, no generating trigger), so the only way to
 * prove "a user sees ONLY their own notifications" against a real row is for this fixture script to
 * insert ONE clearly tagged row for the buyer-only fixture user. It is removed by
 * `--cleanup-notification-test-rows`. This does NOT simulate a notification system: the product
 * paths still create nothing, and `tests/disputes/honest-limitations.test.ts` scans product code only.
 */
const NOTIFICATION_FIXTURE = {
  id: "12000000-0000-4000-8000-0000000000b1",
  titlePrefix: "[F012-RUN-B]",
} as const;
const NOTIFICATION_PREFERENCE_TEST_TYPES = ["ORDER_UPDATES", "PAYMENT_INVOICES", "SHIPMENT_UPDATES", "KYB_DOCUMENTS"] as const;

async function seedNotificationFixture(admin: SupabaseClient): Promise<void> {
  const buyerOnlyUserId = await findAuthUserIdByEmail(admin, FIXTURES[0]!.email);
  if (!buyerOnlyUserId) throw new SafeFixtureError("buyer-only fixture is missing; run npm run test:seed first.");
  const { error } = await admin.from("notifications").upsert(
    {
      id: NOTIFICATION_FIXTURE.id,
      user_id: buyerOnlyUserId,
      organization_id: ORGANIZATION_IDS.buyerOnly,
      notification_type: "ORDER_UPDATES",
      title: `${NOTIFICATION_FIXTURE.titlePrefix} Isolation fixture <img src=x onerror=alert(1)>`,
      body: "Test-only row inserted by the fixture script to prove own-user isolation.",
    },
    { onConflict: "id" },
  );
  if (error) throw new SafeFixtureError("Feature 012 notification fixture upsert failed.");
}

async function cleanupNotificationTestRows(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: removedNotifications, error } = await admin.from("notifications").delete().like("title", `${NOTIFICATION_FIXTURE.titlePrefix}%`).select("id");
  if (error) throw new SafeFixtureError("Feature 012 notification cleanup failed.");
  const userIds = (await Promise.all([findAuthUserIdByEmail(admin, FIXTURES[0]!.email), findAuthUserIdByEmail(admin, FIXTURES[1]!.email)])).filter((id): id is string => Boolean(id));
  const { data: removedPreferences, error: preferenceError } = userIds.length
    ? await admin.from("notification_preferences").delete().in("user_id", userIds).in("notification_type", [...NOTIFICATION_PREFERENCE_TEST_TYPES]).select("user_id")
    : { data: [], error: null };
  if (preferenceError) throw new SafeFixtureError("Feature 012 notification preference cleanup failed.");
  const { count, error: countError } = await admin.from("notifications").select("id", { count: "exact", head: true }).like("title", `${NOTIFICATION_FIXTURE.titlePrefix}%`);
  if (countError) throw new SafeFixtureError("Feature 012 notification residue check failed.");
  return { removedNotifications: removedNotifications?.length ?? 0, removedPreferences: removedPreferences?.length ?? 0, remainingTaggedNotifications: count ?? 0 };
}

async function cleanupRunECreatedRows(admin: SupabaseClient): Promise<void> {
  const removed: Record<string, number> = {};
  const count = async (label: string, promise: PromiseLike<{ data: { id: string }[] | null; error: unknown }>) => {
    const { data, error } = await promise;
    if (error) throw new SafeFixtureError(`RUN E created-row cleanup failed (${label}).`);
    removed[label] = data?.length ?? 0;
  };
  await count("coffees", admin.from("coffees").delete().eq("slug", RUN_E_CREATED_ROWS.coffeeSlug).select("id"));
  // The isolated coffee `scripts/live-verify-catalogue-media-translations.ts` creates. EXACT slug (never a
  // pattern): an interrupted verification run left it behind, and it then blocked the script's next insert.
  await count("coffees (live-media verification)", admin.from("coffees").delete().eq("slug", RUN_E_CREATED_ROWS.liveMediaCoffeeSlug).select("id"));
  const { data: warehouses } = await admin.from("warehouses").select("id").eq("code", RUN_E_CREATED_ROWS.warehouseCode);
  for (const warehouse of warehouses ?? []) await count("warehouse_locations", admin.from("warehouse_locations").delete().eq("warehouse_id", warehouse.id).select("id"));
  await count("warehouses", admin.from("warehouses").delete().eq("code", RUN_E_CREATED_ROWS.warehouseCode).select("id"));
  await count("origins", admin.from("origins").delete().eq("slug", RUN_E_CREATED_ROWS.originSlug).select("id"));
  await count("regions", admin.from("regions").delete().eq("slug", RUN_E_CREATED_ROWS.regionSlug).select("id"));
  await count("tags", admin.from("tags").delete().eq("slug", RUN_E_CREATED_ROWS.tagSlug).select("id"));
  console.log(JSON.stringify({ removed }));
}

/**
 * Database hygiene M2 — READ-ONLY. For each of the 13 tables that carry a DB-owned `updated_at` reports whether the
 * column is readable (PostgREST resolves it, i.e. it exists), how many rows exist and how many have a NULL value
 * (must be 0: the column is NOT NULL). Nothing is written.
 */
const M2_UPDATED_AT_TABLES = ["kyb_documents", "order_items", "coffee_media", "warehouse_locations", "coffee_types", "coffee_varieties", "processing_methods", "packaging_types", "tags", "origins", "regions", "warehouses", "offer_sensory_notes"] as const;
async function inspectUpdatedAtColumns(admin: SupabaseClient): Promise<void> {
  const report: Record<string, { readable: boolean; rows: number; nullUpdatedAt: number }> = {};
  for (const table of M2_UPDATED_AT_TABLES) {
    const all = await admin.from(table).select("updated_at", { count: "exact", head: true });
    const nulls = await admin.from(table).select("updated_at", { count: "exact", head: true }).is("updated_at", null);
    report[table] = { readable: !all.error && !nulls.error, rows: all.count ?? -1, nullUpdatedAt: nulls.count ?? -1 };
  }
  console.log(JSON.stringify(report));
}

/**
 * Feature 011 — disposable PRICING fixtures for the live reference-price proof (`tests/pricing/reference-prices-live.test.ts`).
 * Fixed ids / `F011-` codes so they are re-creatable and removable, and never collide with real data:
 *   sources        one APPROVED+active (two KC observations + an exchange-rate one that must never be displayed), one APPROVED+active
 *                  with a STALE ROBUSTA observation, and one each PENDING / RESTRICTED / DISABLED / inactive-APPROVED (each with a
 *                  distinct observation value that must never leak);
 *   differentials  two ACTIVE general ones (ORIGIN 12.50, QUALITY 0.75), one INACTIVE, one EXPIRED, one COFFEE-scoped (the RUN E
 *                  proof coffee — must not appear in the general scope).
 * Written with the service role (this script is outside the Next.js build graph); the product never writes these tables.
 */
const F011_SOURCES = {
  approved: { id: "f0110000-0000-4000-8000-000000000001", code: "F011-APPROVED" },
  stale: { id: "f0110000-0000-4000-8000-000000000002", code: "F011-STALE" },
  pending: { id: "f0110000-0000-4000-8000-000000000003", code: "F011-PENDING" },
  restricted: { id: "f0110000-0000-4000-8000-000000000004", code: "F011-RESTRICTED" },
  disabled: { id: "f0110000-0000-4000-8000-000000000005", code: "F011-DISABLED" },
  inactive: { id: "f0110000-0000-4000-8000-000000000006", code: "F011-INACTIVE" },
} as const;
const F011_DIFFERENTIAL_IDS = [
  "f0110000-0000-4000-8000-0000000000d1",
  "f0110000-0000-4000-8000-0000000000d2",
  "f0110000-0000-4000-8000-0000000000d3",
  "f0110000-0000-4000-8000-0000000000d4",
  "f0110000-0000-4000-8000-0000000000d5",
] as const;

async function cleanupPricingFixtures(admin: SupabaseClient): Promise<void> {
  const removed: Record<string, number> = {};
  const fixed = Object.values(F011_SOURCES).map((s) => s.id);
  // also any `F011-` source a live proof created on the fly (e.g. the administrator write-path proof), with its observations
  const tagged = await admin.from("price_sources").select("id").like("code", "F011-%");
  if (tagged.error) throw new SafeFixtureError("pricing fixture cleanup failed (lookup).");
  const ids = [...new Set([...fixed, ...(tagged.data ?? []).map((row) => row.id as string)])];
  const obs = await admin.from("price_observations").delete().in("price_source_id", ids).select("id");
  if (obs.error) throw new SafeFixtureError("pricing fixture cleanup failed (observations).");
  removed.observations = obs.data?.length ?? 0;
  const diffs = await admin.from("price_differentials").delete().in("id", [...F011_DIFFERENTIAL_IDS]).select("id");
  if (diffs.error) throw new SafeFixtureError("pricing fixture cleanup failed (differentials).");
  removed.differentials = diffs.data?.length ?? 0;
  const srcs = await admin.from("price_sources").delete().or(`id.in.(${ids.join(",")}),code.like.F011-%`).select("id");
  if (srcs.error) throw new SafeFixtureError("pricing fixture cleanup failed (sources).");
  removed.sources = srcs.data?.length ?? 0;
  console.log(JSON.stringify({ removed }));
}

async function seedPricingFixtures(admin: SupabaseClient): Promise<void> {
  await cleanupPricingFixtures(admin);
  const S = F011_SOURCES;
  const sources = await admin.from("price_sources").insert([
    { id: S.approved.id, name: "F011 Approved Source", code: S.approved.code, source_type: "ICE_ARABICA", licence_status: "APPROVED", delay_type: "DELAYED", delay_minutes: 15, is_active: true },
    { id: S.stale.id, name: "F011 Stale Source", code: S.stale.code, source_type: "ICE_ROBUSTA", licence_status: "APPROVED", delay_type: "DAILY", is_active: true },
    { id: S.pending.id, name: "F011 Pending Source", code: S.pending.code, source_type: "ICE_ARABICA", licence_status: "PENDING", delay_type: "DELAYED", is_active: true },
    { id: S.restricted.id, name: "F011 Restricted Source", code: S.restricted.code, source_type: "ICE_ARABICA", licence_status: "RESTRICTED", delay_type: "DELAYED", is_active: true },
    { id: S.disabled.id, name: "F011 Disabled Source", code: S.disabled.code, source_type: "ICE_ARABICA", licence_status: "DISABLED", delay_type: "DELAYED", is_active: true },
    { id: S.inactive.id, name: "F011 Inactive Source", code: S.inactive.code, source_type: "ICE_ARABICA", licence_status: "APPROVED", delay_type: "DELAYED", is_active: false },
  ]);
  if (sources.error) throw new SafeFixtureError("pricing fixture seeding failed (sources).");
  const obs = await admin.from("price_observations").insert([
    { price_source_id: S.approved.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "240.5", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-08-31T12:00:00Z", is_stale: false },
    { price_source_id: S.approved.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "250.125", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-01T12:00:00Z", is_stale: false },
    { price_source_id: S.approved.id, symbol: "EURUSD", commodity_type: "FX", raw_value: "1.0812", raw_currency: "USD", raw_unit: "rate", observed_at: "2026-09-01T12:00:00Z", is_stale: false },
    { price_source_id: S.stale.id, symbol: "RC", commodity_type: "ROBUSTA", raw_value: "4100.10", raw_currency: "USD", raw_unit: "USD/MT", observed_at: "2026-08-20T09:30:00Z", is_stale: true },
    { price_source_id: S.pending.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "111.111", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-01T12:00:00Z", is_stale: false },
    { price_source_id: S.restricted.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "222.222", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-01T12:00:00Z", is_stale: false },
    { price_source_id: S.disabled.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "333.333", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-01T12:00:00Z", is_stale: false },
    { price_source_id: S.inactive.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "444.444", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-01T12:00:00Z", is_stale: false },
  ]);
  if (obs.error) throw new SafeFixtureError("pricing fixture seeding failed (observations).");
  const D = F011_DIFFERENTIAL_IDS;
  const diffs = await admin.from("price_differentials").insert([
    { id: D[0], differential_type: "ORIGIN", amount: "12.50", currency: "USD", unit: "KG", effective_from: "2026-08-01T00:00:00Z", is_active: true, notes: "F011 internal note" },
    { id: D[1], differential_type: "QUALITY", amount: "0.75", currency: "USD", unit: "KG", effective_from: "2026-08-01T00:00:00Z", effective_until: "2099-01-01T00:00:00Z", is_active: true },
    { id: D[2], differential_type: "CROP", amount: "9.99", currency: "USD", unit: "KG", effective_from: "2026-08-01T00:00:00Z", is_active: false },
    { id: D[3], differential_type: "COMMERCIAL", amount: "7.77", currency: "USD", unit: "KG", effective_from: "2020-01-01T00:00:00Z", effective_until: "2020-12-31T00:00:00Z", is_active: true },
    { id: D[4], differential_type: "CERTIFICATION", amount: "5.55", currency: "USD", unit: "KG", effective_from: "2026-08-01T00:00:00Z", is_active: true, coffee_id: CATALOGUE_IDS.coffeeRunEProof },
  ]);
  if (diffs.error) throw new SafeFixtureError("pricing fixture seeding failed (differentials).");
  console.log(JSON.stringify({ seeded: { sources: 6, observations: 8, differentials: 5 } }));
}

/**
 * Feature 010 T049 — rows created THROUGH THE CONSOLE by the price-administration proofs carry a `F010P-` source code
 * (their observations follow the source) or a `F010P` note prefix (differentials). This removes exactly those rows —
 * the product itself never deletes reference data (no DELETE grant for `authenticated`).
 */
async function cleanupPriceAdminRows(admin: SupabaseClient): Promise<void> {
  const tagged = await admin.from("price_sources").select("id").like("code", "F010P-%");
  if (tagged.error) throw new SafeFixtureError("price-admin cleanup failed (lookup).");
  const ids = (tagged.data ?? []).map((row) => row.id as string);
  let observations = 0;
  if (ids.length > 0) {
    const obs = await admin.from("price_observations").delete().in("price_source_id", ids).select("id");
    if (obs.error) throw new SafeFixtureError("price-admin cleanup failed (observations).");
    observations = obs.data?.length ?? 0;
  }
  const diffs = await admin.from("price_differentials").delete().like("notes", "F010P%").select("id");
  if (diffs.error) throw new SafeFixtureError("price-admin cleanup failed (differentials).");
  const srcs = await admin.from("price_sources").delete().like("code", "F010P-%").select("id");
  if (srcs.error) throw new SafeFixtureError("price-admin cleanup failed (sources).");
  console.log(JSON.stringify({ removed: { observations, differentials: diffs.data?.length ?? 0, sources: srcs.data?.length ?? 0 } }));
}

/**
 * Feature 010 T049 browser proof ONLY — a write made OUTSIDE the product (privileged script, no revalidation), used to
 * show the public reference-price result is genuinely cached: this row must NOT appear publicly until a console
 * mutation revalidates the tag. Input: `F010P_DIRECT_OBSERVATION` = JSON {sourceCode, symbol, rawValue, observedAt}.
 */
async function insertPriceAdminDirectObservation(admin: SupabaseClient): Promise<void> {
  const input = JSON.parse(requireEnv("F010P_DIRECT_OBSERVATION")) as { sourceCode: string; symbol: string; rawValue: string; observedAt: string };
  if (!input.sourceCode.startsWith("F010P-")) throw new SafeFixtureError("direct observation is limited to F010P- sources.");
  const source = await admin.from("price_sources").select("id").eq("code", input.sourceCode).single();
  if (source.error || !source.data) throw new SafeFixtureError("direct observation: source not found.");
  const inserted = await admin.from("price_observations").insert({ price_source_id: source.data.id, symbol: input.symbol, commodity_type: "ARABICA", raw_value: input.rawValue, raw_currency: "USD", raw_unit: "cents/lb", observed_at: input.observedAt }).select("id").single();
  if (inserted.error) throw new SafeFixtureError("direct observation insert failed.");
  console.log(JSON.stringify({ inserted: inserted.data.id }));
}

/**
 * Feature 010 RUN E (KYB review coherence) — stages `completeDraft`'s TRADE_LICENSE document into a
 * given persisted state so the live suite can prove the server-side approval gate against a REAL
 * row (PENDING / REJECTED / an expired ACCEPTED document). `kyb_documents` has no RLS-granted update
 * path for anyone (Feature 003 REVIEW FIX #2), so only this privileged script can stage it; the
 * canonical state (`ACCEPTED`, no expiry) is restored by `--reset-complete-draft-application`.
 * The append-only `kyb_review_items` ledger is never touched.
 */
async function stageCompleteDraftDocument(admin: SupabaseClient, mode: "PENDING" | "REJECTED" | "EXPIRED" | "ACCEPTED"): Promise<void> {
  const patch = mode === "EXPIRED" ? { status: "ACCEPTED", expires_at: "2020-01-01" } : { status: mode, expires_at: null };
  const { data, error } = await admin.from("kyb_documents").update(patch).eq("id", COMPLETE_DRAFT_DOCUMENT_IDS.TRADE_LICENSE.documentId).select("id, status, expires_at").maybeSingle();
  if (error) throw new SafeFixtureError("fixture document staging failed.");
  if (!data) throw new Error("complete-draft TRADE_LICENSE fixture document is missing; run npm run test:seed first");
  console.log(JSON.stringify({ documentId: data.id, status: data.status, expiresAt: data.expires_at }));
}

/** Read-only: the disposable operator fixture's current capability state (for post-cleanup proof). */
async function inspectDisposableOperatorFixture(admin: SupabaseClient, fixture: Fixture): Promise<Record<string, unknown>> {
  const userId = await findAuthUserIdByEmail(admin, fixture.email);
  if (!userId) return { present: false, activeCapability: false, role: fixture.platformAdminRole };
  const [{ data: capability }, { count: membershipCount }, { data: profile }] = await Promise.all([
    admin.from("platform_admins").select("role, is_active").eq("user_id", userId).maybeSingle(),
    admin.from("organization_members").select("organization_id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("profiles").select("is_blocked").eq("id", userId).maybeSingle(),
  ]);
  return {
    present: true,
    userId,
    role: fixture.platformAdminRole,
    activeCapability: capability?.is_active === true,
    capabilityRole: capability?.role ?? null,
    organizationMemberships: membershipCount ?? 0,
    isBlocked: profile?.is_blocked ?? null,
  };
}

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

// ---------------------------------------------------------------------------
// Feature 013 T016 — bank-transfer commerce fixtures (AUTHORED IN BATCH A; NOT RUN IN BATCH A)
// ---------------------------------------------------------------------------
//
// Exact identities only (tasks.md T016): buyer A, buyer B, member sellers S1/S2, a Hills-internal seller, and four
// disposable operators (finance, warehouse, auditor, admin). Fixed ids live in the reserved `13000000-…` range so
// they can never collide with application-generated rows. Every read/write below targets one of these exact ids or
// emails — no wildcard, pattern or range filter.
//
// PRODUCTION SAFETY (Batch A preflight finding): the linked project is production and currently has NO shipping
// rule, NO commission policy and NO payment account. The commerce configuration rows created here are therefore
// GLOBAL. They are named "F013 FIXTURE — …", the bank account is fake and marked NOT FOR PAYMENT, and they are only
// usable while `commerce_settings.bank_transfer_checkout_enabled` is false (pilot fixture organizations only).
// Cleanup deactivates/archives them (they may be referenced by immutable snapshots, so they are never deleted), and
// T235 (production activation) must verify they are inactive before the global switch is flipped.
//
// `--prepare-f013-fixtures` additionally requires F013_FIXTURES_APPROVED=1 (explicit human approval per run) and the
// verified project ref. `--inspect-f013-fixtures` is read-only. `--cleanup-f013-fixtures` never hard-deletes a
// business or financial row: it suspends the fixture organizations, de-lists fixture offers through the ordinary
// suspension path, deactivates/archives fixture configuration, and de-privileges the operator fixtures through the
// existing exact-identity helper.

const F013_PROJECT_REF = "mxejnutukgxyccnohglo";

const F013_FIXTURE_IDS = {
  orgBuyerA: "13000000-0000-4000-8000-000000000001",
  orgBuyerB: "13000000-0000-4000-8000-000000000002",
  orgSellerS1: "13000000-0000-4000-8000-000000000003",
  orgSellerS2: "13000000-0000-4000-8000-000000000004",
  orgHills: "13000000-0000-4000-8000-000000000005",
  kybBuyerA: "13000000-0000-4000-8000-000000000011",
  kybBuyerB: "13000000-0000-4000-8000-000000000012",
  kybSellerS1: "13000000-0000-4000-8000-000000000013",
  kybSellerS2: "13000000-0000-4000-8000-000000000014",
  warehouse1: "13000000-0000-4000-8000-000000000021",
  warehouse2: "13000000-0000-4000-8000-000000000022",
  coffee: "13000000-0000-4000-8000-000000000031",
  lotS1W1: "13000000-0000-4000-8000-000000000041",
  lotS2W2: "13000000-0000-4000-8000-000000000042",
  lotHillsW1: "13000000-0000-4000-8000-000000000043",
  lotS1W2: "13000000-0000-4000-8000-000000000044",
  positionS1W1: "13000000-0000-4000-8000-000000000051",
  positionS2W2: "13000000-0000-4000-8000-000000000052",
  positionHillsW1: "13000000-0000-4000-8000-000000000053",
  positionS1W2: "13000000-0000-4000-8000-000000000054",
  offerS1W1: "13000000-0000-4000-8000-000000000061",
  offerS2W2: "13000000-0000-4000-8000-000000000062",
  offerHillsW1: "13000000-0000-4000-8000-000000000063",
  offerS1W2: "13000000-0000-4000-8000-000000000064",
  paymentAccount: "13000000-0000-4000-8000-000000000071",
  shippingRule: "13000000-0000-4000-8000-000000000072",
  commissionPolicy: "13000000-0000-4000-8000-000000000073",
  commissionTierLow: "13000000-0000-4000-8000-000000000074",
  commissionTierHigh: "13000000-0000-4000-8000-000000000075",
} as const;

type F013Member = { key: "buyerA" | "buyerB" | "sellerS1" | "sellerS2"; email: string; fullName: string; orgId: string; kybId: string; legalName: string; displayName: string; accountType: "BUYER" | "SELLER"; canSell: boolean };

const F013_MEMBERS: readonly F013Member[] = [
  { key: "buyerA", email: "buyer-a+f013-test@example.com", fullName: "F013 Fixture — Buyer A", orgId: F013_FIXTURE_IDS.orgBuyerA, kybId: F013_FIXTURE_IDS.kybBuyerA, legalName: "F013 Fixture Buyer A FZE", displayName: "F013 Fixture — Buyer A", accountType: "BUYER", canSell: false },
  { key: "buyerB", email: "buyer-b+f013-test@example.com", fullName: "F013 Fixture — Buyer B", orgId: F013_FIXTURE_IDS.orgBuyerB, kybId: F013_FIXTURE_IDS.kybBuyerB, legalName: "F013 Fixture Buyer B FZE", displayName: "F013 Fixture — Buyer B", accountType: "BUYER", canSell: false },
  { key: "sellerS1", email: "seller-s1+f013-test@example.com", fullName: "F013 Fixture — Seller S1", orgId: F013_FIXTURE_IDS.orgSellerS1, kybId: F013_FIXTURE_IDS.kybSellerS1, legalName: "F013 Fixture Seller S1 FZE", displayName: "F013 Fixture — Seller S1", accountType: "SELLER", canSell: true },
  { key: "sellerS2", email: "seller-s2+f013-test@example.com", fullName: "F013 Fixture — Seller S2", orgId: F013_FIXTURE_IDS.orgSellerS2, kybId: F013_FIXTURE_IDS.kybSellerS2, legalName: "F013 Fixture Seller S2 FZE", displayName: "F013 Fixture — Seller S2", accountType: "SELLER", canSell: true },
];

const F013_OPERATORS: readonly Fixture[] = [
  { label: "f013-finance", email: "finance+f013-test@example.com", fullName: "F013 Fixture — Finance Operator", organization: null, platformAdminRole: "FINANCE" },
  { label: "f013-warehouse", email: "warehouse+f013-test@example.com", fullName: "F013 Fixture — Warehouse Operator", organization: null, platformAdminRole: "WAREHOUSE" },
  { label: "f013-auditor", email: "auditor+f013-test@example.com", fullName: "F013 Fixture — Auditor", organization: null, platformAdminRole: "AUDITOR" },
  { label: "f013-admin", email: "admin+f013-test@example.com", fullName: "F013 Fixture — Platform Admin", organization: null, platformAdminRole: "ADMIN" },
];

const F013_LISTINGS = [
  { offer: F013_FIXTURE_IDS.offerS1W1, lot: F013_FIXTURE_IDS.lotS1W1, position: F013_FIXTURE_IDS.positionS1W1, seller: F013_FIXTURE_IDS.orgSellerS1, sellerType: "MEMBER_SELLER", warehouse: F013_FIXTURE_IDS.warehouse1, lotCode: "F013-LOT-S1-W1", title: "F013 Fixture — S1 @ W1", quantityKg: 500, pricePerKg: 11.4 },
  { offer: F013_FIXTURE_IDS.offerS2W2, lot: F013_FIXTURE_IDS.lotS2W2, position: F013_FIXTURE_IDS.positionS2W2, seller: F013_FIXTURE_IDS.orgSellerS2, sellerType: "MEMBER_SELLER", warehouse: F013_FIXTURE_IDS.warehouse2, lotCode: "F013-LOT-S2-W2", title: "F013 Fixture — S2 @ W2", quantityKg: 300, pricePerKg: 9.85 },
  { offer: F013_FIXTURE_IDS.offerHillsW1, lot: F013_FIXTURE_IDS.lotHillsW1, position: F013_FIXTURE_IDS.positionHillsW1, seller: F013_FIXTURE_IDS.orgHills, sellerType: "HILLS", warehouse: F013_FIXTURE_IDS.warehouse1, lotCode: "F013-LOT-HILLS-W1", title: "F013 Fixture — Hills @ W1", quantityKg: 400, pricePerKg: 12.2 },
  { offer: F013_FIXTURE_IDS.offerS1W2, lot: F013_FIXTURE_IDS.lotS1W2, position: F013_FIXTURE_IDS.positionS1W2, seller: F013_FIXTURE_IDS.orgSellerS1, sellerType: "MEMBER_SELLER", warehouse: F013_FIXTURE_IDS.warehouse2, lotCode: "F013-LOT-S1-W2", title: "F013 Fixture — S1 @ W2", quantityKg: 50, pricePerKg: 10.05 },
] as const;

function assertF013Project(): void {
  const ref = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
  if (ref !== F013_PROJECT_REF) throw new SafeFixtureError(`F013 fixtures refuse to run against project ${ref}.`);
}

async function inspectF013Fixtures(admin: SupabaseClient): Promise<Record<string, unknown>> {
  assertF013Project();
  const present = async (table: string, id: string): Promise<boolean> => {
    const { data, error } = await admin.from(table).select("id").eq("id", id).maybeSingle();
    if (error) throw new SafeFixtureError(`${table} inspect failed.`);
    return data !== null;
  };
  const users: Record<string, boolean> = {};
  for (const identity of [...F013_MEMBERS.map((m) => m.email), ...F013_OPERATORS.map((o) => o.email)]) users[identity] = (await findAuthUserIdByEmail(admin, identity)) !== null;
  const rows: Record<string, boolean> = {};
  for (const [name, id] of Object.entries(F013_FIXTURE_IDS)) {
    const table = name.startsWith("org") ? "organizations" : name.startsWith("kyb") ? "kyb_applications" : name.startsWith("warehouse") ? "warehouses" : name === "coffee" ? "coffees" : name.startsWith("lot") ? "coffee_lots" : name.startsWith("position") ? "inventory_positions" : name.startsWith("offer") ? "coffee_offers" : name === "paymentAccount" ? "payment_accounts" : name === "shippingRule" ? "shipping_rules" : name === "commissionPolicy" ? "commission_policies" : "commission_tiers";
    rows[name] = await present(table, id);
  }
  return { users, rows };
}

async function prepareF013Fixtures(admin: SupabaseClient, password: string): Promise<void> {
  assertF013Project();
  if (process.env.F013_FIXTURES_APPROVED !== "1") {
    throw new SafeFixtureError("--prepare-f013-fixtures requires F013_FIXTURES_APPROVED=1 (explicit human approval for this run).");
  }
  const upsert = async (table: string, row: Record<string, unknown>, onConflict = "id"): Promise<void> => {
    const { error } = await admin.from(table).upsert(row, { onConflict });
    if (error) throw new SafeFixtureError(`${table} upsert failed (Feature 013 fixtures): ${error.message}`);
  };
  const insertIfAbsent = async (table: string, row: Record<string, unknown> & { id: string }): Promise<void> => {
    const { data, error } = await admin.from(table).select("id").eq("id", row.id).maybeSingle();
    if (error) throw new SafeFixtureError(`${table} existence check failed (Feature 013 fixtures).`);
    if (data) return;
    const { error: insertError } = await admin.from(table).insert(row);
    if (insertError) throw new SafeFixtureError(`${table} insert failed (Feature 013 fixtures): ${insertError.message}`);
  };

  for (const member of F013_MEMBERS) {
    const { userId } = await ensureAuthUser(admin, member.email, password);
    await upsert("profiles", { id: userId, full_name: member.fullName, company_name: member.displayName, is_blocked: false });
    await upsert("organizations", { id: member.orgId, legal_name: member.legalName, display_name: member.displayName, account_type: member.accountType, status: "ACTIVE", is_hills_internal: false, can_buy: true, can_sell: member.canSell });
    await upsert("kyb_applications", { id: member.kybId, organization_id: member.orgId, submitted_by: userId, status: "APPROVED", submitted_at: new Date(0).toISOString(), decided_at: new Date(0).toISOString() });
    await upsert("organization_members", { organization_id: member.orgId, user_id: userId, member_role: "OWNER", is_active: true }, "organization_id,user_id");
  }
  await upsert("organizations", { id: F013_FIXTURE_IDS.orgHills, legal_name: "F013 Fixture — Hills Internal FZE", display_name: "F013 Fixture — Hills Internal", account_type: "HILLS_INTERNAL", status: "ACTIVE", is_hills_internal: true, can_buy: true, can_sell: true });

  await upsert("warehouses", { id: F013_FIXTURE_IDS.warehouse1, owner_organization_id: F013_FIXTURE_IDS.orgHills, code: "F013-WH-1", name: "F013 Fixture Warehouse 1", country_code: "AE", city: "Dubai", is_active: true });
  await upsert("warehouses", { id: F013_FIXTURE_IDS.warehouse2, owner_organization_id: F013_FIXTURE_IDS.orgHills, code: "F013-WH-2", name: "F013 Fixture Warehouse 2", country_code: "AE", city: "Jebel Ali", is_active: true });
  // DRAFT keeps the synthetic coffee off the public catalogue.
  await upsert("coffees", { id: F013_FIXTURE_IDS.coffee, name: "F013 Fixture Coffee", slug: "f013-fixture-coffee", status: "DRAFT" });

  for (const listing of F013_LISTINGS) {
    await upsert("coffee_lots", { id: listing.lot, coffee_id: F013_FIXTURE_IDS.coffee, lot_code: listing.lotCode, total_quantity_kg: listing.quantityKg, status: "AVAILABLE", source_organization_id: F013_FIXTURE_IDS.orgHills });
    await upsert("inventory_positions", { id: listing.position, lot_id: listing.lot, owner_organization_id: listing.seller, warehouse_id: listing.warehouse, available_quantity_kg: listing.quantityKg, reserved_quantity_kg: 0 });
    await insertIfAbsent("coffee_offers", { id: listing.offer, coffee_id: F013_FIXTURE_IDS.coffee, lot_id: listing.lot, seller_organization_id: listing.seller, seller_type: listing.sellerType, warehouse_id: listing.warehouse, title: listing.title, quantity_kg: listing.quantityKg, reserved_quantity_kg: 0, filled_quantity_kg: 0, price_per_kg: listing.pricePerKg, currency: "USD", status: "PUBLISHED", is_visible: true, created_by: (await findAuthUserIdByEmail(admin, F013_MEMBERS[2]!.email))! });
  }

  // Commerce configuration (GLOBAL in this project — see the block header). Fake, clearly-labelled values only.
  await insertIfAbsent("payment_accounts", { id: F013_FIXTURE_IDS.paymentAccount, account_name: "F013 FIXTURE — NOT FOR PAYMENT", bank_name: "F013 Fixture Bank (not a real account)", account_number: "0000000000000013", iban: "AE000000000000000000013", swift_code: "FIXTAEXX", currency: "USD", is_active: true, created_by: (await findAuthUserIdByEmail(admin, F013_OPERATORS[3]!.email)) ?? (await findAuthUserIdByEmail(admin, F013_MEMBERS[0]!.email))! });
  const defaultFlagProbe = await admin.from("payment_accounts").select("is_default_for_currency").eq("id", F013_FIXTURE_IDS.paymentAccount).maybeSingle();
  if (!defaultFlagProbe.error) {
    // Column exists only after Feature 013 M1. Set it only when no other active USD default exists.
    const { count } = await admin.from("payment_accounts").select("id", { count: "exact", head: true }).eq("currency", "USD").eq("is_active", true).eq("is_default_for_currency", true);
    if (!count) await upsert("payment_accounts", { id: F013_FIXTURE_IDS.paymentAccount, is_default_for_currency: true });
  }
  await insertIfAbsent("shipping_rules", { id: F013_FIXTURE_IDS.shippingRule, country_code: "AE", delivery_method: "Courier", flat_fee: 25, currency: "USD", is_active: true });
  await insertIfAbsent("commission_policies", { id: F013_FIXTURE_IDS.commissionPolicy, name: "F013 FIXTURE — commission policy", status: "ACTIVE", created_by: (await findAuthUserIdByEmail(admin, F013_MEMBERS[0]!.email))! });
  await insertIfAbsent("commission_tiers", { id: F013_FIXTURE_IDS.commissionTierLow, policy_id: F013_FIXTURE_IDS.commissionPolicy, min_quantity_kg: 0, max_quantity_kg: 200, percentage: 8 });
  await insertIfAbsent("commission_tiers", { id: F013_FIXTURE_IDS.commissionTierHigh, policy_id: F013_FIXTURE_IDS.commissionPolicy, min_quantity_kg: 200, max_quantity_kg: null, percentage: 5 });

  for (const operator of F013_OPERATORS) {
    await createDisposableOperatorFixture(admin, password, operator, `feature-013-${operator.label}`, { reuseIfActive: true });
  }
  console.log(JSON.stringify(await inspectF013Fixtures(admin)));
}

async function cleanupF013Fixtures(admin: SupabaseClient): Promise<Record<string, unknown>> {
  assertF013Project();
  const result: Record<string, unknown> = {};
  // Suspend fixture organizations: they can no longer buy or sell. Nothing is deleted.
  for (const orgId of [F013_FIXTURE_IDS.orgBuyerA, F013_FIXTURE_IDS.orgBuyerB, F013_FIXTURE_IDS.orgSellerS1, F013_FIXTURE_IDS.orgSellerS2, F013_FIXTURE_IDS.orgHills]) {
    const { error } = await admin.from("organizations").update({ status: "SUSPENDED" }).eq("id", orgId);
    if (error) throw new SafeFixtureError("F013 fixture organization suspension failed.");
  }
  result.organizationsSuspended = 5;
  // De-list fixture offers through the ordinary suspension status (no delete; reserved/filled ledgers retained).
  for (const listing of F013_LISTINGS) {
    const { error } = await admin.from("coffee_offers").update({ status: "SUSPENDED", is_visible: false }).eq("id", listing.offer).in("status", ["PUBLISHED", "PARTIALLY_FILLED"]);
    if (error) throw new SafeFixtureError("F013 fixture offer suspension failed.");
  }
  // Global commerce configuration: deactivate / archive, never delete (may be referenced by immutable snapshots).
  const { error: accountError } = await admin.from("payment_accounts").update({ is_active: false }).eq("id", F013_FIXTURE_IDS.paymentAccount);
  const { error: shippingError } = await admin.from("shipping_rules").update({ is_active: false }).eq("id", F013_FIXTURE_IDS.shippingRule);
  const { error: policyError } = await admin.from("commission_policies").update({ status: "ARCHIVED" }).eq("id", F013_FIXTURE_IDS.commissionPolicy);
  if (accountError || shippingError || policyError) throw new SafeFixtureError("F013 fixture configuration deactivation failed.");
  result.configurationDeactivated = true;
  const operators: Record<string, unknown> = {};
  for (const operator of F013_OPERATORS) operators[operator.label] = await cleanupDisposableOperatorFixture(admin, operator);
  result.operators = operators;
  result.retained = "Orders, proformas, payments, proofs, invoices, payouts, ownership events and audit rows created by live proofs are retained (no hard delete).";
  return result;
}

// ── Feature 013 T025 — M1 live proof (tests/commerce/schema-m1.live.test.ts) ─────────────────────────────────────
// Deliberately does NOT use --prepare-f013-fixtures: that creates GLOBAL active commerce configuration (shipping rule,
// commission policy, default payment account) that legacy checkout would read. M1's proof needs only disposable,
// PRE-FINANCIAL order rows: exact ids in the reserved 13000000-…-00000001xx range, owned by the existing Foundation
// buyer-only fixture and stamped with the proof marker in orders.correlation_id by --f013-m1-live-setup.
//
// THE ONE HARD-DELETE EXCEPTION (owner-approved 2026-09-25, T025/T016; disposable pre-financial proof fixtures ONLY).
// The general Feature 013 rule stays: exact ids only, never a hard delete of a real business or financial row.
// deleteF013M1ProofOrders() may delete an order only when ALL hold, checked first, and nothing is deleted otherwise:
//   - its id is one of the exact F013_M1_ORDER_IDS (no wildcard, pattern or range filter);
//   - it carries the proof marker (so it was created by the dedicated M1 proof-fixture command);
//   - it is owned by the Foundation buyer-only fixture organization;
//   - it has no order_items, payments (so no payment proofs/reviews), inventory_reservations, proforma_invoices,
//     order_financials (no amount / economic snapshot), order_shipments, payouts, tax_invoices or support_tickets.
// Only its own order_status_history rows cascade. Audit rows remain (append-only).
const F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001ff";
const F013_M1_ORDER_IDS = {
  legacyDraft: "13000000-0000-4000-8000-000000000101",
  legacyDraftRefusals: "13000000-0000-4000-8000-000000000102",
  legacyDisputed: "13000000-0000-4000-8000-000000000103",
  legacyDraftForMember: "13000000-0000-4000-8000-000000000104",
  v1Draft: "13000000-0000-4000-8000-000000000111",
  v1Paid: "13000000-0000-4000-8000-000000000112",
  v1ProformaIssued: "13000000-0000-4000-8000-000000000113",
  v1Cancelled: "13000000-0000-4000-8000-000000000114",
  v1PaymentRejected: "13000000-0000-4000-8000-000000000115",
  bogusStatus: "13000000-0000-4000-8000-000000000119",
} as const;
const F013_M1_ALL_IDS = Object.values(F013_M1_ORDER_IDS);

/** Every table that references orders(id) (plus order_status_history), per the schema. */
const F013_M1_ORDER_DEPENDENTS = [
  "order_items", "payments", "inventory_reservations", "proforma_invoices", "order_financials",
  "order_shipments", "payouts", "tax_invoices", "support_tickets",
] as const;

/** Read-only: rows still present for the exact proof ids, per table (all zero after a clean run). */
async function verifyF013M1ProofCleanup(admin: SupabaseClient): Promise<Record<string, number>> {
  assertF013Project();
  const counts: Record<string, number> = {};
  for (const table of ["orders", "order_status_history", ...F013_M1_ORDER_DEPENDENTS]) {
    const column = table === "orders" ? "id" : "order_id";
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).in(column, F013_M1_ALL_IDS);
    if (error) throw new SafeFixtureError(`F013 M1 cleanup verification failed on ${table}.`);
    counts[table] = count ?? -1;
  }
  return counts;
}

/**
 * The single approved hard delete in the F013 block (see the header above). Refuses, deleting nothing, unless every
 * existing proof order satisfies every precondition.
 */
async function deleteF013M1ProofOrders(admin: SupabaseClient): Promise<number> {
  assertF013Project();
  const { data: orders, error } = await admin.from("orders").select("id, correlation_id, buyer_organization_id").in("id", F013_M1_ALL_IDS);
  if (error) throw new SafeFixtureError("F013 M1 proof-order read failed.");
  const problems: string[] = [];
  for (const order of orders ?? []) {
    if (order.correlation_id !== F013_M1_PROOF_MARKER) problems.push(`${order.id}: no proof marker`);
    if (order.buyer_organization_id !== ORGANIZATION_IDS.buyerOnly) problems.push(`${order.id}: not the buyer-only fixture org`);
  }
  const ids = (orders ?? []).map((order) => order.id as string);
  if (ids.length > 0) {
    for (const table of F013_M1_ORDER_DEPENDENTS) {
      const { count, error: countError } = await admin.from(table).select("*", { count: "exact", head: true }).in("order_id", ids);
      if (countError) throw new SafeFixtureError(`F013 M1 dependency check failed on ${table}.`);
      if ((count ?? 0) !== 0) problems.push(`${table}: ${count} row(s)`);
    }
  }
  if (problems.length > 0) throw new SafeFixtureError(`F013 M1 proof-order delete refused (nothing deleted): ${problems.join("; ")}`);
  if (ids.length === 0) return 0;
  const { error: deleteError } = await admin.from("orders").delete().in("id", ids).eq("correlation_id", F013_M1_PROOF_MARKER);
  if (deleteError) throw new SafeFixtureError("F013 M1 proof-order delete failed.");
  return ids.length;
}

async function cleanupF013M1LiveOrders(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const deleted = await deleteF013M1ProofOrders(admin);
  return { deleted, remaining: await verifyF013M1ProofCleanup(admin) };
}

async function setupF013M1LiveOrders(admin: SupabaseClient): Promise<Record<string, unknown>> {
  assertF013Project();
  await deleteF013M1ProofOrders(admin);
  const buyer = await findAuthUserIdByEmail(admin, "buyer-only+foundation-test@example.com");
  if (!buyer) throw new SafeFixtureError("Foundation buyer-only fixture missing; run npm run test:seed first.");
  const row = (id: string, status: string, commerceFlow: "LEGACY" | "BANK_TRANSFER_V1") => ({
    id, buyer_organization_id: ORGANIZATION_IDS.buyerOnly, created_by: buyer, status, commerce_flow: commerceFlow,
    correlation_id: F013_M1_PROOF_MARKER,
  });
  const rows = [
    row(F013_M1_ORDER_IDS.legacyDraft, "DRAFT", "LEGACY"),
    row(F013_M1_ORDER_IDS.legacyDraftRefusals, "DRAFT", "LEGACY"),
    row(F013_M1_ORDER_IDS.legacyDisputed, "DISPUTED", "LEGACY"),
    row(F013_M1_ORDER_IDS.legacyDraftForMember, "DRAFT", "LEGACY"),
    row(F013_M1_ORDER_IDS.v1Draft, "DRAFT", "BANK_TRANSFER_V1"),
    row(F013_M1_ORDER_IDS.v1Paid, "PAID", "BANK_TRANSFER_V1"),
  ];
  const { error } = await admin.from("orders").insert(rows);
  if (error) throw new SafeFixtureError(`F013 M1 live-proof setup failed: ${error.message}`);
  return { created: rows.length, memberOrderId: F013_M1_ORDER_IDS.legacyDraftForMember };
}

/** Service-role probes: the service role is neither an internal transition nor a platform admin. */
async function probeF013M1Transitions(admin: SupabaseClient): Promise<Record<string, unknown>> {
  assertF013Project();
  const ids = F013_M1_ORDER_IDS;
  const attempt = async (key: keyof typeof F013_M1_ORDER_IDS, patch: Record<string, unknown>) => {
    const { error } = await admin.from("orders").update(patch).eq("id", F013_M1_ORDER_IDS[key]);
    return error ? error.message : "OK";
  };
  const insert = async (id: string, status: string, commerceFlow: string) => {
    const buyer = await findAuthUserIdByEmail(admin, "buyer-only+foundation-test@example.com");
    const { error } = await admin.from("orders").insert({ id, buyer_organization_id: ORGANIZATION_IDS.buyerOnly, created_by: buyer, status, commerce_flow: commerceFlow, correlation_id: F013_M1_PROOF_MARKER });
    return error ? error.message : "OK";
  };
  const result: Record<string, unknown> = {
    legacyDraftToConfirmed: await attempt("legacyDraft", { status: "CONFIRMED" }),
    legacyDraftToProformaIssued: await attempt("legacyDraftRefusals", { status: "PROFORMA_ISSUED" }),
    legacyDraftToCancelled: await attempt("legacyDraftRefusals", { status: "CANCELLED" }),
    legacyDisputedToPaymentRejected: await attempt("legacyDisputed", { status: "PAYMENT_REJECTED" }),
    legacyFlowToV1: await attempt("legacyDraftRefusals", { commerce_flow: "BANK_TRANSFER_V1" }),
    legacyManualAdjustment: await attempt("legacyDraftRefusals", { has_manual_adjustment: true }),
    v1DraftToProformaIssued: await attempt("v1Draft", { status: "PROFORMA_ISSUED" }),
    v1DraftToConfirmed: await attempt("v1Draft", { status: "CONFIRMED" }),
    v1DraftToCancelled: await attempt("v1Draft", { status: "CANCELLED" }),
    v1PaidToVoid: await attempt("v1Paid", { status: "VOID" }),
    v1PaidToDisputed: await attempt("v1Paid", { status: "DISPUTED" }),
    v1FlowToLegacy: await attempt("v1Draft", { commerce_flow: "LEGACY" }),
    v1CancelReason: await attempt("v1Draft", { cancel_reason: "probe" }),
    v1UnrelatedColumnUpdate: await attempt("v1Draft", { updated_at: new Date().toISOString() }),
    checkAcceptsV1ProformaIssued: await insert(ids.v1ProformaIssued, "PROFORMA_ISSUED", "BANK_TRANSFER_V1"),
    checkAcceptsV1Cancelled: await insert(ids.v1Cancelled, "CANCELLED", "BANK_TRANSFER_V1"),
    checkAcceptsV1PaymentRejected: await insert(ids.v1PaymentRejected, "PAYMENT_REJECTED", "BANK_TRANSFER_V1"),
    checkRefusesUnknownStatus: await insert(ids.bogusStatus, "BOGUS", "BANK_TRANSFER_V1"),
    checkRefusesUnknownFlow: await insert(ids.bogusStatus, "DRAFT", "STRIPE"),
  };
  const { data } = await admin.from("orders").select("id, status, commerce_flow, has_manual_adjustment, cancel_reason").in("id", F013_M1_ALL_IDS).order("id");
  result.finalRows = data ?? [];
  return result;
}

/** Read-only: M1 production state (T025). */
async function probeF013M1Schema(admin: SupabaseClient): Promise<Record<string, unknown>> {
  assertF013Project();
  const offers: { offer_code: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("coffee_offers").select("offer_code").range(from, from + 999);
    if (error) throw new SafeFixtureError(`offer read failed: ${error.message}`);
    offers.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const codes = offers.map((o) => o.offer_code);
  const flows: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("orders").select("id, commerce_flow").order("id").range(from, from + 999);
    if (error) throw new SafeFixtureError(`order read failed: ${error.message}`);
    // The proof's own rows are excluded by exact id, client-side (no pattern/range filter in the F013 block).
    for (const r of data ?? []) if (!(F013_M1_ALL_IDS as readonly string[]).includes(r.id)) flows[r.commerce_flow] = (flows[r.commerce_flow] ?? 0) + 1;
    if (!data || data.length < 1000) break;
  }
  const { data: settings, error: settingsError } = await admin.from("commerce_settings").select("*");
  const { count: proofsWithoutSubmittedAt } = await admin.from("payment_proofs").select("id", { count: "exact", head: true }).is("submitted_at", null);
  const { count: defaultAccounts } = await admin.from("payment_accounts").select("id", { count: "exact", head: true }).eq("is_default_for_currency", true);
  const { count: requestLogRows } = await admin.from("commerce_request_log").select("request_id", { count: "exact", head: true });
  return {
    offers: offers.length,
    offerCodeNull: codes.filter((c) => c === null).length,
    offerCodeBadFormat: codes.filter((c) => c !== null && !/^LST-[0-9]{7,}$/.test(c)).length,
    offerCodeDistinct: new Set(codes).size,
    orderFlows: flows,
    settings: settingsError ? settingsError.message : settings,
    proofsWithoutSubmittedAt,
    defaultAccounts,
    requestLogRows,
  };
}

// ── Feature 013 T031 — M2a live proof (tests/commerce/rls-destinations.live.test.ts) ─────────────────────────────
// Minimum fixture rows: two synthetic, PII-free delivery destinations with exact ids, one per Foundation fixture org
// (buyer-only = the owning buyer; buyer-and-seller = another organization, seller-capable), each carrying the proof
// label. The platform-admin view uses the exact F013 operator identity (admin+f013-test@example.com), created and
// removed by the existing disposable-operator helpers. No global configuration, listing or financial row is created.
//
// SECOND NAMED HARD-DELETE EXCEPTION (owner-approved 2026-09-25, T031 "clean them up afterwards by exact id"; disposable
// proof destinations ONLY). deleteF013T031ProofDestinations() deletes nothing (it throws) unless EVERY existing row:
//   - has one of the exact F013_T031_DESTINATION_IDS (no wildcard, pattern or range filter);
//   - carries the proof label written only by --f013-t031-setup;
//   - belongs to one of the two Foundation fixture organizations;
//   - is referenced by no order (orders.delivery_destination_id).
const F013_T031_PROOF_LABEL = "F013 T031 PROOF FIXTURE";
const F013_T031_DESTINATION_IDS = {
  buyerOnly: "13000000-0000-4000-8000-0000000002a1",
  otherOrg: "13000000-0000-4000-8000-0000000002b1",
} as const;
const F013_T031_ALL_DESTINATION_IDS = Object.values(F013_T031_DESTINATION_IDS);
const F013_T031_ADMIN = F013_OPERATORS.find((operator) => operator.label === "f013-admin")!;

async function deleteF013T031ProofDestinations(admin: SupabaseClient): Promise<number> {
  assertF013Project();
  const { data: rows, error } = await admin.from("delivery_destinations").select("id, label, organization_id").in("id", F013_T031_ALL_DESTINATION_IDS);
  if (error) throw new SafeFixtureError("F013 T031 proof-destination read failed.");
  const problems: string[] = [];
  for (const row of rows ?? []) {
    if (row.label !== F013_T031_PROOF_LABEL) problems.push(`${row.id}: no proof label`);
    if (row.organization_id !== ORGANIZATION_IDS.buyerOnly && row.organization_id !== ORGANIZATION_IDS.buyerAndSeller) problems.push(`${row.id}: not a Foundation fixture org`);
  }
  const ids = (rows ?? []).map((row) => row.id as string);
  if (ids.length > 0) {
    const { count, error: referenceError } = await admin.from("orders").select("id", { count: "exact", head: true }).in("delivery_destination_id", ids);
    if (referenceError) throw new SafeFixtureError("F013 T031 order-reference check failed.");
    if ((count ?? 0) !== 0) problems.push(`orders reference them: ${count}`);
  }
  if (problems.length > 0) throw new SafeFixtureError(`F013 T031 proof-destination delete refused (nothing deleted): ${problems.join("; ")}`);
  if (ids.length === 0) return 0;
  const { error: deleteError } = await admin.from("delivery_destinations").delete().in("id", ids).eq("label", F013_T031_PROOF_LABEL);
  if (deleteError) throw new SafeFixtureError("F013 T031 proof-destination delete failed.");
  return ids.length;
}

/** Read-only: nothing of the T031 proof (or any destination PII) remains. */
async function verifyF013T031Cleanup(admin: SupabaseClient): Promise<Record<string, unknown>> {
  assertF013Project();
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: value, error } = await query;
    if (error) throw new SafeFixtureError("F013 T031 verification read failed.");
    return value ?? -1;
  };
  const allOrders = await count(admin.from("orders").select("id", { count: "exact", head: true }));
  const withoutDestinationId = await count(admin.from("orders").select("id", { count: "exact", head: true }).is("delivery_destination_id", null));
  const withoutSnapshot = await count(admin.from("orders").select("id", { count: "exact", head: true }).is("destination_snapshot", null));
  const adminUser = await findAuthUserIdByEmail(admin, F013_T031_ADMIN.email);
  return {
    proofDestinations: await count(admin.from("delivery_destinations").select("id", { count: "exact", head: true }).in("id", F013_T031_ALL_DESTINATION_IDS)),
    allDestinations: await count(admin.from("delivery_destinations").select("id", { count: "exact", head: true })),
    ordersWithDestinationId: allOrders - withoutDestinationId,
    ordersWithDestinationSnapshot: allOrders - withoutSnapshot,
    destinationAuditRows: await count(admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("entity_type", "delivery_destinations")),
    proofIdAuditRows: await count(admin.from("audit_logs").select("id", { count: "exact", head: true }).in("entity_id", F013_T031_ALL_DESTINATION_IDS)),
    f013AdminPlatformPrivilege: adminUser ? await count(admin.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("user_id", adminUser)) : 0,
  };
}

async function setupF013T031(admin: SupabaseClient, password: string): Promise<Record<string, unknown>> {
  assertF013Project();
  await deleteF013T031ProofDestinations(admin);
  await createDisposableOperatorFixture(admin, password, F013_T031_ADMIN, "feature-013-f013-admin", { reuseIfActive: true });
  const owner = await findAuthUserIdByEmail(admin, "buyer-only+foundation-test@example.com");
  const other = await findAuthUserIdByEmail(admin, "buyer-and-seller+foundation-test@example.com");
  if (!owner || !other) throw new SafeFixtureError("Foundation fixtures missing; run npm run test:seed first.");
  const row = (id: string, organizationId: string, createdBy: string) => ({
    id, organization_id: organizationId, label: F013_T031_PROOF_LABEL, country_code: "AE", city: "Dubai",
    address_line_1: "F013 T031 synthetic fixture - not a real address", contact_name: "F013 Fixture", contact_phone: "+971500000013",
    delivery_method: "Courier", is_default: true, created_by: createdBy,
  });
  const { error } = await admin.from("delivery_destinations").insert([
    row(F013_T031_DESTINATION_IDS.buyerOnly, ORGANIZATION_IDS.buyerOnly, owner),
    row(F013_T031_DESTINATION_IDS.otherOrg, ORGANIZATION_IDS.buyerAndSeller, other),
  ]);
  if (error) throw new SafeFixtureError(`F013 T031 setup failed: ${error.message}`);
  return { destinations: 2, owningOrgDestination: F013_T031_DESTINATION_IDS.buyerOnly, otherOrgDestination: F013_T031_DESTINATION_IDS.otherOrg };
}

async function cleanupF013T031(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const deleted = await deleteF013T031ProofDestinations(admin);
  const adminFixture = await cleanupDisposableOperatorFixture(admin, F013_T031_ADMIN);
  return { deleted, adminFixture, remaining: await verifyF013T031Cleanup(admin) };
}

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
  const isResetCheckoutFixtures = process.argv.includes("--reset-checkout-fixtures");
  const inspectCheckoutPrefix = "--inspect-checkout-order=";
  const inspectCheckoutArgument = process.argv.find((argument) => argument.startsWith(inspectCheckoutPrefix));
  const isResetDeliveryFixtures = process.argv.includes("--reset-delivery-fixtures");
  const isSeedDeliveryFixtures = process.argv.includes("--seed-delivery-fixtures");
  const isInspectT013Residue = process.argv.includes("--inspect-t013-residue");
  const isCleanupT013Residue = process.argv.includes("--cleanup-t013-residue");
  const isPrepareT013LiveFixtures = process.argv.includes("--prepare-t013-live-fixtures");
  const isCleanupT013LiveFixtures = process.argv.includes("--cleanup-t013-live-fixtures");
  const isPrepareComplianceFixture = process.argv.includes("--prepare-compliance-fixture");
  const isCleanupComplianceFixture = process.argv.includes("--cleanup-compliance-fixture");
  const isInspectComplianceFixture = process.argv.includes("--inspect-compliance-fixture");
  const isResetSuspendedFixture = process.argv.includes("--reset-suspended-fixture");
  const isInspectSuspendedOrganization = process.argv.includes("--inspect-suspended-organization");
  const isResetListingReviewFixtures = process.argv.includes("--reset-listing-review-fixtures");
  const createT013PaymentProofPrefix = "--create-t013-payment-proof-metadata=";
  const createT013PaymentProofArgument = process.argv.find((argument) => argument.startsWith(createT013PaymentProofPrefix));
  const inspectDeliveryPositionPrefix = "--inspect-delivery-position=";
  const inspectDeliveryPositionArgument = process.argv.find((argument) => argument.startsWith(inspectDeliveryPositionPrefix));
  const inspectDeliveryPositionByLotOwnerPrefix = "--inspect-delivery-position-by-lot-owner=";
  const inspectDeliveryPositionByLotOwnerArgument = process.argv.find((argument) => argument.startsWith(inspectDeliveryPositionByLotOwnerPrefix));
  const inspectDeliveryOrderPrefix = "--inspect-delivery-order=";
  const inspectDeliveryOrderArgument = process.argv.find((argument) => argument.startsWith(inspectDeliveryOrderPrefix));
  const seedPhantomReservationPrefix = "--seed-phantom-reservation=";
  const seedPhantomReservationArgument = process.argv.find((argument) => argument.startsWith(seedPhantomReservationPrefix));
  const admin = createAdminClient();

  if (isInspectSuspendedOrganization) {
    console.log(JSON.stringify(await inspectSuspendedOrganization(admin)));
    return;
  }

  if (isVerifyInventoryFixtures && isVerifyInventoryAppendOnly) {
    throw new SafeFixtureError("Choose only one Feature 005 inventory verification operation.");
  }

  if (isResetCheckoutFixtures) {
    await seedCheckoutFixtures(admin);
    await resetCheckoutFixtures(admin);
    return;
  }

  if (isSeedDeliveryFixtures) {
    await seedDeliveryFixtures(admin);
    return;
  }

  if (isInspectT013Residue) {
    console.log(JSON.stringify(t013ResidueSummary(await readT013Residue(admin))));
    return;
  }

  if (isCleanupT013Residue) {
    console.log(JSON.stringify(await cleanupT013BusinessResidue(admin)));
    return;
  }

  if (isPrepareT013LiveFixtures) {
    const before = await readT013Residue(admin);
    if (before.scopeProblems.length > 0 || before.orders.length !== 0 || before.allDeliveryOfferItems.length !== 0 || before.paymentProofAssets.length !== 0 || before.buyerPositions.length !== 0) {
      throw new SafeFixtureError("T013 live fixture preparation refused while tagged business residue exists; run --cleanup-t013-residue first.");
    }
    await seedDeliveryFixtures(admin);
    await createT013DeliveryAdminFixture(admin, requireEnv("TEST_FIXTURE_PASSWORD"));
    return;
  }

  if (isCleanupT013LiveFixtures) {
    const business = await cleanupT013BusinessResidue(admin);
    const adminFixture = await cleanupT013DeliveryAdminFixture(admin);
    console.log(JSON.stringify({ business, adminFixture }));
    return;
  }

  // Feature 006 live-chain fixtures (T015/T018/T023/T024) — composed from the reviewed T013 lifecycle, never a second
  // privileged architecture. PREPARE refuses over any residue (T013's or F006's); CLEANUP removes the F006 rows first
  // (the T013 scope check would otherwise refuse their untagged orders), then restores the shared delivery baseline and
  // removes the disposable ADMIN exactly as T013 does.
  if (process.argv.includes("--inspect-f006-residue")) {
    console.log(JSON.stringify(f006ResidueSummary(await readF006Residue(admin))));
    return;
  }
  if (process.argv.includes("--inspect-f006-rowcounts")) {
    await inspectF006RowCounts(admin);
    return;
  }
  const inspectF006OfferArgument = process.argv.find((argument) => argument.startsWith("--inspect-f006-offer="));
  if (inspectF006OfferArgument) {
    await inspectF006Offer(admin, inspectF006OfferArgument.slice("--inspect-f006-offer=".length));
    return;
  }
  if (process.argv.includes("--prepare-f006-live-fixtures")) {
    const f006 = await readF006Residue(admin);
    const t013 = await readT013Residue(admin);
    if (f006.scopeProblems.length > 0 || f006.listings.length !== 0 || f006.orders.length !== 0 || f006.positions.length !== 0) {
      throw new SafeFixtureError("Feature 006 live fixture preparation refused while F006 business residue exists; run --cleanup-f006-live-fixtures first.");
    }
    if (t013.scopeProblems.length > 0 || t013.orders.length !== 0 || t013.allDeliveryOfferItems.length !== 0 || t013.paymentProofAssets.length !== 0 || t013.buyerPositions.length !== 0) {
      throw new SafeFixtureError("Feature 006 live fixture preparation refused while T013 business residue exists; run --cleanup-t013-residue first.");
    }
    await seedDeliveryFixtures(admin);
    await createT013DeliveryAdminFixture(admin, requireEnv("TEST_FIXTURE_PASSWORD"));
    return;
  }
  if (process.argv.includes("--cleanup-f006-live-fixtures")) {
    const f006 = await cleanupF006BusinessRows(admin);
    const business = await cleanupT013BusinessResidue(admin);
    // Safe to run when PREPARE never did (a failed setup): an ADMIN identity that holds no capability is already clean.
    const adminState = await inspectDisposableOperatorFixture(admin, T013_DELIVERY_ADMIN_FIXTURE);
    const adminFixture = adminState.activeCapability === true ? await cleanupT013DeliveryAdminFixture(admin) : { adminFixture: "already-clean", activeAdminPrivilege: false, role: "ADMIN" };
    console.log(JSON.stringify({ f006, business, adminFixture }));
    return;
  }

  if (process.argv.includes("--inspect-f013-fixtures")) {
    console.log(JSON.stringify(await inspectF013Fixtures(admin)));
    return;
  }
  if (process.argv.includes("--prepare-f013-fixtures")) {
    await prepareF013Fixtures(admin, requireEnv("TEST_FIXTURE_PASSWORD"));
    return;
  }
  if (process.argv.includes("--cleanup-f013-fixtures")) {
    console.log(JSON.stringify(await cleanupF013Fixtures(admin)));
    return;
  }
  if (process.argv.includes("--f013-m1-schema-probe")) {
    console.log(JSON.stringify(await probeF013M1Schema(admin)));
    return;
  }
  if (process.argv.includes("--f013-m1-live-setup")) {
    console.log(JSON.stringify(await setupF013M1LiveOrders(admin)));
    return;
  }
  if (process.argv.includes("--f013-m1-live-probe")) {
    console.log(JSON.stringify(await probeF013M1Transitions(admin)));
    return;
  }
  if (process.argv.includes("--f013-m1-live-cleanup")) {
    console.log(JSON.stringify(await cleanupF013M1LiveOrders(admin)));
    return;
  }
  if (process.argv.includes("--f013-m1-live-verify")) {
    console.log(JSON.stringify(await verifyF013M1ProofCleanup(admin)));
    return;
  }
  if (process.argv.includes("--f013-t031-setup")) {
    console.log(JSON.stringify(await setupF013T031(admin, requireEnv("TEST_FIXTURE_PASSWORD"))));
    return;
  }
  if (process.argv.includes("--f013-t031-cleanup")) {
    console.log(JSON.stringify(await cleanupF013T031(admin)));
    return;
  }
  if (process.argv.includes("--f013-t031-verify")) {
    console.log(JSON.stringify(await verifyF013T031Cleanup(admin)));
    return;
  }
  if (process.argv.includes("--prepare-catalogue-admin-fixture")) {
    await createDisposableOperatorFixture(admin, requireEnv("TEST_FIXTURE_PASSWORD"), RUN_E_CATALOGUE_ADMIN_FIXTURE, "feature-010-run-e-catalogue-admin", { reuseIfActive: true });
    return;
  }
  if (process.argv.includes("--cleanup-catalogue-admin-fixture")) {
    console.log(JSON.stringify(await cleanupDisposableOperatorFixture(admin, RUN_E_CATALOGUE_ADMIN_FIXTURE)));
    return;
  }
  if (process.argv.includes("--inspect-catalogue-admin-fixture")) {
    console.log(JSON.stringify(await inspectDisposableOperatorFixture(admin, RUN_E_CATALOGUE_ADMIN_FIXTURE)));
    return;
  }
  if (process.argv.includes("--prepare-auditor-fixture")) {
    await createDisposableOperatorFixture(admin, requireEnv("TEST_FIXTURE_PASSWORD"), RUN_E_AUDITOR_FIXTURE, "feature-010-run-e-auditor", { reuseIfActive: true });
    return;
  }
  if (process.argv.includes("--cleanup-auditor-fixture")) {
    console.log(JSON.stringify(await cleanupDisposableOperatorFixture(admin, RUN_E_AUDITOR_FIXTURE)));
    return;
  }
  if (process.argv.includes("--inspect-auditor-fixture")) {
    console.log(JSON.stringify(await inspectDisposableOperatorFixture(admin, RUN_E_AUDITOR_FIXTURE)));
    return;
  }
  if (process.argv.includes("--reset-run-e-catalogue-fixture")) {
    await resetRunECatalogueFixture(admin);
    return;
  }
  if (process.argv.includes("--cleanup-run-e-created-rows")) {
    await cleanupRunECreatedRows(admin);
    return;
  }
  if (process.argv.includes("--inspect-updated-at-columns")) {
    await inspectUpdatedAtColumns(admin);
    return;
  }
  if (process.argv.includes("--seed-pricing-fixtures")) {
    await seedPricingFixtures(admin);
    return;
  }
  if (process.argv.includes("--cleanup-pricing-fixtures")) {
    await cleanupPricingFixtures(admin);
    return;
  }
  if (process.argv.includes("--cleanup-price-admin-rows")) {
    await cleanupPriceAdminRows(admin);
    return;
  }
  if (process.argv.includes("--insert-price-admin-direct-observation")) {
    await insertPriceAdminDirectObservation(admin);
    return;
  }
  if (process.argv.includes("--prepare-super-admin-fixture")) {
    await createDisposableOperatorFixture(admin, requireEnv("TEST_FIXTURE_PASSWORD"), RUN_F_SUPER_ADMIN_FIXTURE, "feature-010-run-f-super-admin", { reuseIfActive: true });
    return;
  }
  if (process.argv.includes("--cleanup-super-admin-fixture")) {
    console.log(JSON.stringify(await cleanupDisposableOperatorFixture(admin, RUN_F_SUPER_ADMIN_FIXTURE)));
    return;
  }
  if (process.argv.includes("--inspect-super-admin-fixture")) {
    console.log(JSON.stringify(await inspectDisposableOperatorFixture(admin, RUN_F_SUPER_ADMIN_FIXTURE)));
    return;
  }
  if (process.argv.includes("--seed-dispute-fixtures")) {
    await seedDisputeFixtures(admin);
    return;
  }
  if (process.argv.includes("--cleanup-dispute-test-rows")) {
    console.log(JSON.stringify(await cleanupDisputeTestRows(admin)));
    return;
  }
  if (process.argv.includes("--seed-notification-fixture")) {
    await seedNotificationFixture(admin);
    return;
  }
  if (process.argv.includes("--cleanup-notification-test-rows")) {
    console.log(JSON.stringify(await cleanupNotificationTestRows(admin)));
    return;
  }
  if (process.argv.includes("--inspect-dispute-status-history")) {
    console.log(JSON.stringify(await inspectDisputeStatusHistory(admin)));
    return;
  }
  if (process.argv.includes("--probe-dispute-history-guards")) {
    console.log(JSON.stringify(await probeDisputeHistoryGuards(admin)));
    return;
  }
  if (process.argv.includes("--inspect-dispute-fixtures")) {
    console.log(JSON.stringify(await inspectDisputeFixtures(admin)));
    return;
  }
  if (process.argv.includes("--cleanup-run-f-config-rows")) {
    await cleanupRunFConfigRows(admin);
    return;
  }
  const stageDocument = process.argv.find((argument) => argument.startsWith("--stage-complete-draft-document="));
  if (stageDocument) {
    const mode = stageDocument.split("=")[1];
    if (mode !== "PENDING" && mode !== "REJECTED" && mode !== "EXPIRED" && mode !== "ACCEPTED") throw new Error("--stage-complete-draft-document expects PENDING | REJECTED | EXPIRED | ACCEPTED");
    await stageCompleteDraftDocument(admin, mode);
    return;
  }

  if (isPrepareComplianceFixture) {
    await createDisposableOperatorFixture(admin, requireEnv("TEST_FIXTURE_PASSWORD"), RUN_B_COMPLIANCE_FIXTURE, "feature-010-run-b-compliance-reviewer", { reuseIfActive: true });
    return;
  }

  if (isCleanupComplianceFixture) {
    console.log(JSON.stringify(await cleanupDisposableOperatorFixture(admin, RUN_B_COMPLIANCE_FIXTURE)));
    return;
  }

  if (isInspectComplianceFixture) {
    console.log(JSON.stringify(await inspectDisposableOperatorFixture(admin, RUN_B_COMPLIANCE_FIXTURE)));
    return;
  }

  if (isResetSuspendedFixture) {
    await resetSuspendedFixture(admin);
    return;
  }

  if (isResetListingReviewFixtures) {
    await resetListingReviewFixtures(admin);
    return;
  }

  if (createT013PaymentProofArgument) {
    await createT013PaymentProofMetadata(admin, createT013PaymentProofArgument.slice(createT013PaymentProofPrefix.length));
    return;
  }

  if (isResetDeliveryFixtures) {
    await resetDeliveryFixtures(admin);
    await seedDeliveryFixtures(admin);
    return;
  }

  if (inspectDeliveryPositionArgument) {
    const positionId = inspectDeliveryPositionArgument.slice(inspectDeliveryPositionPrefix.length);
    if (!/^[0-9a-f-]{36}$/i.test(positionId)) throw new SafeFixtureError("--inspect-delivery-position requires a UUID.");
    await inspectDeliveryPosition(admin, positionId);
    return;
  }

  if (inspectDeliveryPositionByLotOwnerArgument) {
    const value = inspectDeliveryPositionByLotOwnerArgument.slice(inspectDeliveryPositionByLotOwnerPrefix.length);
    const [lotId, ownerOrganizationId] = value.split(":");
    if (!lotId || !ownerOrganizationId || !/^[0-9a-f-]{36}$/i.test(lotId) || !/^[0-9a-f-]{36}$/i.test(ownerOrganizationId)) {
      throw new SafeFixtureError("--inspect-delivery-position-by-lot-owner requires <lotUuid>:<ownerOrgUuid>.");
    }
    await inspectDeliveryPositionByLotOwner(admin, lotId, ownerOrganizationId);
    return;
  }

  if (inspectDeliveryOrderArgument) {
    const orderId = inspectDeliveryOrderArgument.slice(inspectDeliveryOrderPrefix.length);
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new SafeFixtureError("--inspect-delivery-order requires a UUID.");
    await inspectDeliveryOrder(admin, orderId);
    return;
  }

  if (seedPhantomReservationArgument) {
    const value = seedPhantomReservationArgument.slice(seedPhantomReservationPrefix.length);
    const [ownerOrganizationId, kgRaw] = value.split(":");
    const kg = Number(kgRaw);
    if (!ownerOrganizationId || !/^[0-9a-f-]{36}$/i.test(ownerOrganizationId) || !Number.isFinite(kg) || kg < 0) {
      throw new SafeFixtureError("--seed-phantom-reservation requires <ownerOrgUuid>:<nonNegativeKg>.");
    }
    await seedPhantomReservation(admin, ownerOrganizationId, kg);
    return;
  }

  if (process.argv.includes("--probe-direct-full-reservation")) {
    await probeDirectFullReservation(admin);
    return;
  }

  if (process.argv.includes("--inspect-checkout-mirrors")) {
    await inspectCheckoutMirrors(admin);
    return;
  }

  if (inspectCheckoutArgument) {
    const orderId = inspectCheckoutArgument.slice(inspectCheckoutPrefix.length);
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new SafeFixtureError("--inspect-checkout-order requires a UUID.");
    await inspectCheckoutOrder(admin, orderId);
    return;
  }

  const ageHoldPrefix = "--age-checkout-hold=";
  const ageHoldArgument = process.argv.find((argument) => argument.startsWith(ageHoldPrefix));
  if (ageHoldArgument) {
    const orderId = ageHoldArgument.slice(ageHoldPrefix.length);
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new SafeFixtureError("--age-checkout-hold requires a UUID.");
    await ageCheckoutHold(admin, orderId);
    return;
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
    // Feature 009 FIRST (newest): its delivery listings/positions are entirely independent of
    // Feature 007's checkout fixture (separate lot ids), but torn down first regardless, matching the
    // same "newest feature torn down first" discipline every extension here follows.
    await teardownDeliveryFixtures(admin);
    await teardownCheckoutFixtures(admin);
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
  // Feature 006: depends on Feature 005's hillsOrg/warehouse/lots/positions/offerB.
  await seedListingFixtures(admin);
  // Feature 007: its own dedicated lot/position/listing for transactional checkout tests.
  await seedCheckoutFixtures(admin);
  // Feature 009 LAST: its own dedicated lot/position/listing pair for the live delivery-reservation/
  // settlement proof (T013), independent of Feature 007's own checkout fixture.
  await seedDeliveryFixtures(admin);
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
