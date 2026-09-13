import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const REQUIRED_TEST_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "TEST_FIXTURE_PASSWORD",
] as const;

type RequiredTestEnv = (typeof REQUIRED_TEST_ENV)[number];

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

/**
 * Feature 005 Phase 5 (T016–T019) — inventory/custody/ownership fixtures, created by
 * `scripts/seed-test-fixtures.ts`'s `seedInventoryFixtures()`. Ids mirror that script's own
 * `INVENTORY_FIXTURE_IDS`/`INVENTORY_FIXTURE_QUANTITIES` constants exactly (same precedent as
 * `FOUNDATION_FIXTURES`/`PHASE89_FIXTURES` above — kept as separate literals here, so this file never
 * needs to import the privileged script). `orgA`/`orgB` reuse the `buyer-only`/`buyer-and-seller`
 * identities (`FOUNDATION_FIXTURES`); `orgC` reuses `under-review` (`PHASE89_FIXTURES`) as the
 * unrelated third party for the ownership-ledger negative test.
 */
export const INVENTORY_FIXTURES = {
  orgA: {
    organizationId: "f0000000-0000-4000-8000-000000000001",
    email: "buyer-only+foundation-test@example.com",
    positionId: "05000000-0000-4000-8000-000000000009",
    allocationId: "05000000-0000-4000-8000-00000000000f",
    orderId: "05000000-0000-4000-8000-00000000000b",
    orderCode: "F005-FIX-ORDER-A",
  },
  orgB: {
    organizationId: "f0000000-0000-4000-8000-000000000002",
    email: "buyer-and-seller+foundation-test@example.com",
    positionId: "05000000-0000-4000-8000-00000000000a",
    allocationId: "05000000-0000-4000-8000-000000000010",
    orderId: "05000000-0000-4000-8000-00000000000c",
    orderCode: "F005-FIX-ORDER-B",
  },
  orgC: {
    organizationId: "f0000000-0000-4000-8000-000000000063",
    email: "under-review+foundation-test@example.com",
  },
  multiOrg: {
    email: "multi-org+foundation-test@example.com",
    organizationAId: "f0000000-0000-4000-8000-000000000067",
    organizationBId: "f0000000-0000-4000-8000-000000000068",
    positionAId: "05000000-0000-4000-8000-000000000015",
    positionBId: "05000000-0000-4000-8000-000000000016",
  },
  lotA: "05000000-0000-4000-8000-000000000003",
  lotB: "05000000-0000-4000-8000-000000000004",
  coffeeId: "05000000-0000-4000-8000-000000000014",
  offerIds: ["05000000-0000-4000-8000-000000000005", "05000000-0000-4000-8000-000000000006"],
  warehouse: "05000000-0000-4000-8000-000000000002",
  /** The three seeded `inventory_ownership_events` rows — see the seed script's own header comment. */
  events: {
    /** from=hillsOrg, to=orgA — proves "Org A as destination" visibility. */
    hillsToOrgA: "05000000-0000-4000-8000-000000000011",
    /** from=orgA, to=orgB — proves "Org A as source" AND "Org B as destination" simultaneously. */
    orgAToOrgB: "05000000-0000-4000-8000-000000000012",
    /** from=orgB, to=orgC (Phase 89 `underReview`) — unrelated to Org A; must be invisible to it. */
    orgBToOrgC: "05000000-0000-4000-8000-000000000013",
  },
  /** Distinctive, non-round quantities — see the seed script's own `INVENTORY_FIXTURE_QUANTITIES`. */
  quantities: {
    positionAAvailable: 743.271,
    positionAReserved: 88.654,
    positionBAvailable: 512.938,
    positionBReserved: 41.276,
    allocationAQuantity: 317.409,
    allocationAReleased: 52.183,
    allocationBQuantity: 201.517,
    allocationBReleased: 19.842,
    multiOrgPositionAAvailable: 91.123,
    multiOrgPositionAReserved: 17.456,
    multiOrgPositionBAvailable: 64.789,
    multiOrgPositionBReserved: 9.321,
  },
} as const;

