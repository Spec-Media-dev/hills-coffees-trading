import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DISPUTE_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  cleanupAuditorFixture,
  cleanupComplianceFixture,
  cleanupDisputeTestRows,
  inspectAuditorFixture,
  inspectComplianceFixture,
  inspectDisputeFixtures,
  inspectDisputeStatusHistory,
  prepareAuditorFixture,
  prepareComplianceFixture,
  seedDisputeFixtures,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 T012 — the Compliance dispute review surface (`/dashboard-admin/disputes` +
 * `/dashboard-admin/disputes/[disputeId]`), rendered LIVE from the real route modules with real
 * sessions. It composes Feature 012's layer only; this file proves what the operator actually sees:
 * the real queue row, the member's text, the database-written transition history (actor, from → to,
 * reason, time), the next statuses taken from Feature 012's graph, the honest "record label only"
 * freeze note (DB-OPEN-09), and the page guard refusing every non-compliance role.
 */

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
const redirectCalls = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectCalls.targets.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  cookieState.value = undefined;
  vi.resetModules();
  return run();
}
async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 120_000;
const ORDER_A = INVENTORY_FIXTURES.orgA.orderId;
const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
const MEMBER_TEXT = `${DISPUTE_FIXTURES.reasonPrefix} Console surface proof — <b>bags</b> torn on arrival.`;
const REVIEW_REASON = "Console surface proof: review opened.";
const FREEZE_REASON = "Console surface proof: awaiting the carrier statement.";

let compliance: SupabaseClient;
let complianceUserId: string;
let buyer: SupabaseClient;
let disputeId: string;
let historyRowsBefore: number;
let businessBefore: Record<string, unknown>;
const businessState = (snapshot: Record<string, unknown>) => Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "disputes" && key !== "evidence"));

