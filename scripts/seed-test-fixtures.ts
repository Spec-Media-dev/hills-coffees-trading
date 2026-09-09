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
 * This script writes ONLY rows, and only to the five tables named below. It never alters schema,
 * RLS, policies, functions, triggers, or Storage. It creates no inventory, listing, order,
 * payment, settlement, or dispute data.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   npm run test:seed              # create or reconcile the fixtures (idempotent)
 *   npm run test:seed:teardown     # delete exactly the fixtures this script creates
 *   --set-buyer-and-seller-can-sell=true|false
 *                                  # Phase 9 freshness-test control; exact fixture row only
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
 * Deletes exactly the rows `seed()` creates, in foreign-key-safe order.
 *
 * Not deleted, deliberately: `audit_logs` and `account_status_history` rows written by the
 * database's own triggers. Those are the approved baseline's append-only audit trail
 * (Constitution auditability); removing them would mean deleting audit history, which this
 * script must never do. They carry a NULL actor because the service-role connection has no
 * `auth.uid()`, so they hold no fixture credential material.
 */
async function teardown(admin: SupabaseClient): Promise<void> {
  console.log("Tearing down 001-platform-foundation test fixtures…\n");

  const userIds: string[] = [];
  for (const fixture of FIXTURES) {
    const userId = await findAuthUserIdByEmail(admin, fixture.email);
    if (userId !== null) userIds.push(userId);
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

  const { error: orgError } = await admin
    .from("organizations")
    .delete()
    .in("id", organizationIds);
  if (orgError) {
    throw new SafeFixtureError("organizations delete failed.");
  }

  // Deleting the Auth user cascades to `profiles` (profiles.id references auth.users ON DELETE
  // CASCADE), which is why every referencing row above is removed first.
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new SafeFixtureError("auth user delete failed.");
  }

  console.log(
    `  removed ${userIds.length} auth user(s) + profile(s), ` +
      `${organizationIds.length} organization(s), ` +
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
  const admin = createAdminClient();

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

  if (isTeardown) {
    // Catalogue first: it is the leaf of the dependency order and never references an identity row.
    await teardownCatalogue(admin);
    await teardown(admin);
    return;
  }

  await seed(admin, requireEnv("TEST_FIXTURE_PASSWORD"));
  await seedCatalogue(admin);
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