/**
 * Feature 006 RUN A fixture IDs — literals mirroring `scripts/seed-test-fixtures.ts`'s own
 * `LISTING_FIXTURE_IDS`/`seedListingFixtures`, following the SAME established pattern as
 * `INVENTORY_FIXTURES` above: this file never imports the privileged seed script, it only
 * duplicates the constants it already produced so tests can reference them by name.
 *
 * Cross-references into `INVENTORY_FIXTURES`:
 * - `INVENTORY_FIXTURES.orgA` (buyer-only, `canSell=false`) — proves `SELLER_NOT_CAPABLE`.
 * - `INVENTORY_FIXTURES.orgB` (buyer-and-seller, `canSell=true`) — the acting org for every
 *   other eligibility path below; owns `positionOrgBOnLotA`/`positionOrgBInactiveWarehouse`.
 * - `INVENTORY_FIXTURES.orgB.positionId` (on `INVENTORY_FIXTURES.lotB`, active warehouse, no
 *   purchase provenance) can also stand in for a POSITION_NOT_OWNED check from Org A's session.
 */
export const LISTING_FIXTURES = {
  /** A warehouse seeded with `is_active=false` — the ONLY custody-adjacent fact available. */
  warehouseInactive: "06000000-0000-4000-8000-000000000001",
  /** Org B's own inventory position on Feature 005's `lotA` — no Hills-source provenance. */
  positionOrgBOnLotA: "06000000-0000-4000-8000-000000000002",
  /** Org B's own inventory position, but its warehouse is `warehouseInactive`. */
  positionOrgBInactiveWarehouse: "06000000-0000-4000-8000-000000000003",
  /** A dedicated lot (never touched by Feature 005's own `offerA`/`offerB` fixtures). */
  lotC: "06000000-0000-4000-8000-000000000009",
  /** Hills-org-owned inventory position on `lotC`, backing both offers below. */
  hillsPositionC: "06000000-0000-4000-8000-00000000000a",
  /** PARTIALLY_FILLED, is_visible=true — buyer-readable per `member_read_published_offers`. */
  offerPublished: "06000000-0000-4000-8000-000000000006",
  /**
   * SOLD_OUT (remaining = quantity - reserved - filled = 0). Per the LIVE `member_read_published_offers`
   * predicate (`(quantity_kg - filled_quantity_kg - reserved_quantity_kg) > 0`), this row is
   * UNREADABLE by any buyer/member session even by exact id — a genuine schema-vs-spec gap
   * documented in `lib/listings/browse.ts`'s header comment. Tests use this id to PROVE that gap
   * empirically (a direct id lookup must return null), not to assert buyer-readability.
   */
  offerSoldOut: "06000000-0000-4000-8000-000000000007",
} as const;

/**
 * Feature 007 RUN B fixture IDs — literals mirroring `scripts/seed-test-fixtures.ts`'s own
 * `CHECKOUT_FIXTURE_IDS` (same precedent as `LISTING_FIXTURES` above). `offerCheckout` is a
 * PUBLISHED HILLS listing (50 kg, 10 USD/kg) that ONLY the transactional checkout tests touch —
 * `checkout_order()` genuinely reserves against it, so `resetCheckoutFixtures()` restores it before
 * each checkout test file runs.
 */
export const CHECKOUT_FIXTURES = {
  lotD: "07000000-0000-4000-8000-000000000001",
  hillsPositionD: "07000000-0000-4000-8000-000000000002",
  offerCheckout: "07000000-0000-4000-8000-000000000003",
  offerQuantityKg: 50,
  offerPricePerKg: 10,
} as const;

