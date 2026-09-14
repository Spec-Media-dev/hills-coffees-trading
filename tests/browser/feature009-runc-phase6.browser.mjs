// Feature 009 RUN C Phase 6 (T034) — real Chrome + axe proof over the buyer delivery list/detail
// screens. Follows the established `feature007-phase9.browser.mjs` pattern: a real Supabase
// password-grant sign-in, a real browser auth cookie, real DOM/CSS assertions via CDP. No mocked
// route data. Fixtures are built through the SAME production paths the app itself uses (plain
// PostgREST writes under the real buyer/warehouse sessions' own RLS — never service-role).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const FIXTURES = {
  buyer: { email: "buyer-and-seller+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000002" },
  warehouseAdmin: { email: "warehouse-admin+foundation-test@example.com" },
  offerPublished: "06000000-0000-4000-8000-000000000006",
};

function runFixtureScript(args) {
  loadEnv();
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/seed-test-fixtures.ts", ...args], { cwd: process.cwd(), env: process.env, stdio: "ignore" });
}

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

/** Buyer DRAFT -> item -> shipment plan -> item -> REQUESTED, no checkout (a genuinely unsettled, pre-payment shipment). */
async function buildRequestedShipment(buyerRest, tag) {
  await buyerRest.call("POST", "orders", { body: { buyer_organization_id: FIXTURES.buyer.organizationId, created_by: buyerRest.userId } });
  const [order] = await buyerRest.call("GET", `orders?buyer_organization_id=eq.${FIXTURES.buyer.organizationId}&created_by=eq.${buyerRest.userId}&status=eq.DRAFT&select=id,order_code&order=created_at.desc,id.desc&limit=1`);
  const [item] = await buyerRest.call("POST", "order_items", { body: { order_id: order.id, offer_id: FIXTURES.offerPublished, quantity_kg: 2 }, prefer: "return=representation" });
  const [shipment] = await buyerRest.call("POST", "order_shipments", {
    body: { order_id: order.id, created_by: buyerRest.userId, delivery_method: "Courier", country_code: "AE", city: "Dubai", address_line: `1 Phase6 Street ${tag}`, contact_name: "Phase 6 Tester", contact_phone: "+971500000091" },
    prefer: "return=representation",
  });
  await buyerRest.call("POST", "shipment_items", { body: { shipment_id: shipment.id, order_item_id: item.id, planned_quantity_kg: 2 } });
  await buyerRest.call("PATCH", `order_shipments?id=eq.${shipment.id}`, { body: { status: "REQUESTED" } });
  return { orderId: order.id, orderCode: order.order_code, shipmentId: shipment.id };
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

const buyerSession = await signIn(FIXTURES.buyer.email);
const warehouseSession = await signIn(FIXTURES.warehouseAdmin.email);
const buyerRest = restClientFor(buyerSession);
const warehouseRest = restClientFor(warehouseSession);

// Shipment A: stays REQUESTED (list page checkpoint).
const shipmentA = await buildRequestedShipment(buyerRest, randomUUID().slice(0, 8));
// Shipment B: warehouse marks READY, then FAILED — detail page's reason panel + timeline checkpoint.
const shipmentB = await buildRequestedShipment(buyerRest, randomUUID().slice(0, 8));
await warehouseRest.call("PATCH", `order_shipments?id=eq.${shipmentB.shipmentId}`, { body: { status: "READY" } });
await warehouseRest.call("PATCH", `order_shipments?id=eq.${shipmentB.shipmentId}`, { body: { status: "FAILED" } });

const browser = await launchBrowser(`${baseUrl}/dashboard/deliveries/`);
const { client } = browser;
const report = { list: [], detail: [], keyboard: null };

const scenarios4 = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-dark-1366" },
  { theme: "light", locale: "ar", dir: "rtl", width: 1366, height: 900, label: "ar-light-1366" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-dark-390" },
];
const corners2 = [scenarios4[0], scenarios4[3]];

async function setAppearance(appearance) {
  await viewport(client, appearance.width, appearance.height);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)}); })()`);
}

async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    const main = document.querySelector("main");
    const heading = document.querySelector("h1");
    return {
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      language: root.lang,
      direction: root.dir,
      dark: root.classList.contains("dark"),
      main: Boolean(main),
      hasHeading: Boolean(heading),
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  await client.send("Network.setCookie", { url: baseUrl, name: `sb-${projectRef}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(buyerSession)).toString("base64url")}`, path: "/", sameSite: "Lax" });
  await goto(client, `${baseUrl}/dashboard/deliveries/`);

  // ── Checkpoint 1: deliveries list — full 4-way appearance matrix ──
  for (const appearance of scenarios4) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/deliveries/`);
    const surface = await evaluateSurface();
    const list = await client.evaluate(`(() => ({
      hasShipmentCode: document.body.innerText.includes(${JSON.stringify(shipmentA.orderCode)}),
      rowCount: document.querySelectorAll('tr, li[class]').length,
      bodySnippet: document.body.innerText.slice(0, 400),
    }))()`);
    assert(surface.scrollWidth <= surface.width + 1, `${appearance.label} deliveries list overflow`, surface);
    assert(surface.main && surface.hasHeading, `${appearance.label} deliveries list missing landmarks`, surface);
    assert(surface.violations.length === 0, `${appearance.label} deliveries list axe violations`, surface);
    assert(list.hasShipmentCode, `${appearance.label} deliveries list missing the seeded order`, list);
    report.list.push({ ...appearance, ...surface, ...list });
  }

  // Keyboard: Tab reaches the "View details" link.
  await setAppearance(scenarios4[0]);
  await goto(client, `${baseUrl}/dashboard/deliveries/`);
  await client.evaluate(`document.body.focus()`);
  let reachedViewDetails = false;
  for (let index = 0; index < 60; index += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const focused = await client.evaluate(`(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute('href') }))()`);
    if (focused.tag === "A" && /deliveries\//.test(focused.href ?? "")) {
      reachedViewDetails = true;
      break;
    }
  }
  assert(reachedViewDetails, "Keyboard Tab never reached a delivery detail link");
  report.keyboard = { reachedViewDetails };

  // ── Checkpoint 2: FAILED shipment detail — reason panel, timeline, status badge (2 corner scenarios) ──
  for (const appearance of corners2) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/deliveries/${shipmentB.shipmentId}/`);
    const surface = await evaluateSurface();
    const detail = await client.evaluate(`(() => {
      const body = document.body.innerText;
      return {
        hasReasonHeading: /Reason|السبب/.test(body),
        hasNotRecorded: /No reason has been recorded|لم يُسجَّل سبب/.test(body),
        hasFailedStatus: /Failed|فشلت/.test(body),
        hasAddress: /Phase6 Street/.test(body),
      };
    })()`);
    assert(surface.scrollWidth <= surface.width + 1, `${appearance.label} delivery detail overflow`, surface);
    assert(surface.violations.length === 0, `${appearance.label} delivery detail axe violations`, surface);
    assert(detail.hasReasonHeading && detail.hasNotRecorded, `${appearance.label} delivery detail missing honest reason panel`, detail);
    assert(detail.hasFailedStatus, `${appearance.label} delivery detail missing FAILED status`, detail);
    assert(detail.hasAddress, `${appearance.label} delivery detail missing address`, detail);
    report.detail.push({ ...appearance, ...surface, ...detail });
  }

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-009-RUNC-PHASE6-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  runFixtureScript(["--reset-delivery-fixtures"]);
}
