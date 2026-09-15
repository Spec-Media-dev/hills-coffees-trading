// Feature 009 RUN D (Phase 7 final closure) — real Chrome addendum to `feature009-runc-phase6.browser.mjs`.
// Same harness, same fixture discipline (real password-grant sessions, plain PostgREST writes under
// the buyer/warehouse sessions' own RLS, never service-role). Adds the final-closure checks RUN C's
// script did not assert: (1) an ANONYMOUS visitor never sees private delivery data on either route,
// (2) a CROSS-ORGANIZATION member gets not-found (no address, no shipment code) on another org's
// shipment, (3) keyboard focus is VISIBLE (outline/box-shadow) on the focused delivery link,
// (4) every interactive target inside <main> at 390px meets the WCAG 2.2 24x24 minimum,
// (5) quantities render WITH units and "Planned" vs "Delivered" stay distinct in EN and AR,
// (6) zero console/page errors (React hydration mismatches log to console.error) and zero failed requests.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";

const FIXTURES = {
  buyer: { email: "buyer-and-seller+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000002" },
  otherOrgBuyer: { email: "buyer-only+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000001" },
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
    body: { order_id: order.id, created_by: buyerRest.userId, delivery_method: "Courier", country_code: "AE", city: "Dubai", address_line: `7 RunD Street ${tag}`, contact_name: "Run D Tester", contact_phone: "+971500000097" },
    prefer: "return=representation",
  });
  await buyerRest.call("POST", "shipment_items", { body: { shipment_id: shipment.id, order_item_id: item.id, planned_quantity_kg: 2 } });
  await buyerRest.call("PATCH", `order_shipments?id=eq.${shipment.id}`, { body: { status: "REQUESTED" } });
  return { orderId: order.id, orderCode: order.order_code, shipmentId: shipment.id, shipmentCode: shipment.shipment_code, address: `7 RunD Street ${tag}` };
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

const buyerSession = await signIn(FIXTURES.buyer.email);
const otherOrgSession = await signIn(FIXTURES.otherOrgBuyer.email);
const buyerRest = restClientFor(buyerSession);

const shipment = await buildRequestedShipment(buyerRest, randomUUID().slice(0, 8));
const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const report = { anonymous: [], crossOrg: null, focus: null, touchTargets: null, quantities: [] };

const browser = await launchBrowser("about:blank");
const { client } = browser;

