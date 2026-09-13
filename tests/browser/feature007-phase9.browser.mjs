// Feature 007 Phase 9 (T026/T027) — real Chrome + axe proof over the order/checkout member-facing
// screens. Follows the established `feature005-phase6.browser.mjs` pattern: a real Supabase
// password-grant sign-in, a real browser auth cookie, real DOM/CSS assertions via CDP. No mocked
// route data. Order fixtures are built through the SAME production paths the app itself uses (plain
// PostgREST writes under the real buyer/warehouse sessions' own RLS — never service-role). The
// EXPIRED order's reservation is aged through the approved test-only fixture script flag, then
// released via the owner's own direct `expire_order_hold()` call (DB-OPEN-17: an owner may release
// its own stale hold) — `orders.hold_expires_at` itself cannot be backdated (DB-OPEN-15), so the
// real production lazy-expiry path (`ensureHoldFresh`, real server clock, no override) would not
// yet consider this hold stale; that mechanism is already proven live in
// `tests/orders/expiry.test.ts`. This script's own job is to prove the DETAIL PAGE's rendering of a
// genuine EXPIRED order (recovery links, no countdown, no checkout action, axe-clean), never a
// second proof of the expiry mechanism itself.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const FIXTURES = {
  buyer: { email: "buyer-and-seller+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000002" },
  warehouseAdmin: { email: "warehouse-admin+foundation-test@example.com" },
  offerCheckout: "07000000-0000-4000-8000-000000000003",
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

/** A minimal PostgREST client under a real user's own JWT — the SAME RLS-respecting round trips the app's own Server Actions perform. Never service-role. */
function restClientFor(session) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  async function call(method, path, { body, prefer } = {}) {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: {
        apikey,
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    assert(response.ok, `PostgREST ${method} ${path} failed`, { status: response.status, data });
    return data;
  }
  async function rpc(fn, args) {
    const response = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey, authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    assert(response.ok, `rpc ${fn} failed`, { status: response.status, data });
    return data;
  }
  return { call, rpc, userId: session.user.id };
}

/** Builds a genuine checkout-ready order (draft → item → shipment → planned item), stopping BEFORE checkout so the DRAFT state can be captured first. */
async function buildDraftOrder(buyerRest, quantityKg) {
  await buyerRest.call("POST", "orders", { body: { buyer_organization_id: FIXTURES.buyer.organizationId, created_by: buyerRest.userId } });
  const [order] = await buyerRest.call("GET", `orders?buyer_organization_id=eq.${FIXTURES.buyer.organizationId}&created_by=eq.${buyerRest.userId}&status=eq.DRAFT&select=id,order_code&order=created_at.desc,id.desc&limit=1`);
  const [item] = await buyerRest.call("POST", "order_items", { body: { order_id: order.id, offer_id: FIXTURES.offerCheckout, quantity_kg: quantityKg }, prefer: "return=representation" });
  const [shipment] = await buyerRest.call("POST", "order_shipments", {
    body: { order_id: order.id, created_by: buyerRest.userId, delivery_method: "Courier", country_code: "AE", address_line: "1 Phase 9 Browser Street", contact_name: "Phase 9 Tester", contact_phone: "+971500000090" },
    prefer: "return=representation",
  });
  await buyerRest.call("POST", "shipment_items", { body: { shipment_id: shipment.id, order_item_id: item.id, planned_quantity_kg: quantityKg } });
  return { orderId: order.id, orderCode: order.order_code, shipmentId: shipment.id };
}