/** TEST-ONLY privileged integrity snapshot shape (see the seed script's `inspectCheckoutOrder`). */
export type CheckoutInspection = {
  reservations: Array<{ id: string; status: string; expires_at: string }>;
  reservationItems: Array<{ quantity_kg: number; offer_id: string }>;
  proformas: Array<{ id: string; proforma_code: string; status: string }>;
  payments: Array<{ id: string; status: string; amount: number }>;
  ownershipEventCount: number;
  offer: { reserved_quantity_kg: number; filled_quantity_kg: number; status: string };
  position: { reserved_quantity_kg: number; available_quantity_kg: number; owner_organization_id: string };
  /** RUN D — `order_financials` rows for the order (the snapshot must exist at most once). */
  financials: Array<{ order_id: string; buyer_total_amount: number; base_subtotal: number; calculated_at: string }>;
  /** RUN D — the order's own transition history, oldest first. */
  statusHistory: Array<{ old_status: string | null; new_status: string; created_at: string }>;
  /** RUN D — ownership/title events on the dedicated checkout lot only. */
  lotOwnershipEventCount: number;
  /** RUN D — the order row's hold/intent columns, read with privilege so no member RLS shapes it. */
  order: { status: string; hold_started_at: string | null; hold_expires_at: string | null; idempotency_key: string | null; correlation_id: string | null } | null;
  /** RUN D — distinct non-null `idempotency_key` values across every audited version of the order row, oldest first. */
  idempotencyKeyHistory: string[];
};

/** TEST-ONLY privileged mirror snapshot shape (see the seed script's `inspectCheckoutMirrors`). */
export type CheckoutMirrorInspection = {
  offer: { quantity_kg: number; reserved_quantity_kg: number; filled_quantity_kg: number; status: string };
  position: { available_quantity_kg: number; reserved_quantity_kg: number };
  activeReservationItemsForOfferKg: number;
  activeReservationItemsForPositionKg: number;
  activeReservationCountForOffer: number;
};

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
        // Vitest isolates modules per file, so a module-local increment can repeat between parallel
        // files even inside the same jsdom browser context. A process-scoped UUID keeps deliberately
        // independent real-session clients isolated without changing application auth behavior.
        storageKey: `foundation-test-${process.pid}-${randomUUID()}`,
      },
    }
  );
}

/**
 * A password grant is intentionally shared only inside this Node test worker.
 * Each caller still receives a fresh, isolated Supabase client below, so a test
 * cannot leak local storage or sign-out state into another test. Caching the
 * immutable AAL1 token prevents the 80 real fixture call sites from exceeding
 * GoTrue's password-grant rate limit during a single full-suite process.
 *
 * `process` rather than a module variable is deliberate: Vitest isolates test
 * modules by file, while the sequential file worker itself remains the same
 * process. Nothing under application runtime imports this test-only helper.
 */
type FixtureProcess = NodeJS.Process & {
  __hillsFixtureSessions?: Map<string, Promise<Session>>;
};

function fixtureSessionCache(): Map<string, Promise<Session>> {
  const testProcess = process as FixtureProcess;
  return (testProcess.__hillsFixtureSessions ??= new Map<string, Promise<Session>>());
}

async function passwordGrantForFixture(email: string): Promise<Session> {
  const cache = fixtureSessionCache();
  let pending = cache.get(email);

  if (!pending) {
    pending = (async () => {
      const client = newSessionClient();
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password: requireTestEnvironment("TEST_FIXTURE_PASSWORD"),
      });

      if (error || !data.user || !data.session) {
        throw new Error(`Unable to authenticate documented fixture ${email}; run npm run test:seed.`);
      }

      return data.session;
    })();
    cache.set(email, pending);
  }

  try {
    return await pending;
  } catch (error) {
    // A transient rejected grant must never be cached; a later test gets a
    // genuine retry rather than inheriting the same failure.
    cache.delete(email);
    throw error;
  }
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
  let session = await passwordGrantForFixture(email);
  let { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    // A test can intentionally sign out its otherwise isolated client. If that
    // invalidates the cached refresh token, obtain exactly one new real grant
    // and replace only this fixture's cache. This is a test-only recovery, not
    // an authentication bypass or a retry loop.
    fixtureSessionCache().delete(email);
    session = await passwordGrantForFixture(email);
    ({ error } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }));
  }

  if (error) throw new Error(`Unable to restore documented fixture ${email} session.`);

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

