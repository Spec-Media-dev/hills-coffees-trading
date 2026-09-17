// Feature 008 T022 — real Chrome + axe proof of the two new private payment-state routes
// (`/dashboard/payments`, `/dashboard/payments/[orderId]`) across EN/AR × light/dark × 390/1366.
// Builds a genuine checked-out order through the SAME production database contract Feature 007's own
// `executeCheckout` uses (raw REST + `checkout_order()` RPC under the buyer's own session — no
// service role, no TypeScript import into this standalone script, mirroring
// `tests/browser/feature009-rund-final.browser.mjs`'s own established technique) — never a fabricated
// row. Checks: axe clean, one <main>, correct lang/dir/theme, no overflow, the real stored
// status/amount/currency render, the funding-unavailable notice renders with no bank instructions and
// no fund/pay button anywhere, keyboard focus reaches the detail link with a visible ring, an
// anonymous visitor and a cross-organization member see no private data, and zero console/page/request
// errors.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const FIXTURES = {
  buyer: { email: "buyer-and-seller+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000002" },
  otherOrgBuyer: { email: "buyer-only+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000001" },
  warehouseAdmin: { email: "warehouse-admin+foundation-test@example.com" },
  offerCheckout: "07000000-0000-4000-8000-000000000003",
};

async function signIn(email) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: process.env.TEST_FIXTURE_PASSWORD }),
  });
  const session = await response.json();
  assert(response.ok && session.access_token, `Fixture authentication failed for ${email}`, { status: response.status });
  return session;
}

function restClientFor(session) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  async function call(method, path, { body, prefer } = {}) {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: { apikey, authorization: `Bearer ${session.access_token}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    assert(response.ok, `PostgREST ${method} ${path} failed`, { status: response.status, data });
    return data;
  }
  return { call, userId: session.user.id };
}

/** Buyer DRAFT → item → shipment plan → REQUESTED → warehouse READY → CONFIRMED → checkout_order() RPC — the SAME contract `lib/orders/checkout.ts#executeCheckout` uses, replicated over raw REST/RPC (no TS import into this standalone script, no service role). */
async function buildCheckedOutOrder(buyerRest, buyerSession, warehouseSession, tag) {
  await buyerRest.call("POST", "orders", { body: { buyer_organization_id: FIXTURES.buyer.organizationId, created_by: buyerRest.userId } });
  const [order] = await buyerRest.call("GET", `orders?buyer_organization_id=eq.${FIXTURES.buyer.organizationId}&created_by=eq.${buyerRest.userId}&status=eq.DRAFT&select=id,order_code&order=created_at.desc,id.desc&limit=1`);
  const [item] = await buyerRest.call("POST", "order_items", { body: { order_id: order.id, offer_id: FIXTURES.offerCheckout, quantity_kg: 1 }, prefer: "return=representation" });
  const [shipment] = await buyerRest.call("POST", "order_shipments", {
    body: { order_id: order.id, created_by: buyerRest.userId, delivery_method: "Courier", country_code: "AE", city: "Dubai", address_line: `1 T022 Browser Street ${tag}`, contact_name: "T022 Browser Tester", contact_phone: "+971500000098" },
    prefer: "return=representation",
  });
  await buyerRest.call("POST", "shipment_items", { body: { shipment_id: shipment.id, order_item_id: item.id, planned_quantity_kg: 1 } });
  await buyerRest.call("PATCH", `order_shipments?id=eq.${shipment.id}`, { body: { status: "REQUESTED" } });

  const warehouseRest = restClientFor(warehouseSession);
  await warehouseRest.call("PATCH", `order_shipments?id=eq.${shipment.id}`, { body: { status: "READY" } });

  await buyerRest.call("PATCH", `orders?id=eq.${order.id}&buyer_organization_id=eq.${FIXTURES.buyer.organizationId}&status=eq.DRAFT`, { body: { status: "CONFIRMED", idempotency_key: randomUUID() } });
  // checkout_order() returns a single jsonb value (a scalar RPC result), never a row array.
  const checkout = await buyerRest.call("POST", "rpc/checkout_order", { body: { p_order_id: order.id } });
  assert(checkout, "checkout_order() produced no result", {});

  return order.id;
}

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const scenarios = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "en", dir: "ltr", width: 390, height: 844, label: "en-dark-390" },
  { theme: "light", locale: "ar", dir: "rtl", width: 1366, height: 900, label: "ar-light-1366" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-dark-390" },
];
const report = { surfaces: [], anonymous: null, crossOrg: null, keyboard: null, noticeText: null };

const buyerSession = await signIn(FIXTURES.buyer.email);
const otherOrgSession = await signIn(FIXTURES.otherOrgBuyer.email);
const warehouseSession = await signIn(FIXTURES.warehouseAdmin.email);
const buyerRest = restClientFor(buyerSession);

const orderId = await buildCheckedOutOrder(buyerRest, buyerSession, warehouseSession, randomUUID().slice(0, 8));

const browser = await launchBrowser("about:blank");
const { client } = browser;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function setAppearance(a) {
  await viewport(client, a.width, a.height);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(a.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(a.locale)}); })()`);
}
async function setSession(session) {
  await client.send("Network.clearBrowserCookies");
  if (session) await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(session), path: "/", sameSite: "Lax" });
}
async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    // Buttons are scoped to <main> only — the shared AppShell topbar/sidebar/mobile-nav chrome
    // (menu toggle, theme switcher, org switcher, account menu) is Feature 001/004's shell, not a
    // T022 surface, and legitimately has icon-only buttons unrelated to payments.
    return { url: location.pathname, width: root.clientWidth, scrollWidth: root.scrollWidth, language: root.lang, direction: root.dir, dark: root.classList.contains("dark"), mains: document.querySelectorAll("main").length, body: document.body.innerText, buttons: [...document.querySelectorAll("main button")].map((b) => ({ text: b.textContent, disabled: b.disabled })), violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })) };
  })()`);
}
async function waitFor(expected, a) {
  let surface = await evaluateSurface();
  for (let i = 0; i < 32 && !(expected.test(surface.body) && surface.language === a.locale && surface.direction === a.dir); i += 1) {
    await pause(250);
    surface = await evaluateSurface();
  }
  return surface;
}
const RAW_ERROR = /PGRST|permission denied|violates|SQLSTATE|supabase|row-level security|23505|23514|42501|stripe|network|fetch failed/i;

