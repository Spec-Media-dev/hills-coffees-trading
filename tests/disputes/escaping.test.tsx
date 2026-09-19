import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceList } from "@/components/disputes/evidence-list";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { LocaleProvider } from "@/components/locale/locale-provider";

/**
 * Feature 012 RUN B — T022: injected markup in every dispute free-text field renders INERT (SEC-004).
 *
 * Fields: dispute `reason` (member-written), `resolution` (compliance-written), evidence `note`
 * (participant- or operator-written), plus notification `title`/`body` (the same untrusted path).
 *
 * Surfaces:
 *  1. MEMBER — the real `/dashboard/disputes/[disputeId]` and `/dashboard/notifications` Server
 *     Components, rendered with their read layers mocked to return hostile payloads.
 *  2. REUSABLE / OPERATOR-FACING — `UntrustedText` and `EvidenceList`, the role-agnostic components
 *     the member page uses and Feature 010's console is expected to reuse. Feature 010's dispute
 *     console route is still a placeholder (`src/app/dashboard-admin/(compliance)/disputes/page.tsx`
 *     renders `AdminAreaPlaceholder` and no dispute text), so there is no second rendering surface to
 *     test yet — and none is manufactured here.
 *
 * "Inert" = no element the payload tried to create exists in the DOM, no handler ran, and the payload
 * is still visible as literal text (nothing silently dropped).
 */

const PAYLOADS = {
  reason: `<img src=x onerror="window.__pwned='reason'"><script>window.__pwned='reason-script'</script>Bags torn`,
  resolution: `<a href="javascript:window.__pwned='resolution'">click</a><iframe src="javascript:alert(1)"></iframe>Credit agreed`,
  note: `<svg onload="window.__pwned='note'"></svg><b data-injected="note">bold</b> photo on request`,
  title: `<img src=x onerror="window.__pwned='title'">Title`,
  body: `<style>body{display:none}</style><div data-injected="body">Body</div>`,
};

const mocks = vi.hoisted(() => ({ identity: null as unknown, dispute: null as unknown, evidence: [] as unknown[], notifications: { rows: [] as unknown[], hasMore: false, page: 0, pageSize: 25 } }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/disputes/read", () => ({
  getDisputeForMember: vi.fn(async () => mocks.dispute),
  getDisputeEvidenceForMember: vi.fn(async () => mocks.evidence),
}));
vi.mock("@/lib/notifications/read", () => ({ listOwnNotifications: vi.fn(async () => mocks.notifications) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__pwned;
});

const identity = {
  kind: "authenticated" as const,
  userId: "a0000000-0000-4000-8000-000000000001",
  isAuthorizedMember: true,
  requiresMfaStepUp: false,
  organization: { organizationId: "o1", displayName: "Org", memberRole: "OWNER", canBuy: true, canSell: false },
};

function assertInert(container: HTMLElement) {
  expect(container.querySelector("script, iframe, img, svg[onload], style, [data-injected], a[href^='javascript']")).toBeNull();
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of element.getAttributeNames()) expect(attribute.startsWith("on"), `${element.tagName} has ${attribute}`).toBe(false);
  }
  expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
}

