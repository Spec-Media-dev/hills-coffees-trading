// Feature 010 RUN H (Phase 11, T037) — console-WIDE real Chrome + axe pass over the CURRENT surfaces of
// every group (overview/account, compliance, warehouse, catalogue, audit, system) plus the blocked
// finance placeholders (disputes: live since T012) and the not-found / no-operational-role / anonymous states, across
// EN/AR × light/dark × 390/1366/1920. Per surface: axe clean (colour contrast on), exactly one <main>,
// an h1, correct lang/dir + theme, no horizontal overflow, every status badge text-labelled, no raw
// database/RLS/provider text, no long identifier overflowing its container. Then: keyboard traversal
// with a visible focus ring on a compliance queue AND a system list; the mobile drawer at 390 (open →
// focus inside → Escape closes → focus restored); exact-field validation association on a CATALOGUE
// create form (aria-invalid + aria-describedby → role="alert") and on a COMPLIANCE decision form; the
// high-impact decision's alertdialog (keyboard: Escape cancels, nothing written).
//
// Fixtures: the disposable SUPER_ADMIN (satisfies every area function, so one session reaches every
// surface) and the disposable ADMIN (an active `platform_admins` row for the roles detail page), both
// prepared at the start and de-privileged in `finally`; the listing-review fixture is reset to
// PENDING_REVIEW before and after (the dialog proof cancels — no write). Nothing is created.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  superAdmin: "super-admin+t027-test@example.com",
  admin: "catalogue-admin+t021-test@example.com",
  member: "buyer-only+foundation-test@example.com",
  completeDraftApplicationId: "f0000000-0000-4000-8000-000000000072",
  offerPendingReview: "06000000-0000-4000-8000-00000000000d",
  proofCoffeeId: "f0000000-0000-4000-8000-000000000044",
  positionOrgA: "05000000-0000-4000-8000-000000000009",
  warehouseId: "05000000-0000-4000-8000-000000000002",
  nil: "00000000-0000-4000-8000-000000000000",
};

function seed(...args) {
  return execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/seed-test-fixtures.ts"), ...args], { env: process.env, stdio: ["ignore", "pipe", "inherit"] }).toString();
}
const seedJson = (flag) => JSON.parse(seed(flag).trim().split(/\r?\n/).find((line) => line.startsWith("{")) ?? "{}");
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
const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const scenarios = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "en", dir: "ltr", width: 390, height: 844, label: "en-dark-390" },
  { theme: "light", locale: "ar", dir: "rtl", width: 1920, height: 1080, label: "ar-light-1920" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 1366, height: 900, label: "ar-dark-1366" },
  { theme: "light", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-light-390" },
  { theme: "dark", locale: "en", dir: "ltr", width: 1920, height: 1080, label: "en-dark-1920" },
];
const report = { surfaces: [], states: {}, keyboard: {}, drawer: null, validation: {}, dialog: null, fixtures: null };

