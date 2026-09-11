import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REQUIRED_TEST_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "TEST_FIXTURE_PASSWORD",
] as const;

type RequiredTestEnv = (typeof REQUIRED_TEST_ENV)[number];

let sessionClientSequence = 0;

export const FOUNDATION_FIXTURES = {
  buyerOnly: {
    email: "buyer-only+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000001",
    canonicalProfile: {
      fullName: "Foundation Test — Buyer Only",
      phone: null,
      companyName: "Foundation Test — Buyer Only",
      avatarPath: null,
    },
  },
  buyerAndSeller: {
    email: "buyer-and-seller+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000002",
  },
  warehouseAdmin: {
    email: "warehouse-admin+foundation-test@example.com",
  },
} as const;

/**
 * Feature 003 Phase 8 (T029) — authorization/state-variant fixtures, created by
 * `scripts/seed-test-fixtures.ts`'s `seedPhase89()`. Ids mirror that script's own constants exactly
 * (kept as separate literals here, same precedent as `FOUNDATION_FIXTURES` above, so this file never
 * needs to import the privileged script).
 */
export const PHASE89_FIXTURES = {
  pendingKyb: {
    email: "pending-kyb+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000061",
    applicationId: "f0000000-0000-4000-8000-000000000071",
  },
  completeDraft: {
    email: "complete-draft+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000062",
    applicationId: "f0000000-0000-4000-8000-000000000072",
  },
  underReview: {
    email: "under-review+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000063",
    applicationId: "f0000000-0000-4000-8000-000000000073",
  },
  suspended: {
    email: "suspended+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000064",
    applicationId: "f0000000-0000-4000-8000-000000000074",
  },
  blockedMember: {
    email: "blocked-member+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000065",
    applicationId: "f0000000-0000-4000-8000-000000000075",
  },
  mfaMember: {
    email: "mfa-member+foundation-test@example.com",
    organizationId: "f0000000-0000-4000-8000-000000000066",
    applicationId: "f0000000-0000-4000-8000-000000000076",
  },
  multiOrg: {
    email: "multi-org+foundation-test@example.com",
    organizationAId: "f0000000-0000-4000-8000-000000000067",
    organizationBId: "f0000000-0000-4000-8000-000000000068",
  },
  noOrganization: {
    email: "no-organization+foundation-test@example.com",
  },
} as const;

function loadTestEnvironment(): void {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }

  const requiredNames = new Set<string>(REQUIRED_TEST_ENV);
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const name = line.slice(0, separator).trim();
    if (!requiredNames.has(name) || process.env[name] !== undefined) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

function requireTestEnvironment(name: RequiredTestEnv): string {
  loadTestEnvironment();
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}; see .env.example and run npm run test:seed.`);
  }
  return value;
}

function newSessionClient(): SupabaseClient {
  return createClient(
    requireTestEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireTestEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: `foundation-test-${process.pid}-${++sessionClientSequence}`,
      },
    }
  );
}

export function createAnonymousFixtureClient(): SupabaseClient {
  return newSessionClient();
}

/**
 * The shared fixture password, for the rare test that must build its own sign-in FormData (T033's
 * live Server Action proof) rather than use `signInAsFixture`'s direct `signInWithPassword` call.
 * Never logged, never included in any assertion message — callers must not print it either.
 */
export function fixturePassword(): string {
  return requireTestEnvironment("TEST_FIXTURE_PASSWORD");
}

export async function signInAsFixture(
  email: string
): Promise<SupabaseClient> {
  const client = newSessionClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: requireTestEnvironment("TEST_FIXTURE_PASSWORD"),
  });

  if (error || !data.user || !data.session) {
    throw new Error(
      `Unable to authenticate documented fixture ${email}; run npm run test:seed.`
    );
  }

  return client;
}

/**
 * Runs the sole privileged fixture operation in the standalone Phase 8 script process. The test
 * runtime never reads or imports the privileged credential.
 */
export function setBuyerAndSellerCanSell(canSell: boolean): void {
  runFixtureScript([`--set-buyer-and-seller-can-sell=${String(canSell)}`]);
}

/** T031 freshness-proof control — flips ONLY the `suspended` fixture's organization status. */
export function setSuspendedOrganizationStatus(status: "ACTIVE" | "SUSPENDED"): void {
  runFixtureScript([`--set-suspended-organization-status=${status}`]);
}

/** T032 restore control — resets `completeDraft`'s application back to `DRAFT` after a test transitions it. */
export function resetCompleteDraftApplication(): void {
  runFixtureScript(["--reset-complete-draft-application"]);
}

function runFixtureScript(args: readonly string[]): void {
  loadTestEnvironment();
  execFileSync(
    process.execPath,
    [
      resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      resolve(process.cwd(), "scripts", "seed-test-fixtures.ts"),
      ...args,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    }
  );
}