beforeAll(async () => {
  seedDisputeFixtures();
  cleanupDisputeTestRows();
  prepareComplianceFixture();
  prepareAuditorFixture();
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  complianceUserId = (await compliance.auth.getUser()).data.user!.id;
  buyer = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  const buyerUserId = (await buyer.auth.getUser()).data.user!.id;
  historyRowsBefore = inspectDisputeStatusHistory().totalHistoryRows as number;
  businessBefore = businessState(inspectDisputeFixtures());

  const raised = await withLiveClient(buyer, async () => {
    const { raiseDispute } = await import("@/lib/disputes/member");
    return raiseDispute({ organizationId: ORG_A, userId: buyerUserId, input: { orderId: ORDER_A, reason: MEMBER_TEXT } });
  });
  if (!raised.ok) throw new Error(`raise failed: ${raised.code}`);
  disputeId = raised.data.id;
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  expect(cleanupDisputeTestRows().remainingTaggedDisputes).toBe(0);
  expect(inspectDisputeStatusHistory().totalHistoryRows).toBe(historyRowsBefore);
  expect(cleanupComplianceFixture().activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
  expect(cleanupAuditorFixture().activeAdminPrivilege).toBe(false);
  expect(inspectAuditorFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

async function decide(status: string, expectedStatus: string, reason: string) {
  return withLiveClient(compliance, async () => {
    const { recordDisputeTransition } = await import("@/src/app/dashboard-admin/(compliance)/disputes/actions");
    const formData = new FormData();
    formData.set("disputeId", disputeId);
    formData.set("status", status);
    formData.set("expectedStatus", expectedStatus);
    formData.set("reason", reason);
    return recordDisputeTransition(undefined, formData);
  });
}

async function renderDetail(client: SupabaseClient, id = disputeId) {
  await withLiveClient(client, async () => {
    const { default: DisputeReviewPage } = await import("@/src/app/dashboard-admin/(compliance)/disputes/[disputeId]/page");
    await renderPage(await DisputeReviewPage({ params: Promise.resolve({ disputeId: id }) }));
  });
}

describe("T012 — dispute review queue (live, COMPLIANCE)", () => {
  it("lists the real OPEN dispute with its status label and order reference (the pure COMPLIANCE role cannot read the order — stated, never guessed), plus the record-only freeze note", async () => {
    await withLiveClient(compliance, async () => {
      const { default: Page } = await import("@/src/app/dashboard-admin/(compliance)/disputes/page");
      await renderPage(await Page({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-dispute-filter="actionable"]')).not.toBeNull();
    expect(document.body.textContent).toContain(disputeId);
    expect(document.body.textContent).toContain(ORDER_A);
    expect(document.body.textContent).toContain("Order reference only");
    expect(document.querySelectorAll('[data-slot="dispute-status-badge"][data-status="OPEN"]').length).toBeGreaterThan(0);
    expect(document.querySelector("[data-dispute-freeze-note]")?.textContent).toMatch(/dispute record only.*does not hold, stop or change the order/);
    expect(document.querySelector('[data-admin-state="error"]')).toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T012 — dispute detail: record, member text, history and decision panel (live, COMPLIANCE)", () => {
  it("OPEN: shows the member's text as inert text, no history yet, and exactly Feature 012's next statuses for OPEN (Under review / Frozen / Rejected), each requiring a reason", async () => {
    await renderDetail(compliance);
    for (const key of ["identity", "reason", "history", "evidence"]) expect(document.querySelector(`[data-dispute-section="${key}"]`), key).not.toBeNull();
    expect(document.querySelector('[data-slot="dispute-reason"]')?.textContent).toBe(MEMBER_TEXT);
    expect(document.querySelector('[data-slot="dispute-reason"] b')).toBeNull();
    expect(document.querySelector("[data-dispute-order-unreadable]")).not.toBeNull();
    expect(document.querySelectorAll("[data-dispute-history-entry]")).toHaveLength(0);
    const options = [...document.querySelectorAll("[data-decision-option]")].map((el) => el.getAttribute("data-decision-option"));
    expect(options).toEqual(["UNDER_REVIEW", "FROZEN", "REJECTED"]);
    expect(document.querySelector('[data-decision-form="dispute-transition"]')).not.toBeNull();
    expect(document.body.textContent).toMatch(/Record label only — it does not hold the order, shipment, payment, settlement, inventory or delivery/);
  }, LIVE_TIMEOUT_MS);

  it("after two console decisions the history shows each change with its actor (You), from → to labels and the exact reason; the panel now offers FROZEN's next statuses", async () => {
    expect(await decide("UNDER_REVIEW", "OPEN", REVIEW_REASON)).toMatchObject({ ok: true });
    expect(await decide("FROZEN", "UNDER_REVIEW", FREEZE_REASON)).toMatchObject({ ok: true });
    await renderDetail(compliance);

    const entries = [...document.querySelectorAll("[data-dispute-history-entry]")];
    expect(entries).toHaveLength(2);
    const described = entries.map((entry) => ({
      statuses: [...entry.querySelectorAll('[data-slot="dispute-status-badge"]')].map((badge) => badge.getAttribute("data-status")),
      reason: entry.querySelector('[data-slot="dispute-history-reason"]')?.textContent,
      // `AppBilingual` renders both languages; the actor is the viewer, so "You" replaces the raw id.
      you: /Changed by/.test(entry.textContent ?? "") && [...entry.querySelectorAll('[lang="en"]')].some((el) => el.textContent === "You") && !entry.textContent?.includes(complianceUserId),
    }));
    expect(described).toEqual([
      { statuses: ["OPEN", "UNDER_REVIEW"], reason: REVIEW_REASON, you: true },
      { statuses: ["UNDER_REVIEW", "FROZEN"], reason: FREEZE_REASON, you: true },
    ]);
    expect(document.body.textContent).not.toContain(complianceUserId);
    const options = [...document.querySelectorAll("[data-decision-option]")].map((el) => el.getAttribute("data-decision-option"));
    expect(options).toEqual(["UNDER_REVIEW", "RESOLVED", "REJECTED"]);
  }, LIVE_TIMEOUT_MS);

  it("a CLOSED dispute keeps its recorded outcome and offers no further change", async () => {
    expect(await decide("REJECTED", "FROZEN", "Carrier statement shows pre-existing damage.")).toMatchObject({ ok: true });
    expect(await decide("CLOSED", "REJECTED", "Rejection communicated; dispute closed.")).toMatchObject({ ok: true });
    await renderDetail(compliance);
    expect(document.querySelector('[data-slot="dispute-resolution"]')?.textContent).toBe("Carrier statement shows pre-existing damage.");
    expect(document.querySelector('[data-decision-state="not-decidable"]')).not.toBeNull();
    expect(document.querySelectorAll("[data-decision-option]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-dispute-history-entry]")).toHaveLength(4);
  }, LIVE_TIMEOUT_MS);

  it("a nil and a malformed id render `not-found` without a decision form", async () => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      await renderDetail(compliance, id);
      expect(document.querySelector('[data-admin-state="not-found"]'), id).not.toBeNull();
      expect(document.querySelector("[data-decision-form]"), id).toBeNull();
      cleanup();
    }
  }, LIVE_TIMEOUT_MS);
});

describe("T012 — only compliance-permitted roles reach the surface (page guard, live)", () => {
  it("WAREHOUSE, FINANCE and AUDITOR get `forbidden`; a member gets `no-operational-role`; none sees the dispute", async () => {
    for (const [label, email, state] of [
      ["WAREHOUSE", FOUNDATION_FIXTURES.warehouseAdmin.email, "forbidden"],
      ["FINANCE", FOUNDATION_FIXTURES.financeAdmin.email, "forbidden"],
      ["AUDITOR", FOUNDATION_FIXTURES.auditor.email, "forbidden"],
      ["member", FOUNDATION_FIXTURES.buyerOnly.email, "no-operational-role"],
    ] as const) {
      const client = await signInAsFixture(email);
      await renderDetail(client);
      expect(document.querySelector(`[data-admin-state="${state}"]`), label).not.toBeNull();
      expect(document.body.textContent, label).not.toContain(MEMBER_TEXT);
      expect(document.querySelector("[data-decision-form]"), label).toBeNull();
      cleanup();
    }
  }, LIVE_TIMEOUT_MS);

  it("no side effect on the order, its shipments, payments, reservations, order history or custody (DB-OPEN-09 — the console has no freeze path)", () => {
    const after = inspectDisputeFixtures();
    expect(businessState(after)).toEqual(businessBefore);
    for (const order of after.orders as Array<{ status: string }>) expect(order.status).not.toBe("DISPUTED");
  });
});