/**
 * Feature 005 T018's isolated privileged fixture probe. It proves that a write which bypasses RLS
 * still reaches (and is refused by) the ownership ledger's database trigger; no privileged
 * credential is available to the Vitest process or application runtime.
 */
export function verifyInventoryAppendOnlyGuard(): void {
  runFixtureScript(["--verify-inventory-append-only"]);
}

/**
 * Feature 007 RUN B — restores the dedicated checkout listing/position to their seeded state and
 * removes every test order that referenced it (service-role, setup/teardown only — the same
 * approved convention as every other helper above). Never called by runtime code.
 */
export function resetCheckoutFixtures(): void {
  runFixtureScript(["--reset-checkout-fixtures"]);
}

/**
 * Feature 007 RUN B — TEST-ONLY privileged read of one order's transactional integrity
 * (reservation/proforma/payment/ownership-event counts + the offer/position reserved mirror).
 * `inventory_reservations`/`inventory_reservation_items` are admin-only by RLS (DB-OPEN-12), so this
 * is the repository's approved way for a release-blocking test to inspect them; no runtime member
 * code reads those tables (plan.md architecture decision 10).
 */
export function inspectCheckoutOrder(orderId: string): CheckoutInspection {
  const output = runFixtureScript([`--inspect-checkout-order=${orderId}`], { captureOutput: true });
  const line = output.trim().split(/\r?\n/).find((candidate) => candidate.startsWith("{"));
  if (!line) throw new Error("Checkout inspection produced no JSON snapshot.");
  return JSON.parse(line) as CheckoutInspection;
}

/**
 * Feature 007 RUN D (T022) — TEST-ONLY privileged read of the checkout listing's reserved mirror,
 * its inventory source of truth, and the ACTIVE reservation rows behind both. Never runtime code.
 */
/** DB-OPEN-16 hardening — result of the privileged direct full-reservation probe (see the seed script). */
export type DirectReservationProbe = { refused: boolean; message: string | null; restored: boolean; reservedBefore: number; attemptedReserved: number; status: string };

/**
 * Feature 007 DB blocker run — TEST-ONLY negative probe: a direct coffee_offers UPDATE with the
 * reservation-only shape but without checkout_order()'s marker must be refused by the listing trigger.
 */
export function probeDirectFullReservation(): DirectReservationProbe {
  const output = runFixtureScript(["--probe-direct-full-reservation"], { captureOutput: true });
  const line = output.trim().split(/\r?\n/).find((candidate) => candidate.startsWith("{"));
  if (!line) throw new Error("Direct reservation probe produced no JSON result.");
  return JSON.parse(line) as DirectReservationProbe;
}

export function inspectCheckoutMirrors(): CheckoutMirrorInspection {
  const output = runFixtureScript(["--inspect-checkout-mirrors"], { captureOutput: true });
  const line = output.trim().split(/\r?\n/).find((candidate) => candidate.startsWith("{"));
  if (!line) throw new Error("Checkout mirror inspection produced no JSON snapshot.");
  return JSON.parse(line) as CheckoutMirrorInspection;
}

/**
 * Feature 007 RUN C (T012) — TEST-ONLY "force expiry": backdates the order's ACTIVE reservation's
 * `expires_at` (the only column `expire_order_hold()` consults) to simulate the 20-minute window
 * having passed. Releases nothing itself. `orders.hold_expires_at` is untouched (DB-OPEN-15).
 */
export function ageCheckoutHold(orderId: string): void {
  runFixtureScript([`--age-checkout-hold=${orderId}`]);
}

function runFixtureScript(args: readonly string[], options: { captureOutput?: boolean } = {}): string {
  loadTestEnvironment();
  const output = execFileSync(
    process.execPath,
    [
      resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      resolve(process.cwd(), "scripts", "seed-test-fixtures.ts"),
      ...args,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: options.captureOutput ? ["ignore", "pipe", "ignore"] : "ignore",
    }
  );
  return options.captureOutput ? String(output) : "";
}