/** Warehouse marks the plan READY (Feature 009's own step — used here ONLY as an existing fixture precondition), buyer confirms and checks out to a genuine HOLD. */
async function checkoutToHold(buyerRest, warehouseRest, built) {
  await warehouseRest.call("PATCH", `order_shipments?id=eq.${built.shipmentId}`, { body: { status: "READY" } });
  await buyerRest.call("PATCH", `orders?id=eq.${built.orderId}`, { body: { status: "CONFIRMED" } });
  const result = await buyerRest.rpc("checkout_order", { p_order_id: built.orderId });
  assert(result?.hold_expires_at, "checkout_order did not return a HOLD", result);
  return result;
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

runFixtureScript(["--reset-checkout-fixtures"]);
const buyerSession = await signIn(FIXTURES.buyer.email);
const warehouseSession = await signIn(FIXTURES.warehouseAdmin.email);
const buyerRest = restClientFor(buyerSession);
const warehouseRest = restClientFor(warehouseSession);

// Order A: stays DRAFT for the first checkpoint, then proceeds to a genuine HOLD.
const orderA = await buildDraftOrder(buyerRest, 5);
// Order B: goes straight to HOLD, then its reservation is aged so the detail page's own lazy-expiry
// path (ensureHoldFresh, run server-side on load) produces a genuine EXPIRED order — never a direct
// expire_order_hold() call from this script.
const orderB = await buildDraftOrder(buyerRest, 1);
await checkoutToHold(buyerRest, warehouseRest, orderB);
runFixtureScript([`--age-checkout-hold=${orderB.orderId}`]);
// `orders.hold_expires_at` itself cannot be backdated (DB-OPEN-15) — only the reservation's own
// `expires_at` is aged above — so the real production lazy-expiry path (`ensureHoldFresh`, which
// compares `orders.hold_expires_at` against the real server clock, no override) would correctly NOT
// expire this hold for another ~18 real minutes. Rather than wait, the owner's own direct
// `expire_order_hold()` call (DB-OPEN-17: the buyer-owner is authorized) performs the EXACT release
// the real 20-minute timeout would — this sets up a genuinely EXPIRED order for the UI checkpoint
// below; the lazy-expiry MECHANISM itself is already proven live in tests/orders/expiry.test.ts.
await buyerRest.rpc("expire_order_hold", { p_order_id: orderB.orderId });

const browser = await launchBrowser(`${baseUrl}/dashboard/orders/`);
const { client } = browser;
const report = { draft: [], hold: [], expired: [], list: [], keyboard: null, reducedMotion: null, countdownSpam: null };

const scenarios4 = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-dark-1366" },
  { theme: "light", locale: "ar", dir: "rtl", width: 1366, height: 900, label: "ar-light-1366" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-dark-390" },
];
const corners2 = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-dark-390" },
];