seed("--prepare-super-admin-fixture");
seed("--prepare-catalogue-admin-fixture");
seed("--reset-listing-review-fixtures");
const adminFixture = seedJson("--inspect-catalogue-admin-fixture");
assert(adminFixture.activeCapability === true && adminFixture.userId, "ADMIN fixture not active for the roles detail surface", adminFixture);

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
    const overflowing = [...document.querySelectorAll("main *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > root.clientWidth + 1 || r.left < -1); }).slice(0, 5).map((el) => el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 3).join(".") : ""));
    return { url: location.pathname + location.search, width: root.clientWidth, scrollWidth: root.scrollWidth, language: root.lang, direction: root.dir, dark: root.classList.contains("dark"), mains: document.querySelectorAll("main").length, hasHeading: Boolean(document.querySelector("h1")), body: document.body.innerText, overflowing, states: [...document.querySelectorAll("[data-admin-state]")].map((el) => el.getAttribute("data-admin-state")), stateScreens: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")), badgesWithoutText: [...document.querySelectorAll('[data-slot="admin-status-badge"], [data-slot="listing-status-badge"]')].filter((el) => !(el.textContent ?? "").trim()).length, violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })) };
  })()`);
}
const click = async (box) => {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
};
const boxOf = async (selector) => client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const setValue = async (selector, value) =>
  client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const key = async (k, code = k) => {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};
async function waitFor(expected, a) {
  let surface = await evaluateSurface();
  for (let i = 0; i < 32 && !(expected.test(surface.body) && surface.language === a.locale && surface.direction === a.dir); i += 1) {
    await pause(250);
    surface = await evaluateSurface();
  }
  return surface;
}
const RAW_ERROR = /PGRST|permission denied|violates|SQLSTATE|supabase|row-level security|23505|23514|42501|_read_failed|TypeError|undefined is not/i;

function checkSurface(label, surface, a, expected) {
  assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected), body: surface.body.slice(0, 400) });
  assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth, overflowing: surface.overflowing });
  assert(surface.overflowing.length === 0, `${label} element extends past the viewport`, surface.overflowing);
  assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
  assert(surface.mains === 1, `${label} must have exactly one <main>`, { mains: surface.mains });
  assert(surface.hasHeading, `${label} has no h1`, {});
  assert(surface.language === a.locale && surface.direction === a.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
  assert(surface.dark === (a.theme === "dark"), `${label} wrong theme`, {});
  assert(!RAW_ERROR.test(surface.body), `${label} leaked a raw error`, {});
  assert(surface.badgesWithoutText === 0, `${label} has a text-less status badge`, {});
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── Anonymous → operator sign-in (unauthorized), member → no-operational-role (distinct), across appearances. ──
  await setSession(null);
  await goto(client, `${baseUrl}/dashboard-admin/kyb/`);
  const anonPath = await client.evaluate("location.pathname");
  assert(/^\/admin\/sign-in\/?$/.test(anonPath), "Anonymous was not redirected to the operator sign-in", { anonPath });
  report.states.anonymous = { redirectedTo: anonPath };

  const memberSession = await signIn(FIXTURES.member);
  await setSession(memberSession);
  report.states.member = [];
  for (const a of [scenarios[0], scenarios[4]]) {
    await goto(client, `${baseUrl}/dashboard-admin/`);
    await setAppearance(a);
    await goto(client, `${baseUrl}/dashboard-admin/`);
    const surface = await waitFor(a.locale === "ar" ? /الوصول التشغيلي مطلوب/ : /Operations access required/, a);
    checkSurface(`${a.label} member-no-operational-role`, surface, a, a.locale === "ar" ? /الوصول التشغيلي مطلوب/ : /Operations access required/);
    assert(surface.states.includes("no-operational-role") && !/Overview|نظرة عامة/.test(surface.body), `${a.label} member shell refusal is not the no-operational-role state`, surface.states);
    report.states.member.push({ label: a.label, states: surface.states, violations: surface.violations.length });
  }

  // ── SUPER_ADMIN reaches every group. Discover a shipment row from the real queue (no fabrication). ──
  const superSession = await signIn(FIXTURES.superAdmin);
  await setSession(superSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  let shipmentPath = null;
  for (const queue of ["", "?queue=ready", "?queue=in_transit", "?queue=closed"]) {
    await goto(client, `${baseUrl}/dashboard-admin/shipments/${queue}`);
    await waitFor(/Shipments/, scenarios[0]);
    shipmentPath = await client.evaluate(`(() => { const a = [...document.querySelectorAll('main a[href^="/dashboard-admin/shipments/"]')].find((el) => /\\/dashboard-admin\\/shipments\\/[0-9a-f-]{36}/.test(el.getAttribute("href"))); return a ? a.getAttribute("href") : null; })()`);
    if (shipmentPath) break;
  }
  assert(shipmentPath, "No shipment row was available in any warehouse queue", {});

  const pages = [
    { group: "shell", key: "overview", path: "/dashboard-admin/", en: /Operations overview/, ar: /نظرة عامة على العمليات/ },
    { group: "shell", key: "account", path: "/dashboard-admin/account/", en: /My account/, ar: /حسابي/ },
    { group: "compliance", key: "kyb-queue", path: "/dashboard-admin/kyb/?view=all", en: /KYB review/, ar: /مراجعة التحقق/ },
    { group: "compliance", key: "kyb-detail", path: `/dashboard-admin/kyb/${FIXTURES.completeDraftApplicationId}/`, en: /Review progress/, ar: /تقدّم المراجعة/ },
    { group: "compliance", key: "organizations", path: "/dashboard-admin/organizations/", en: /Organizations/, ar: /المنظمات/ },
    { group: "compliance", key: "listing-queue", path: "/dashboard-admin/listings/", en: /Listing review/, ar: /مراجعة القوائم/ },
    { group: "compliance", key: "listing-detail", path: `/dashboard-admin/listings/${FIXTURES.offerPendingReview}/`, en: /Record a decision/, ar: /تسجيل قرار/ },
    { group: "compliance", key: "disputes", path: "/dashboard-admin/disputes/", en: /Dispute review/, ar: /مراجعة النزاعات/ }, // live since T012 (Feature 012 layer); full proof: feature010-t012.browser.mjs
    { group: "warehouse", key: "shipments", path: "/dashboard-admin/shipments/", en: /Shipments/, ar: /الشحنات/ },
    { group: "warehouse", key: "shipment-detail", path: `${shipmentPath}/`.replace(/\/\/$/, "/"), en: /Warehouse operations/, ar: /عمليات المستودع/ },
    { group: "warehouse", key: "inventory", path: "/dashboard-admin/inventory/", en: /On hand \(gross\)/, ar: /الموجود \(الإجمالي\)/ },
    { group: "warehouse", key: "position-detail", path: `/dashboard-admin/inventory/${FIXTURES.positionOrgA}/`, en: /kg/, ar: /kg/ },
    { group: "catalogue", key: "coffees", path: "/dashboard-admin/coffees/", en: /Coffees/, ar: /أنواع البن/ },
    { group: "catalogue", key: "coffee-detail", path: `/dashboard-admin/coffees/${FIXTURES.proofCoffeeId}/`, en: /Publication/, ar: /النشر/ },
    { group: "catalogue", key: "coffee-new", path: "/dashboard-admin/coffees/new/", en: /New coffee/, ar: /بن جديد/ },
    { group: "catalogue", key: "warehouses", path: "/dashboard-admin/warehouses/", en: /Warehouses/, ar: /المستودعات/ },
    { group: "catalogue", key: "warehouse-detail", path: `/dashboard-admin/warehouses/${FIXTURES.warehouseId}/`, en: /Locations/, ar: /المواقع/ },
    { group: "catalogue", key: "media", path: "/dashboard-admin/media/", en: /Media/, ar: /الوسائط/ },
    { group: "catalogue", key: "taxonomy", path: "/dashboard-admin/taxonomy/?kind=varieties", en: /Varieties/, ar: /الأصناف/ },
    { group: "audit", key: "audit-listings", path: "/dashboard-admin/audit/", en: /Read-only/, ar: /للقراءة فقط/ },
    { group: "audit", key: "audit-custody", path: "/dashboard-admin/audit/?view=custody", en: /Storage allocations/, ar: /مخصَّصات التخزين/ },
    { group: "audit", key: "audit-log", path: "/dashboard-admin/audit/?view=log", en: /DB-OPEN-06/, ar: /DB-OPEN-06/ }, // SUPER_ADMIN can read the log; the DB-OPEN-06 gap card renders for AUDITOR (RUN E proof)
    { group: "system", key: "roles", path: "/dashboard-admin/roles/", en: /Platform admins/, ar: /مشرفو المنصة/ },
    { group: "system", key: "roles-detail", path: `/dashboard-admin/roles/${adminFixture.userId}/`, en: /Change role/, ar: /تغيير الدور/ },
    { group: "system", key: "tax", path: "/dashboard-admin/tax/", en: /Tax rules/, ar: /القواعد الضريبية/ },
    { group: "system", key: "shipping-empty", path: "/dashboard-admin/shipping/", en: /Not applied by any checkout or shipment path yet/, ar: /لا يطبّقها أي مسار دفع أو شحن بعد/, state: "empty" },
    { group: "system", key: "payment-accounts", path: "/dashboard-admin/payment-accounts/", en: /No dual control \(OPS-01\)/, ar: /لا رقابة مزدوجة \(OPS-01\)/ },
    { group: "finance", key: "payments-blocked", path: "/dashboard-admin/payments/", en: /Waiting on a dependency/, ar: /بانتظار اعتمادية/, state: "blocked" },
    { group: "finance", key: "payouts-blocked", path: "/dashboard-admin/payouts/", en: /Waiting on a dependency/, ar: /بانتظار اعتمادية/, state: "blocked" },
    { group: "finance", key: "invoices-blocked", path: "/dashboard-admin/invoices/", en: /Waiting on a dependency/, ar: /بانتظار اعتمادية/, state: "blocked" },
    { group: "states", key: "not-found-kyb", path: `/dashboard-admin/kyb/${FIXTURES.nil}/`, en: /Not found/, ar: /غير موجود/, state: "not-found" },
    { group: "states", key: "not-found-coffee", path: `/dashboard-admin/coffees/${FIXTURES.nil}/`, en: /Not found/, ar: /غير موجود/, state: "not-found" },
    { group: "states", key: "not-found-commission", path: `/dashboard-admin/commission/${FIXTURES.nil}/`, en: /Not found/, ar: /غير موجود/, state: "not-found" },
  ];
  for (const a of scenarios) {
    await goto(client, `${baseUrl}/dashboard-admin/`);
    await setAppearance(a);
    for (const page of pages) {
      await goto(client, `${baseUrl}${page.path}`);
      const label = `${a.label} ${page.key}`;
      const expected = a.locale === "ar" ? page.ar : page.en;
      const surface = await waitFor(expected, a);
      checkSurface(label, surface, a, expected);
      if (page.state) assert(surface.states.includes(page.state), `${label} does not render the ${page.state} state`, surface.states);
      if (page.key === "coffee-detail") {
        const mobileCards = await client.evaluate(`({ table: getComputedStyle(document.querySelector("main table") ?? document.body).display, hasTable: Boolean(document.querySelector("main table")) })`);
        report.surfaces.push({ label: `${label} (layout)`, ...mobileCards });
      }
      if (page.key === "kyb-queue" || page.key === "coffees") {
        const layout = await client.evaluate(`(() => { const t = document.querySelector("main table"); const list = document.querySelector("main table + ul, main ul"); return { tableDisplay: t ? getComputedStyle(t).display : "none", listDisplay: list ? getComputedStyle(list).display : "none" }; })()`);
        if (a.width < 1024) assert(layout.tableDisplay === "none", `${label} shows the desktop table at ${a.width}`, layout);
        else assert(layout.tableDisplay === "table", `${label} does not show the desktop table at ${a.width}`, layout);
        report.surfaces.push({ label: `${label} (responsive)`, ...layout });
      }
      report.surfaces.push({ label, url: surface.url, states: surface.states, violations: surface.violations.length });
    }
  }

  // ── Keyboard: Tab reaches an "Open" link with a visible ring on the KYB queue and on the roles list. ──
  await setAppearance(scenarios[0]);
  for (const [name, path, pattern] of [
    ["kyb", "/dashboard-admin/kyb/?view=all", "^\\/dashboard-admin\\/kyb\\/[0-9a-f-]{36}\\/?$"],
    ["roles", "/dashboard-admin/roles/", "^\\/dashboard-admin\\/roles\\/[0-9a-f-]{36}\\/?$"],
  ]) {
    await goto(client, `${baseUrl}${path}`);
    await client.evaluate(`document.body.focus()`);
    let focus = null;
    for (let step = 0; step < 120 && !focus; step += 1) {
      await key("Tab");
      focus = await client.evaluate(`(() => { const el = document.activeElement; const href = el?.getAttribute?.("href") ?? ""; if (!el || el.tagName !== "A" || !new RegExp(${JSON.stringify(pattern)}).test(href)) return null; const cs = getComputedStyle(el); return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow }; })()`);
    }
    assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), `Keyboard focus never reached a ${name} row link with a visible ring`, focus);
    report.keyboard[name] = focus;
  }

  // ── Mobile drawer at 390: open → focus lands inside the dialog → Escape closes → focus returns to the trigger. ──
  await setAppearance(scenarios[4]);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await waitFor(/نظرة عامة على العمليات/, scenarios[4]);
  const trigger = await boxOf('button[aria-label="فتح القائمة"]');
  assert(trigger, "Mobile menu trigger not rendered at 390", {});
  await click(trigger);
  await pause(500);
  const opened = await client.evaluate(`(() => { const d = document.querySelector('[role="dialog"]'); const active = document.activeElement; return { open: Boolean(d), focusInside: Boolean(d && d.contains(active)), links: d ? d.querySelectorAll('nav a[href^="/dashboard-admin"]').length : 0, closeButton: Boolean(d && d.querySelector('button[aria-label="إغلاق القائمة"]')), expanded: document.querySelector('button[aria-label="فتح القائمة"]')?.getAttribute("aria-expanded") }; })()`);
  assert(opened.open && opened.focusInside && opened.links > 5 && opened.closeButton, "Mobile drawer did not open with focus inside and navigation links", opened);
  await key("Escape");
  await pause(500);
  const closed = await client.evaluate(`(() => ({ open: Boolean(document.querySelector('[role="dialog"]')), focusOnTrigger: document.activeElement?.getAttribute("aria-label") === "فتح القائمة" }))()`);
  assert(!closed.open && closed.focusOnTrigger, "Escape did not close the drawer and restore focus to the trigger", closed);
  report.drawer = { ...opened, escapeClosed: !closed.open, focusRestored: closed.focusOnTrigger };

  // ── Validation (catalogue create): empty name → aria-invalid + aria-describedby → role="alert" on the exact field; no navigation. ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/coffees/new/`);
  await waitFor(/New coffee/, scenarios[0]);
  await setValue('[data-record-form="coffee"] input[name="name"]', "");
  await click(await boxOf('[data-record-form="coffee"] button[type="submit"]'));
  let catalogueValidation = null;
  for (let i = 0; i < 40 && !catalogueValidation?.alertText; i += 1) {
    await pause(250);
    catalogueValidation = await client.evaluate(`(() => { const form = document.querySelector('[data-record-form="coffee"]'); const input = form?.querySelector('input[name="name"]'); const describedBy = input?.getAttribute("aria-describedby") ?? ""; const alert = describedBy.split(/\\s+/).map((id) => document.getElementById(id)).find((el) => el && el.getAttribute("role") === "alert"); const label = input ? form.querySelector('label[for="' + input.id + '"]') : null; return { path: location.pathname, invalid: input?.getAttribute("aria-invalid"), describedBy, alertText: alert?.textContent ?? null, labelled: Boolean(label && label.textContent.trim()) }; })()`);
  }
  assert(catalogueValidation?.invalid === "true" && catalogueValidation.alertText && /at least 2 characters/.test(catalogueValidation.alertText) && catalogueValidation.labelled && /\/coffees\/new\/?$/.test(catalogueValidation.path), "Coffee name validation is not associated with the exact field", catalogueValidation);
  report.validation.catalogue = catalogueValidation;

  // ── Validation + dialog (compliance decision): missing reason → exact-field alert; with a reason → alertdialog; Escape cancels (no write). ──
  await goto(client, `${baseUrl}/dashboard-admin/listings/${FIXTURES.offerPendingReview}/`);
  await waitFor(/Record a decision/, scenarios[0]);
  await click(await boxOf('[data-decision-option="REJECTED"]'));
  await pause(200);
  await click(await boxOf('[data-decision-form="decision"] button[type="submit"]'));
  await pause(400);
  const decisionValidation = await client.evaluate(`(() => { const form = document.querySelector('[data-decision-form="decision"]'); const textarea = form.querySelector("textarea"); const describedBy = textarea?.getAttribute("aria-describedby") ?? ""; const alert = describedBy.split(/\\s+/).map((id) => document.getElementById(id)).find((el) => el && el.getAttribute("role") === "alert"); return { invalid: textarea?.getAttribute("aria-invalid"), alertText: alert?.textContent ?? null, dialogOpen: Boolean(document.querySelector('[role="alertdialog"]')) }; })()`);
  assert(decisionValidation.invalid === "true" && decisionValidation.alertText && /reason is required/i.test(decisionValidation.alertText) && !decisionValidation.dialogOpen, "Missing-reason error is not associated with the reason field", decisionValidation);
  report.validation.compliance = decisionValidation;
  await setValue('[data-decision-form="decision"] textarea', "RUN H browser proof — confirmation only, cancelled.");
  await pause(100);
  await click(await boxOf('[data-decision-form="decision"] button[type="submit"]'));
  await pause(500);
  const dialog = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); const active = document.activeElement; return { open: Boolean(d), text: d?.textContent ?? "", focusInside: Boolean(d && d.contains(active)), labelled: Boolean(d && (d.getAttribute("aria-labelledby") || d.getAttribute("aria-label"))) }; })()`);
  assert(dialog.open && /Record this decision\?/.test(dialog.text) && dialog.focusInside && dialog.labelled, "Decision confirmation dialog is not keyboard-accessible", dialog);
  const dialogAxe = await client.evaluate(`(async () => { const r = await axe.run(document, { resultTypes: ["violations"] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact })); })()`);
  assert(dialogAxe.length === 0, "axe violations with the dialog open", dialogAxe);
  await key("Escape");
  await pause(400);
  const afterEscape = await client.evaluate(`(() => ({ open: Boolean(document.querySelector('[role="alertdialog"]')), status: document.querySelector('[data-slot="listing-status-badge"]')?.dataset.status ?? null }))()`);
  assert(!afterEscape.open && afterEscape.status === "PENDING_REVIEW", "Escape did not cancel the decision without a write", afterEscape);
  report.dialog = { opened: true, focusInside: dialog.focusInside, labelled: dialog.labelled, axeViolations: dialogAxe.length, escapeCancelled: !afterEscape.open, status: afterEscape.status };

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-010-RUNH-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  seed("--reset-listing-review-fixtures");
  const fixtures = {};
  for (const [name, cleanupFlag, inspectFlag] of [
    ["superAdmin", "--cleanup-super-admin-fixture", "--inspect-super-admin-fixture"],
    ["catalogueAdmin", "--cleanup-catalogue-admin-fixture", "--inspect-catalogue-admin-fixture"],
  ]) {
    seed(cleanupFlag);
    fixtures[name] = seedJson(inspectFlag);
    assert(fixtures[name].activeCapability === false, `${name} fixture still privileged after cleanup`, fixtures[name]);
  }
  report.fixtures = fixtures;
  console.log("FEATURE-010-RUNH-FIXTURE-CLEANUP", JSON.stringify(fixtures));
}
