import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, cleanupComplianceFixture, createAnonymousFixtureClient, inspectComplianceFixture, prepareComplianceFixture, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN C — Phase 5 Finance structural delegation proof.
 *
 * The fresh Feature 008 audit (2026-09-16) found that 008 exposes NO payment-review queue read, NO
 * `decidePayment()`, NO approved settlement action, NO payout-status write and NO tax-invoice
 * recording write (`lib/finance/` = per-order reads + a controlled-unavailable funding stub; 008
 * T017–T023 unchecked). T013/T014/T015 therefore stay BLOCKED BY FEATURE 008. This file pins what
 * the console must remain while blocked: structurally unable to bypass Feature 008 (no runtime
 * `admin_review_payment`, no finance-table writes, no RPC into settlement), honest about the
 * dependency on every finance route, FINANCE-guarded by direct URL, and free of any member Finance
 * path. Tests/docs may name the primitive; production code may not call it.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

/** Every production TS/TSX file under the three Feature 010 ownership roots. */
function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}
const FEATURE_010_ROOTS = ["src/app/dashboard-admin", "lib/admin", "components/admin"] as const;
const feature010Files = FEATURE_010_ROOTS.flatMap((dir) => walk(dir));

/**
 * Feature 008's finance domain tables. `payment_accounts` is deliberately NOT here: it is the
 * platform's own bank-account CONFIGURATION table, assigned to Feature 010 (T029, 008 plan decision
 * 6) and written only by `lib/admin/payment-accounts.ts` under `is_super_admin()` (RUN F).
 */
const FINANCE_TABLES = ["payments", "payment_proofs", "payment_reviews", "payment_events", "payouts", "tax_invoices", "order_financials", "proforma_invoices", "proforma_invoice_items"] as const;

/** Strip `//` and `/* *\/` comments so the audit judges runtime code, not the documentation that names the primitive. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, getAll: () => [] }) }));
const redirectCalls = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectCalls.targets.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(cleanup);

beforeAll(() => {
  prepareComplianceFixture();
}, 90_000);

afterAll(() => {
  const result = cleanupComplianceFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
}, 90_000);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

/**
 * Each finance page is exactly `<AdminAreaPlaceholder areaKey="…" />` (pinned statically below), and
 * that placeholder is an async server component jsdom cannot await through `render`; so the live
 * authorization proof executes the placeholder for the page's area key with the real session.
 */
async function renderFinanceArea(areaKey: "payments" | "payouts" | "invoices") {
  const { AdminAreaPlaceholder } = await import("@/components/admin/area-placeholder");
  return renderPage(await AdminAreaPlaceholder({ areaKey }));
}

const LIVE_TIMEOUT_MS = 90_000;
const FINANCE_PAGES = [
  ["payments", "src/app/dashboard-admin/(finance)/payments/page"],
  ["payouts", "src/app/dashboard-admin/(finance)/payouts/page"],
  ["invoices", "src/app/dashboard-admin/(finance)/invoices/page"],
] as const;

