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
  loadTestEnvironment();
  execFileSync(
    process.execPath,
    [
      resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      resolve(process.cwd(), "scripts", "seed-test-fixtures.ts"),
      `--set-buyer-and-seller-can-sell=${String(canSell)}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    }
  );
}