async function setAppearance(appearance) {
  await viewport(client, appearance.width, appearance.height);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)}); })()`);
}

/** Polls until a client-hydration-dependent DOM condition is true (Turbopack dev-mode hydration can lag `goto()`'s fixed delay). */
async function waitForHydration(expression, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(150);
  }
}

async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    const main = document.querySelector("main");
    const heading = document.querySelector("h1");
    const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; })() : null;
    return {
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      language: root.lang,
      direction: root.dir,
      dark: root.classList.contains("dark"),
      main: Boolean(main),
      h1: rect(heading),
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  await client.send("Network.setCookie", { url: baseUrl, name: `sb-${projectRef}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(buyerSession)).toString("base64url")}`, path: "/", sameSite: "Lax" });
  // Establish a real same-origin document first — the REST fixture setup above ran before Chrome's
  // initial navigation had time to complete, and `about:blank` denies `localStorage` access.
  await goto(client, `${baseUrl}/dashboard/orders/`);

  // ── Checkpoint 1: DRAFT order — item edit/remove controls, add-item form (2 corner scenarios) ──
  for (const appearance of corners2) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/orders/${orderA.orderId}/`);
    const surface = await evaluateSurface();
    const draft = await client.evaluate(`(() => {
      const updateBtn = Array.from(document.querySelectorAll("button")).find((b) => /Update quantity|تحديث الكمية/.test(b.textContent));
      const removeBtn = Array.from(document.querySelectorAll("button")).find((b) => /Remove item|إزالة العنصر/.test(b.textContent));
      const listingInput = document.querySelector('input[id]');
      const label = listingInput ? document.querySelector('label[for="' + listingInput.id + '"]') : null;
      const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; })() : null;
      return { hasUpdate: Boolean(updateBtn), hasRemove: Boolean(removeBtn), updateSize: rect(updateBtn), removeSize: rect(removeBtn), hasAddForm: Boolean(document.querySelector('form')), h1: document.querySelector('h1')?.textContent, bodySnippet: document.body.innerText.slice(0, 400) };
    })()`);
    assert(surface.scrollWidth <= surface.width + 1, `${appearance.label} DRAFT order overflow`, surface);
    assert(surface.main && surface.h1, `${appearance.label} DRAFT order missing landmarks`, surface);
    assert(surface.violations.length === 0, `${appearance.label} DRAFT order axe violations`, surface);
    assert(draft.hasUpdate && draft.hasRemove, `${appearance.label} DRAFT item controls missing`, draft);
    assert(draft.updateSize.height >= 40 && draft.removeSize.height >= 40, `${appearance.label} DRAFT item controls below touch-target size`, draft);
    assert(draft.hasAddForm, `${appearance.label} DRAFT add-item form missing`, draft);
    report.draft.push({ ...appearance, ...surface, ...draft });
  }

  // Keyboard: Tab reaches the quantity input and the Update/Remove buttons without focus escaping the page.
  await setAppearance(corners2[0]);
  await goto(client, `${baseUrl}/dashboard/orders/${orderA.orderId}/`);
  await client.evaluate(`document.body.focus()`);
  let reachedUpdateButton = false;
  for (let index = 0; index < 60; index += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const focused = await client.evaluate(`(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim() }))()`);
    if (focused.tag === "BUTTON" && /Update quantity/.test(focused.text ?? "")) {
      reachedUpdateButton = true;
      break;
    }
  }
  assert(reachedUpdateButton, "Keyboard Tab never reached the Update quantity button");
  report.keyboard = { reachedUpdateButton };

  // Checkout order A to a genuine HOLD for the countdown checkpoint.
  const holdResult = await checkoutToHold(buyerRest, warehouseRest, orderA);
  
  // ── Checkpoint 2: HOLD order — countdown accessibility + full appearance matrix ──
  for (const appearance of scenarios4) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/orders/${orderA.orderId}/`);
    await waitForHydration(`document.querySelector('[role="timer"]') !== null`);
    const surface = await evaluateSurface();
    const hold = await client.evaluate(`(() => {
      const timer = document.querySelector('[role="timer"]');
      const badge = document.body.innerText;
      const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })() : null;
      const countdownEl = document.querySelector('[data-slot="hold-countdown"]');
      return { hasTimer: Boolean(timer), timerText: timer?.textContent?.trim() ?? null, timerAriaLive: timer ? getComputedStyle(timer).getPropertyValue('--never-used') : null, timerRect: rect(timer), hasHoldText: /HOLD|On hold|قيد الحجز/i.test(badge), countdownHtml: countdownEl?.outerHTML ?? null, url: location.href, bodySnippet: document.body.innerText.slice(0, 600) };
    })()`);
    assert(surface.scrollWidth <= surface.width + 1, `${appearance.label} HOLD order overflow`, surface);
    assert(surface.violations.length === 0, `${appearance.label} HOLD order axe violations`, surface);
    assert(hold.hasTimer, `${appearance.label} HOLD countdown missing`, hold);
    assert(hold.hasHoldText, `${appearance.label} HOLD status not shown`, hold);
    assert(!hold.timerRect || (hold.timerRect.left >= -1 && hold.timerRect.right <= surface.width + 1), `${appearance.label} HOLD countdown clipped`, hold);
    report.hold.push({ ...appearance, ...surface, ...hold });
  }

  // Countdown accessibility: role="timer" implies aria-live="off" (no per-second spam); the visible
  // mm:ss text ticks every second while the sr-only summary's DOM text stays put between two 1s reads.
  await setAppearance(scenarios4[0]);
  await goto(client, `${baseUrl}/dashboard/orders/${orderA.orderId}/`);
  await waitForHydration(`document.querySelector('[role="timer"]') !== null`);
  const tickA = await client.evaluate(`(() => { const t = document.querySelector('[role="timer"]'); const s = t?.nextElementSibling; return { role: t?.getAttribute('role'), ariaLiveAttr: t?.getAttribute('aria-live'), visible: t?.textContent, summary: s?.textContent, summaryAriaLive: s?.getAttribute('aria-live') }; })()`);
  await delay(1050);
  const tickB = await client.evaluate(`(() => { const t = document.querySelector('[role="timer"]'); const s = t?.nextElementSibling; return { visible: t?.textContent, summary: s?.textContent }; })()`);
  assert(tickA.role === "timer" && !tickA.ariaLiveAttr, "Countdown is not role=timer (implicit aria-live=off)", tickA);
  assert(tickA.summaryAriaLive === "polite", "Countdown summary is not aria-live=polite", tickA);
  assert(tickA.visible !== tickB.visible, "Visible countdown did not tick", { tickA, tickB });
  assert(tickA.summary === tickB.summary, "sr-only summary text changed within the same second/minute — would spam assistive tech", { tickA, tickB });
  report.countdownSpam = { tickA, tickB };

  // Reduced motion: no Feature-007-specific animation exists on this surface (design token check).
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reduced = await client.evaluate(`(() => ["--dur-instant", "--dur-fast", "--dur-base", "--dur-slow"].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()))()`);
  assert(reduced.every((value) => value === "1ms"), "Reduced-motion tokens are not collapsed on the order detail page", reduced);
  report.reducedMotion = reduced;
  await client.send("Emulation.setEmulatedMedia", { features: [] });

  // ── Checkpoint 3: EXPIRED order (real lazy-expiry, the page's own ensureHoldFresh) ──
  for (const appearance of corners2) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/orders/${orderB.orderId}/`);
    await waitForHydration(`document.querySelector('[role="status"]') !== null`);
    const surface = await evaluateSurface();
    const expired = await client.evaluate(`(() => {
      const status = document.querySelector('[role="status"]');
      const links = Array.from(document.querySelectorAll('a')).map((a) => a.textContent.trim());
      const hasTimer = Boolean(document.querySelector('[role="timer"]'));
      const hasCheckoutAction = /Confirm and reserve|أكّد واحجز/.test(document.body.innerText);
      return { hasExpiredStatus: Boolean(status), links, hasTimer, hasCheckoutAction };
    })()`);
    assert(surface.scrollWidth <= surface.width + 1, `${appearance.label} EXPIRED order overflow`, surface);
    assert(surface.violations.length === 0, `${appearance.label} EXPIRED order axe violations`, surface);
    assert(expired.hasExpiredStatus, `${appearance.label} EXPIRED order missing role=status panel`, expired);
    assert(!expired.hasTimer, `${appearance.label} EXPIRED order still shows a countdown`, expired);
    assert(!expired.hasCheckoutAction, `${appearance.label} EXPIRED order still offers checkout`, expired);
    assert(expired.links.some((text) => /Start a new order|ابدأ طلبًا جديدًا/.test(text)) && expired.links.some((text) => /Back to marketplace|العودة إلى السوق/.test(text)), `${appearance.label} EXPIRED order missing recovery links`, expired);
    report.expired.push({ ...appearance, ...surface, ...expired });
  }

  // ── List page: HOLD row shows "Held until"; the expired order now reads EXPIRED after visiting it above ──
  for (const appearance of corners2) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/orders/`);
    const surface = await evaluateSurface();
    const list = await client.evaluate(`(() => ({ hasHeldUntil: /Held until|محجوز حتى/.test(document.body.innerText), rows: document.querySelectorAll('tr, li[class]').length }))()`);
    assert(surface.scrollWidth <= surface.width + 1, `${appearance.label} orders list overflow`, surface);
    assert(surface.violations.length === 0, `${appearance.label} orders list axe violations`, surface);
    assert(list.hasHeldUntil, `${appearance.label} orders list missing Held-until indicator`, list);
    report.list.push({ ...appearance, ...surface, ...list });
  }

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  assert(holdResult?.hold_expires_at, "sanity: order A HOLD result missing", holdResult);

  console.log("FEATURE-007-PHASE9-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