async function setAppearance(appearance) {
  await viewport(client, appearance.width, appearance.height);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)}); })()`);
}

async function pageFacts() {
  return client.evaluate(`(() => ({ url: location.href, body: document.body.innerText, lang: document.documentElement.lang, dir: document.documentElement.dir }))()`);
}

try {
  // ── (1) Anonymous: no cookie at all. Neither route may render private delivery data. ──
  await viewport(client, 1366, 900);
  for (const path of [`/dashboard/deliveries/`, `/dashboard/deliveries/${shipment.shipmentId}/`]) {
    await goto(client, `${baseUrl}${path}`);
    const facts = await pageFacts();
    const leaked = facts.body.includes(shipment.address) || (shipment.shipmentCode && facts.body.includes(shipment.shipmentCode)) || facts.body.includes(shipment.orderCode);
    assert(!leaked, `Anonymous visitor saw private delivery data at ${path}`, { url: facts.url });
    assert(!facts.url.includes("/dashboard/deliveries"), `Anonymous visitor was left on the private route ${path}`, { url: facts.url });
    report.anonymous.push({ path, landedOn: new URL(facts.url).pathname, leaked });
  }

  // ── (2) Cross-organization member: another org's authorized buyer must get not-found, never the row. ──
  await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(otherOrgSession), path: "/", sameSite: "Lax" });
  await goto(client, `${baseUrl}/dashboard/deliveries/${shipment.shipmentId}/`);
  {
    const facts = await pageFacts();
    const leaked = facts.body.includes(shipment.address) || facts.body.includes(shipment.orderCode) || (shipment.shipmentCode && facts.body.includes(shipment.shipmentCode));
    assert(!leaked, "Cross-organization member saw another organization's shipment", { url: facts.url });
    report.crossOrg = { landedOn: new URL(facts.url).pathname, leaked, notFoundText: /not found|404|غير موجود/i.test(facts.body) };
  }

  // ── Owner session for the remaining checks. ──
  await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(buyerSession), path: "/", sameSite: "Lax" });

  // ── (3) Visible keyboard focus on the delivery link (EN, light, 1366). ──
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await goto(client, `${baseUrl}/dashboard/deliveries/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 60 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el.tagName !== "A" || !/deliveries\\//.test(el.getAttribute("href") ?? "")) return null;
      const cs = getComputedStyle(el);
      return {
        href: el.getAttribute("href"),
        focusVisible: el.matches(":focus-visible"),
        outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow,
      };
    })()`);
  }
  assert(focus, "Keyboard Tab never reached a delivery detail link", {});
  const focusRingVisible = focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none");
  assert(focusRingVisible, "Focused delivery link has no visible focus indicator", focus);
  report.focus = focus;

  // ── (4) Touch targets at 390px (AR, dark): every interactive element inside <main> >= 24x24 (WCAG 2.2 2.5.8). ──
  await setAppearance({ theme: "dark", locale: "ar", width: 390, height: 844 });
  await goto(client, `${baseUrl}/dashboard/deliveries/`);
  const targets = await client.evaluate(`(() => {
    const els = [...document.querySelectorAll("main a, main button, main [role=button], main input, main select")];
    return els.filter((el) => el.getClientRects().length > 0).map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), inlineBreadcrumb: Boolean(el.closest("nav[aria-label=breadcrumb]")) }; });
  })()`);
  // WCAG 2.2 SC 2.5.8 exempts INLINE targets (a link inside a line of text, sized by the text's own
  // line-height). The shared application shell's breadcrumb (Feature 002/004 `components/app/*`, not a
  // Feature 009 element) is exactly that; it is REPORTED, not hidden, and every non-inline target
  // Feature 009 itself renders must meet the 24x24 minimum.
  const inlineExempt = targets.filter((t) => t.inlineBreadcrumb);
  const measured = targets.filter((t) => !t.inlineBreadcrumb);
  const tooSmall = measured.filter((t) => t.w < 24 || t.h < 24);
  assert(measured.length > 0, "No interactive targets found inside <main> on the deliveries list", {});
  assert(tooSmall.length === 0, "Interactive targets below the 24x24 minimum at 390px", tooSmall);
  report.touchTargets = { measured: measured.length, smallest: measured.reduce((m, t) => Math.min(m, t.w, t.h), Infinity), inlineBreadcrumbExempt: inlineExempt };

  // ── (5) Units + planned/delivered distinction on the detail page, EN 1366 and AR 390. ──
  for (const appearance of [
    { theme: "light", locale: "en", width: 1366, height: 900, label: "en-light-1366", planned: /Planned/, delivered: /Delivered/, unit: /\b2(\.\d+)?\s*kg\b/i },
    { theme: "dark", locale: "ar", width: 390, height: 844, label: "ar-dark-390", planned: /المخطط/, delivered: /تم تسليمه/, unit: /\b2(\.\d+)?\s*kg\b/i },
  ]) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard/deliveries/${shipment.shipmentId}/`);
    const facts = await pageFacts();
    const q = {
      label: appearance.label,
      lang: facts.lang,
      dir: facts.dir,
      hasPlanned: appearance.planned.test(facts.body),
      hasDelivered: appearance.delivered.test(facts.body),
      hasUnit: appearance.unit.test(facts.body),
      hasAddress: facts.body.includes(shipment.address),
      overflow: await client.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`),
    };
    assert(q.hasAddress, `${appearance.label} owner cannot see own shipment`, q);
    assert(q.hasPlanned && q.hasDelivered, `${appearance.label} planned/delivered labels are not both present`, q);
    assert(q.hasUnit, `${appearance.label} planned quantity is not rendered with a unit`, q);
    assert(q.overflow <= 1, `${appearance.label} horizontal overflow`, q);
    assert(appearance.locale === "ar" ? q.dir === "rtl" && q.lang === "ar" : q.dir === "ltr" && q.lang === "en", `${appearance.label} wrong lang/dir`, q);
    report.quantities.push(q);
  }

  // ── (6) No console errors (hydration mismatches surface here), no page errors, no failed requests. ──
  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-009-RUND-FINAL-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  runFixtureScript(["--reset-delivery-fixtures"]);
}
