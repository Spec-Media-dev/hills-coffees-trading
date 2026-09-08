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
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);

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
    if (error) throw new Error(`Failed to update auth user: ${error.message}`);
    return { userId: existingId, created: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fixture: "001-platform-foundation" },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create auth user: ${error?.message ?? "unknown"}`);
  }
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
      throw new Error(`profiles upsert failed: ${profileError.message}`);
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
        throw new Error(`organizations upsert failed: ${orgError.message}`);
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
        throw new Error(`kyb_applications upsert failed: ${kybError.message}`);
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
        throw new Error(
          `organization_members upsert failed: ${memberError.message}`
        );
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
        throw new Error(`platform_admins upsert failed: ${adminError.message}`);
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
    throw new Error(`fixture capability update failed: ${error.message}`);
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
    if (error) throw new Error(`platform_admins delete failed: ${error.message}`);
  }

  const { error: memberError } = await admin
    .from("organization_members")
    .delete()
    .in("organization_id", organizationIds);
  if (memberError) {
    throw new Error(`organization_members delete failed: ${memberError.message}`);
  }

  const { error: kybError } = await admin
    .from("kyb_applications")
    .delete()
    .in("id", kybApplicationIds);
  if (kybError) {
    throw new Error(`kyb_applications delete failed: ${kybError.message}`);
  }

  const { error: orgError } = await admin
    .from("organizations")
    .delete()
    .in("id", organizationIds);
  if (orgError) {
    throw new Error(`organizations delete failed: ${orgError.message}`);
  }

  // Deleting the Auth user cascades to `profiles` (profiles.id references auth.users ON DELETE
  // CASCADE), which is why every referencing row above is removed first.
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(`auth user delete failed: ${error.message}`);
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
      throw new Error(
        "--set-buyer-and-seller-can-sell must be exactly true or false"
      );
    }

    await setBuyerAndSellerCanSell(admin, value === "true");
    return;
  }

  if (isTeardown) {
    await teardown(admin);
    return;
  }

  await seed(admin, requireEnv("TEST_FIXTURE_PASSWORD"));
}

main().catch((error: unknown) => {
  // Message only — never the stack or any payload that could carry credential material.
  console.error(
    `\nFixture script failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