describe("T014 structural audit — Feature 010 cannot call settlement directly", () => {
  it("scans a non-trivial set of production files across all three ownership roots", () => {
    expect(feature010Files.length).toBeGreaterThan(20);
    for (const dir of FEATURE_010_ROOTS) expect(feature010Files.some((f) => f.startsWith(dir))).toBe(true);
  });

  it("no production file under src/app/dashboard-admin, lib/admin or components/admin contains a runtime `admin_review_payment` reference", () => {
    for (const file of feature010Files) {
      expect(stripComments(source(file)), file).not.toMatch(/admin_review_payment/);
    }
  });

  it("no production file under the three roots invokes `submit_payment_proof` or any settlement/payout/invoice RPC — the only RPCs are the six approved role-function attests", async () => {
    const { ROLE_FUNCTION_ATTESTS } = await import("@/lib/admin/areas");
    const approved = new Set<string>(Object.keys(ROLE_FUNCTION_ATTESTS));
    for (const file of feature010Files) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/submit_payment_proof|create_payout|record_tax_invoice|settle_/);
      for (const match of src.matchAll(/\.rpc\(\s*([^)]*)\)/g)) {
        const argument = match[1].trim();
        // `guards.ts` calls `supabase.rpc(fn)` where `fn` is typed as one of the six attests.
        expect(argument === "fn" || approved.has(argument.replace(/^["']|["']$/g, "")), `${file}: rpc(${argument})`).toBe(true);
      }
    }
  });

  it("no Feature 010 file performs a finance-table WRITE (insert/update/upsert/delete) — payments, proofs, reviews, payouts, tax invoices, financials are Feature 008's", () => {
    for (const file of feature010Files) {
      const src = stripComments(source(file));
      for (const table of FINANCE_TABLES) {
        const fromCalls = [...src.matchAll(new RegExp(`\\.from\\(\\s*"${table}"\\s*\\)([\\s\\S]{0,200})`, "g"))];
        for (const call of fromCalls) {
          expect(call[1], `${file}: .from("${table}")`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
        }
      }
      expect(src, file).not.toMatch(/\.delete\(/);
    }
  });

  it("the only finance-table access in Feature 010 is RUN A's overview COUNT reads (payments PROOF_SUBMITTED/UNDER_REVIEW, payouts PENDING_PAYOUT) — no row-level payment read domain was built", async () => {
    const { ADMIN_OVERVIEW_QUERIES } = await import("@/lib/admin/read");
    const financeQueries = Object.values(ADMIN_OVERVIEW_QUERIES)
      .flat()
      .filter((q) => (FINANCE_TABLES as readonly string[]).includes(q.table));
    expect(financeQueries.map((q) => `${q.table}:${(q.statusIn ?? []).join("|")}`).sort()).toEqual(["payments:PROOF_SUBMITTED", "payments:UNDER_REVIEW", "payouts:PENDING_PAYOUT"]);

    for (const file of feature010Files) {
      const src = stripComments(source(file));
      for (const table of FINANCE_TABLES) {
        const literal = new RegExp(`(table:\\s*"${table}"|\\.from\\(\\s*"${table}"\\s*\\))`);
        if (literal.test(src)) expect(file, `${table} referenced outside the overview count layer`).toBe("lib/admin/read.ts");
      }
    }
    const read = stripComments(source("lib", "admin", "read.ts"));
    expect(read).not.toMatch(/\.from\(\s*"(payments|payouts|tax_invoices|order_financials|payment_proofs)"\s*\)/);
    expect(read).toMatch(/head:\s*true/);
    // No money column is selected anywhere in lib/admin — amounts stay deferred to Feature 008.
    expect(read).not.toMatch(/amount|seller_net|commission|buyer_total/);
  });

  it("no Feature 010 file imports a Feature 008 module that does not exist yet (settlement/decision/payout/invoice writers) nor duplicates its DTO shapes", () => {
    for (const file of feature010Files) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/@\/lib\/finance\/(settlement|decision|payouts|invoices|queue)/);
      expect(src, file).not.toMatch(/decidePayment|PaymentReviewQueue|TaxInvoiceRecord|PayoutTransition/);
    }
  });

  it("no service-role runtime and no shared/public cache anywhere in the Feature 010 roots", () => {
    for (const file of feature010Files) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/SERVICE_ROLE|service_role|unstable_cache|"use cache"|cacheTag|cacheLife/);
    }
  });
});