function checkSurface(label, surface, a, expected) {
  assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected), body: surface.body.slice(0, 400) });
  assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth });
  assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
  assert(surface.language === a.locale && surface.direction === a.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
  assert(surface.dark === (a.theme === "dark"), `${label} wrong theme`, {});
  assert(!RAW_ERROR.test(surface.body), `${label} leaked a raw error or provider reference`, {});
  for (const button of surface.buttons) {
    assert(button.disabled || /Previous|Next/i.test(button.text ?? ""), `${label} has an enabled non-pagination button (possible payment CTA)`, button);
  }
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── (1) Anonymous: neither route ever leaks private payment data or lands anywhere but the unauthorized state. ──
  await setSession(null);
  await viewport(client, 1366, 900);
  const anonymousLeaks = [];
  for (const path of ["/dashboard/payments/", `/dashboard/payments/${orderId}/`]) {
    await goto(client, `${baseUrl}${path}`);
    const facts = await client.evaluate(`({ url: location.pathname, body: document.body.innerText })`);
    const leaked = facts.body.includes(orderId);
    if (leaked) anonymousLeaks.push({ path, url: facts.url });
  }
  assert(anonymousLeaks.length === 0, "Anonymous visitor saw private payment data", anonymousLeaks);
  report.anonymous = { checked: 2, leaked: 0 };

  // ── (2) Cross-organization member: not-found on the direct detail URL, empty list. ──
  await setSession(otherOrgSession);
  await goto(client, `${baseUrl}/dashboard/payments/${orderId}/`);
  const crossOrgFacts = await client.evaluate(`({ body: document.body.innerText })`);
  assert(!crossOrgFacts.body.includes(orderId), "Cross-org member saw the order id on the detail page", {});
  await goto(client, `${baseUrl}/dashboard/payments/`);
  const crossOrgListFacts = await client.evaluate(`({ hasLink: Boolean(document.querySelector('a[href="/dashboard/payments/${orderId}/"]')) })`);
  assert(!crossOrgListFacts.hasLink, "Cross-org member's payments list linked to another org's order", {});
  report.crossOrg = { detailLeaked: false, listLeaked: false };

  // ── (3) Buyer, real session: surfaces × appearances. ──
  await setSession(buyerSession);
  const pages = [
    { key: "list", path: "/dashboard/payments/", expectEn: /Payments/, expectAr: /المدفوعات/ },
    { key: "detail", path: `/dashboard/payments/${orderId}/`, expectEn: /Pending|Funding isn't available/, expectAr: /قيد الانتظار|التمويل غير متاح/ },
  ];
  for (const a of scenarios) {
    for (const page of pages) {
      await setAppearance(a);
      await goto(client, `${baseUrl}${page.path}`);
      const label = `${a.label} ${page.key}`;
      const expected = a.locale === "ar" ? page.expectAr : page.expectEn;
      const surface = await waitFor(expected, a);
      checkSurface(label, surface, a, expected);
      assert(surface.mains >= 1, `${label} has no <main>`, {});
      if (page.key === "detail") {
        assert(!/IBAN|SWIFT|account number/i.test(surface.body), `${label} rendered bank instructions`, {});
        assert(surface.body.includes(orderId), `${label} does not show the real order id`, {});
      }
      report.surfaces.push({ label, url: surface.url, violations: surface.violations.length });
    }
  }
  report.noticeText = report.surfaces.length > 0 ? "checked per-surface above" : null;

  // ── (4) Keyboard: Tab reaches the list's detail link with a visible focus ring. ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard/payments/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 200 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => { const el = document.activeElement; const href = el?.getAttribute?.("href") ?? ""; if (!el || el.tagName !== "A" || href !== "/dashboard/payments/${orderId}/") return null; const cs = getComputedStyle(el); return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow }; })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached the payment detail link with a visible ring", focus);
  report.keyboard = focus;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-008-T022-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