describe("Member surface — /dashboard/disputes/[disputeId]", () => {
  it("reason, resolution and evidence notes render as literal text, never as markup", async () => {
    mocks.identity = identity;
    mocks.dispute = {
      id: "12000000-0000-4000-8000-0000000000aa",
      orderId: "05000000-0000-4000-8000-00000000000b",
      orderCode: "F005-FIX-ORDER-A",
      orderStatus: "PAID",
      status: "RESOLVED",
      openedAt: "2026-09-19T00:00:00Z",
      resolvedAt: "2026-09-19T01:00:00Z",
      updatedAt: "2026-09-19T01:00:00Z",
      correlationId: "ef7040e3-86eb-494a-a2d5-cffb06b93dba",
      raisedByYou: true,
      reason: PAYLOADS.reason,
      resolution: PAYLOADS.resolution,
    };
    mocks.evidence = [{ id: "e1", disputeId: "12000000-0000-4000-8000-0000000000aa", note: PAYLOADS.note, hasFileReference: false, uploadedBy: identity.userId, createdAt: "2026-09-19T00:30:00Z" }];

    const { default: Page } = await import("@/src/app/dashboard/disputes/[disputeId]/page");
    const { container } = render(<LocaleProvider>{await Page({ params: Promise.resolve({ disputeId: "12000000-0000-4000-8000-0000000000aa" }) })}</LocaleProvider>);

    assertInert(container);
    expect(container.querySelector('[data-slot="dispute-reason"]')?.textContent).toBe(PAYLOADS.reason);
    expect(container.querySelector('[data-slot="dispute-resolution"]')?.textContent).toBe(PAYLOADS.resolution);
    expect(container.querySelector('[data-slot="evidence-note"]')?.textContent).toBe(PAYLOADS.note);
    // No file upload control is presented (DB-BLOCK-01) — the limitation is explained instead.
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('[data-slot="evidence-files-unavailable"]')).not.toBeNull();
  });
});

describe("Member surface — /dashboard/notifications", () => {
  it("a notification's title and body render as literal text; no read/unread control exists", async () => {
    mocks.identity = identity;
    mocks.notifications = { rows: [{ id: "n1", notificationType: "ORDER_UPDATES", title: PAYLOADS.title, body: PAYLOADS.body, createdAt: "2026-09-19T00:00:00Z" }], hasMore: false, page: 0, pageSize: 25 };
    const { default: Page } = await import("@/src/app/dashboard/notifications/page");
    const { container } = render(<LocaleProvider>{await Page()}</LocaleProvider>);
    assertInert(container);
    expect(container.querySelector('[data-slot="notification-title"]')?.textContent).toBe(PAYLOADS.title);
    expect(container.querySelector('[data-slot="notification-body"]')?.textContent).toBe(PAYLOADS.body);
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("Reusable / operator-facing components", () => {
  it("UntrustedText renders every payload as one text node", () => {
    for (const payload of Object.values(PAYLOADS)) {
      const { container, unmount } = render(<UntrustedText value={payload} />);
      assertInert(container);
      const paragraph = container.querySelector('[data-slot="untrusted-text"]');
      expect(paragraph?.childNodes).toHaveLength(1);
      expect(paragraph?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(paragraph?.textContent).toBe(payload);
      unmount();
    }
  });

  it("EvidenceList (role-agnostic) renders hostile notes inert, including a row that only references a file", () => {
    const { container } = render(
      <EvidenceList
        items={[
          { id: "a", note: PAYLOADS.note, hasFileReference: false, byViewer: false, createdAt: "2026-09-19T00:00:00Z" },
          { id: "b", note: PAYLOADS.reason, hasFileReference: true, byViewer: true, createdAt: "2026-09-19T00:01:00Z" },
        ]}
      />,
    );
    assertInert(container);
    expect([...container.querySelectorAll('[data-slot="evidence-note"]')].map((node) => node.textContent)).toEqual([PAYLOADS.note, PAYLOADS.reason]);
    // A file reference never becomes a link/download — the file itself is not available (DB-BLOCK-01).
    expect(container.querySelector("a, button")).toBeNull();
  });
});

describe("No raw-HTML rendering path exists in any dispute or notification product file", () => {
  it("no dangerouslySetInnerHTML / innerHTML / markdown renderer", () => {
    const root = process.cwd();
    const walk = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap((entry) => (statSync(path.join(root, dir, entry)).isDirectory() ? walk(path.join(dir, entry)) : [path.join(dir, entry)]));
    const files = ["lib/disputes", "components/disputes", "src/app/dashboard/disputes", "lib/notifications", "components/notifications", "src/app/dashboard/notifications"].flatMap((dir) => walk(dir));
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const file of files) {
      const code = readFileSync(path.join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|react-markdown|marked\(/);
    }
  });
});