describe("T013 / T015 honesty — finance areas stay dependency-blocked, not fake screens", () => {
  it("payments, payouts and invoices are declared `blocked` on `feature-008-finance-layer` and all map to `is_finance_operator`", async () => {
    const { ADMIN_AREAS } = await import("@/lib/admin/areas");
    const finance = ADMIN_AREAS.filter((a) => a.group === "finance");
    expect(finance.map((a) => a.key).sort()).toEqual(["invoices", "payments", "payouts"]);
    for (const area of finance) {
      expect(area.availability, area.key).toBe("blocked");
      expect(area.blocker, area.key).toBe("feature-008-finance-layer");
      expect(area.roleFunction, area.key).toBe("is_finance_operator");
      expect(area.phase, area.key).toBe(5);
    }
    // One destination per Feature 008 workflow — no duplicate "settlement" route split off from payments.
    expect(new Set(finance.map((a) => a.href)).size).toBe(3);
  });

  it("each finance page renders only the honest placeholder — no table, no amount, no proof-open action, no decision form", () => {
    for (const [key, file] of FINANCE_PAGES) {
      const page = source(`${file}.tsx`);
      expect(page).toContain(`<AdminAreaPlaceholder areaKey="${key}" />`);
      expect(page).not.toMatch(/TableCardList|DataTable|formatMoney|useActionState|AlertDialog|signedUrl|createSignedUrl|storage/);
    }
    const layout = source("src/app/dashboard-admin/(finance)/layout.tsx");
    expect(layout).toContain('checkGroupAccess("finance")');
  });

  it("the blocker copy names all four missing Feature 008 layers in EN and AR", async () => {
    const { en } = await import("@/lib/app/copy/en");
    const { ar } = await import("@/lib/app/copy/ar");
    const enText = en.admin.states.blockers["feature-008-finance-layer"];
    expect(enText).toMatch(/payment review queue/);
    expect(enText).toMatch(/settlement decision/);
    expect(enText).toMatch(/payout management/);
    expect(enText).toMatch(/invoice recording/);
    expect(enText).toMatch(/never calls settlement directly/);
    expect(ar.admin?.states?.blockers?.["feature-008-finance-layer"]).toMatch(/008/);
  });

  it("no member Finance route exists beyond Feature 008's approved payment/payout-state routes: no /dashboard/{invoices,settlement,finance} segment, /dashboard/payments and /dashboard/payouts are EXACTLY their approved pages, and no member-side file writes payouts or tax invoices", () => {
    for (const segment of ["invoices", "settlement", "finance"]) {
      expect(existsSync(path.join(root, "src/app/dashboard", segment)), segment).toBe(false);
    }
    // Feature 008 T022 (commit 3234458, 2026-09-17) legitimately introduced the member payment-state routes
    // `/dashboard/payments` and `/dashboard/payments/[orderId]` — this assertion previously (and correctly, at
    // the time) forbade the whole segment. The contract is now pinned EXACTLY: those two pages and nothing else,
    // so any additional payments route (or a non-page file) still fails here.
    expect(walk("src/app/dashboard/payments").sort()).toEqual(["src/app/dashboard/payments/[orderId]/page.tsx", "src/app/dashboard/payments/page.tsx"]);
    // Feature 008 T023 (this run) legitimately added ONE READ-ONLY member payout-RECORD list —
    // `payouts.status`/`amount`/`paidAt` are already-stored accounting snapshots, never a decision UI
    // (no approve/reject/transition control exists anywhere in this file, matching FR-017's own
    // "a payout record is never proof of money movement" boundary). Same discipline as `/dashboard/
    // payments` above: pinned EXACTLY to the one approved page, so any second file still fails here.
    expect(walk("src/app/dashboard/payouts").sort()).toEqual(["src/app/dashboard/payouts/page.tsx"]);
    const memberFiles = [...walk("src/app/dashboard"), ...walk("lib/orders"), ...walk("lib/finance")];
    // Feature 008 RUN E (Stripe provider decision, 2026-09-22) added `lib/finance/settlement.ts` (T018)
    // — the ONE approved, single-caller module for `admin_review_payment()` (its own dedicated audit,
    // `tests/finance/stripe-boundary-security.test.ts`, proves repo-wide that nothing else calls it).
    // This file's job was always "no OTHER member/orders/finance file bypasses the approved boundary" —
    // settlement.ts now IS that boundary, so it is the one deliberate exclusion here, not a weakening.
    const approvedSettlementCaller = "lib/finance/settlement.ts";
    for (const file of memberFiles) {
      const src = stripComments(source(file));
      for (const table of ["payouts", "tax_invoices", "payments", "payment_reviews", "payment_proofs"]) {
        for (const call of src.matchAll(new RegExp(`\\.from\\(\\s*"${table}"\\s*\\)([\\s\\S]{0,200})`, "g"))) {
          expect(call[1], `${file}: .from("${table}")`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
        }
      }
      if (file === approvedSettlementCaller) continue;
      expect(src, file).not.toMatch(/admin_review_payment|submit_payment_proof/);
    }
  });
});

describe("FINANCE authorization by direct URL on the three finance pages (live sessions)", () => {
  it("FINANCE fixture reaches payments, payouts and invoices — each renders the `blocked` state, never `forbidden`, and never a money figure", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
    await withLiveClient(client, async () => {
      for (const [key] of FINANCE_PAGES) {
        await renderFinanceArea(key);
        expect(document.querySelector('[data-admin-state="blocked"]'), key).not.toBeNull();
        expect(document.querySelector('[data-admin-state="forbidden"]')).toBeNull();
        expect(screen.getAllByText(/Feature 008 has not yet supplied/).length).toBeGreaterThan(0);
        expect(document.body.textContent).not.toMatch(/\b(AED|USD|EUR)\s?\d/);
        cleanup();
      }
    });
  }, LIVE_TIMEOUT_MS);

  it("COMPLIANCE and WAREHOUSE are refused with `forbidden`, a plain approved MEMBER with `no-operational-role`, on every finance page — and at the (finance) layout itself", async () => {
    const refused = [
      [FOUNDATION_FIXTURES.complianceReviewer.email, "forbidden"],
      [FOUNDATION_FIXTURES.warehouseAdmin.email, "forbidden"],
      [FOUNDATION_FIXTURES.buyerOnly.email, "no-operational-role"],
    ] as const;
    for (const [email, state] of refused) {
      const client = await signInAsFixture(email);
      await withLiveClient(client, async () => {
        const FinanceLayout = (await import("@/src/app/dashboard-admin/(finance)/layout")).default;
        await renderPage((await FinanceLayout({ children: "SECRET FINANCE CONTENT" })) as React.ReactElement);
        expect(screen.queryByText("SECRET FINANCE CONTENT"), email).toBeNull();
        expect(document.querySelector(`[data-admin-state="${state}"]`), email).not.toBeNull();
        cleanup();
        for (const [key] of FINANCE_PAGES) {
          await renderFinanceArea(key);
          expect(document.querySelector(`[data-admin-state="${state}"]`), `${email} → ${key}`).not.toBeNull();
          expect(document.querySelector('[data-admin-state="blocked"]'), `${email} → ${key}`).toBeNull();
          cleanup();
        }
      });
    }
  }, LIVE_TIMEOUT_MS * 2);

  it("anonymous on a finance page is redirected to the operator sign-in, never shown finance content", async () => {
    const client = createAnonymousFixtureClient();
    await withLiveClient(client, async () => {
      redirectCalls.targets.length = 0;
      const { AdminAreaPlaceholder } = await import("@/components/admin/area-placeholder");
      const element = await AdminAreaPlaceholder({ areaKey: "payments" });
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
      expect(new Set(redirectCalls.targets)).toEqual(new Set(["/admin/sign-in/"]));
    });
  }, LIVE_TIMEOUT_MS);
});
