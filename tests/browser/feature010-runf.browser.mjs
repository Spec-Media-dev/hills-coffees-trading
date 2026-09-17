// Feature 010 RUN F (Phase 9) — real Chrome + axe proof over the SUPER_ADMIN system configuration:
// platform admins (list + grant page), commission (semantics + in-force + a policy CREATED through the
// UI with two bands → the 100–250 coverage gap warning + COMMISSION-OPEN-01), tax rules, shipping
// rules (unconsumed notice), payment accounts (super admin AND the read-only ADMIN view with the
// OPS-01 / high-risk notices), across EN/AR × light/dark × 390/1366/1920; direct-URL refusal for the
// disposable ADMIN on every super-admin route; inline validation on the tier form (max ≤ min);
// the activation confirmation cancelled (no write); keyboard focus ring; no raw error; one <main>.
//
// Fixtures: the human-authorized disposable SUPER_ADMIN (H1) and ADMIN are prepared by the seed
// script at the start and de-privileged in `finally`; every configuration row the proof creates is
// removed by `--cleanup-run-f-config-rows` (policies dated 2099 — never selectable by checkout).
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
const FIXTURES = { superAdmin: "super-admin+t027-test@example.com", admin: "catalogue-admin+t021-test@example.com" };

function seed(...args) {
  return execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/seed-test-fixtures.ts"), ...args], { env: process.env, stdio: ["ignore", "pipe", "inherit"] }).toString();
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
const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const scenarios = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-dark-1366" },
  { theme: "light", locale: "ar", dir: "rtl", width: 1366, height: 900, label: "ar-light-1366" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-dark-390" },
  { theme: "light", locale: "en", dir: "ltr", width: 1920, height: 1080, label: "en-light-1920" },
];
const report = { surfaces: [], forbidden: null, policy: null, validation: null, confirmation: null, adminReadOnly: null, keyboard: null, fixtures: null };

seed("--prepare-super-admin-fixture");
seed("--prepare-catalogue-admin-fixture");
seed("--cleanup-run-f-config-rows");

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
    return { url: location.pathname + location.search, width: root.clientWidth, scrollWidth: root.scrollWidth, language: root.lang, direction: root.dir, dark: root.classList.contains("dark"), mains: document.querySelectorAll("main").length, hasHeading: Boolean(document.querySelector("h1")), body: document.body.innerText, violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })) };
  })()`);
}
const click = async (box) => {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
};
const boxOf = async (selector) => client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const setValue = async (selector, value) =>
  client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
async function waitFor(expected, a) {
  let surface = await evaluateSurface();
  for (let i = 0; i < 24 && !(expected.test(surface.body) && surface.language === a.locale && surface.direction === a.dir); i += 1) {
    await pause(250);
    surface = await evaluateSurface();
  }
  return surface;
}
async function waitForPath(pattern, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const path = await client.evaluate("location.pathname");
    if (pattern.test(path)) return path;
    await pause(250);
  }
  return client.evaluate("location.pathname");
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── Disposable ADMIN by direct URL into every super-admin route: forbidden; payment accounts: read-only statement. ──
  const adminSession = await signIn(FIXTURES.admin);
  await setSession(adminSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  {
    const refused = [];
    for (const path of ["/dashboard-admin/roles/", "/dashboard-admin/roles/new/", "/dashboard-admin/commission/", "/dashboard-admin/commission/new/", "/dashboard-admin/tax/", "/dashboard-admin/shipping/", "/dashboard-admin/payment-accounts/new/"]) {
      await goto(client, `${baseUrl}${path}`);
      const body = await client.evaluate(`document.body.innerText`);
      assert(/Not permitted for your role/.test(body) && /Required role: Super admin/.test(body), `ADMIN was not refused from ${path}`, { body: body.slice(0, 300) });
      assert(!/How checkout applies|Grant a role|New tax rule|Account name/.test(body), `ADMIN saw super-admin content on ${path}`, {});
      refused.push(path);
    }
    await goto(client, `${baseUrl}/dashboard-admin/payment-accounts/`);
    await waitFor(/Payment accounts/, scenarios[0]);
    const readOnly = await client.evaluate(`({ readOnly: Boolean(document.querySelector("[data-payment-accounts-read-only]")), ops01: Boolean(document.querySelector('[data-system-notice="ops-01"]')), highRisk: Boolean(document.querySelector('[data-system-notice="high-risk"]')), newLink: Boolean(document.querySelector('a[href="/dashboard-admin/payment-accounts/new/"], a[href="/dashboard-admin/payment-accounts/new"]')), forms: document.querySelectorAll("main form").length })`);
    assert(readOnly.readOnly && readOnly.ops01 && readOnly.highRisk && !readOnly.newLink && readOnly.forms === 0, "ADMIN payment-accounts view is not read-only with the OPS-01/high-risk notices", readOnly);
    report.forbidden = { paths: refused, refused: true };
    report.adminReadOnly = readOnly;
  }

  // ── SUPER_ADMIN: create a 2099 policy through the UI, add two bands, see the coverage gap. ──
  const superSession = await signIn(FIXTURES.superAdmin);
  await setSession(superSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/commission/new/`);
  await waitFor(/New commission policy/, scenarios[0]);
  await setValue('[data-record-form="commission-policy"] input[name="name"]', "RUN F browser policy");
  await setValue('[data-record-form="commission-policy"] input[name="effectiveFrom"]', "2099-01-01T00:00");
  await click(await boxOf('[data-record-form="commission-policy"] button[type="submit"]'));
  const policyPath = await waitForPath(/^\/dashboard-admin\/commission\/[0-9a-f-]{36}\/?$/);
  assert(/^\/dashboard-admin\/commission\/[0-9a-f-]{36}\/?$/.test(policyPath), "Creating a policy did not navigate to its detail page", { policyPath });
  const policyUrl = `${baseUrl}${policyPath.replace(/\/?$/, "/")}`;
  const addTier = async (min, max, percentage) => {
    await goto(client, policyUrl);
    await waitFor(/Quantity bands/, scenarios[0]);
    await setValue('[data-record-form="tier-new"] input[name="minQuantityKg"]', min);
    await setValue('[data-record-form="tier-new"] input[name="maxQuantityKg"]', max);
    await setValue('[data-record-form="tier-new"] input[name="percentage"]', percentage);
    await click(await boxOf('[data-record-form="tier-new"] button[type="submit"]'));
    for (let i = 0; i < 40; i += 1) {
      await pause(250);
      const text = await client.evaluate("document.body.innerText");
      if (/Saved\. This applies to eligible future checkouts only/.test(text)) return;
    }
    assert(false, "Tier save did not report success", { min, max, percentage });
  };
  await addTier("0", "100", "5");
  await addTier("250", "", "3");
  await goto(client, policyUrl);
  await waitFor(/Band coverage/, scenarios[0]);
  const coverage = await client.evaluate(`({ state: document.querySelector("[data-coverage]")?.getAttribute("data-coverage") ?? null, gap: Boolean(document.querySelector('[data-coverage-gap="100-250"]')), openItem: Boolean(document.querySelector('[data-open-item="commission-open-01"]')), futureOnly: Boolean(document.querySelector('[data-system-notice="future-only"]')), tiers: Number(document.querySelector("[data-policy-tiers]")?.getAttribute("data-policy-tiers") ?? 0) })`);
  assert(coverage.state === "gaps" && coverage.gap && coverage.openItem && coverage.futureOnly && coverage.tiers === 2, "Coverage gap 100–250 / COMMISSION-OPEN-01 / future-only not shown", coverage);
  report.policy = { path: policyPath, ...coverage };

  // ── Inline validation: a band with max ≤ min is refused on the exact field, no write. ──
  await setValue('[data-record-form="tier-new"] input[name="minQuantityKg"]', "300");
  await setValue('[data-record-form="tier-new"] input[name="maxQuantityKg"]', "300");
  await setValue('[data-record-form="tier-new"] input[name="percentage"]', "1");
  await click(await boxOf('[data-record-form="tier-new"] button[type="submit"]'));
  let validation = null;
  for (let i = 0; i < 40 && !validation?.error; i += 1) {
    await pause(250);
    validation = await client.evaluate(`(() => { const form = document.querySelector('[data-record-form="tier-new"]'); const max = form.querySelector('input[name="maxQuantityKg"]'); const alert = form.querySelector('[role="alert"]'); return { error: alert?.textContent ?? null, invalid: max?.getAttribute("aria-invalid"), tiers: Number(document.querySelector("[data-policy-tiers]")?.getAttribute("data-policy-tiers") ?? 0) }; })()`);
  }
  assert(validation?.error && /greater than the minimum/.test(validation.error) && validation.invalid === "true" && validation.tiers === 2, "max ≤ min was not refused inline on the maximum field", validation);
  report.validation = validation;

  // ── Confirmation: Activate opens the dialog (future-only text), Escape cancels — status stays Draft. ──
  await click(await boxOf('[data-decision-form="policy-status"] [data-decision-option="activate"]'));
  await pause(200);
  await click(await boxOf('[data-decision-form="policy-status"] button[type="submit"]'));
  await pause(400);
  const confirm = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "" }; })()`);
  assert(confirm.open && /Apply this status change\?/.test(confirm.text) && /future checkouts only/.test(confirm.text), "Activation confirmation did not open with the future-only statement", confirm);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await pause(400);
  await goto(client, policyUrl);
  await waitFor(/Quantity bands/, scenarios[0]);
  const status = await client.evaluate(`document.querySelector('[data-slot="admin-status-badge"]')?.getAttribute("data-status") ?? null`);
  assert(status === "DRAFT", "Cancelling the confirmation still changed the policy status", { status });
  report.confirmation = { operation: "activate", confirmOpened: true, cancelledNoWrite: true, status };

  // ── Surfaces × appearances ──
  const pages = [
    { key: "roles", path: "/dashboard-admin/roles/", expectEn: /Platform admins/, expectAr: /مشرفو المنصة/ },
    { key: "roles-new", path: "/dashboard-admin/roles/new/", expectEn: /Grant a role/, expectAr: /منح دور/ },
    { key: "commission", path: "/dashboard-admin/commission/", expectEn: /How checkout applies these settings/, expectAr: /كيف تطبّق عملية الدفع/ },
    { key: "commission-detail", path: policyPath.replace(/\/?$/, "/"), expectEn: /Band coverage/, expectAr: /تغطية الشرائح/ },
    { key: "tax", path: "/dashboard-admin/tax/", expectEn: /Tax rules/, expectAr: /القواعد الضريبية/ },
    { key: "tax-new", path: "/dashboard-admin/tax/new/", expectEn: /New tax rule/, expectAr: /قاعدة ضريبية جديدة/ },
    { key: "shipping", path: "/dashboard-admin/shipping/", expectEn: /Not applied by any checkout or shipment path yet/, expectAr: /لا يطبّقها أي مسار دفع أو شحن بعد/ },
    { key: "payment-accounts", path: "/dashboard-admin/payment-accounts/", expectEn: /No dual control \(OPS-01\)/, expectAr: /لا رقابة مزدوجة \(OPS-01\)/ },
    { key: "payment-accounts-new", path: "/dashboard-admin/payment-accounts/new/", expectEn: /High-risk action/, expectAr: /إجراء عالي الخطورة/ },
  ];
  for (const a of scenarios) {
    for (const page of pages) {
      await setAppearance(a);
      await goto(client, `${baseUrl}${page.path}`);
      const label = `${a.label} ${page.key}`;
      const expected = a.locale === "ar" ? page.expectAr : page.expectEn;
      const surface = await waitFor(expected, a);
      assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth });
      assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
      assert(surface.mains === 1, `${label} must have exactly one <main>`, { mains: surface.mains });
      assert(surface.hasHeading, `${label} has no h1`, {});
      assert(surface.language === a.locale && surface.direction === a.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
      assert(surface.dark === (a.theme === "dark"), `${label} wrong theme`, {});
      assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected) });
      assert(!/PGRST|permission denied|violates|SQLSTATE|supabase|row-level security|23505|23514|42501/i.test(surface.body), `${label} leaked a raw error`, {});
      const badgesWithoutText = await client.evaluate(`[...document.querySelectorAll('[data-slot="admin-status-badge"]')].filter((el) => !(el.textContent ?? "").trim()).length`);
      assert(badgesWithoutText === 0, `${label} has a text-less status badge`, {});
      if (page.key === "commission") {
        const semantics = await client.evaluate(`document.querySelectorAll("[data-semantic]").length`);
        assert(semantics === 6, `${label} does not state all six commission semantics`, { semantics });
      }
      report.surfaces.push({ label, url: surface.url, violations: surface.violations.length });
    }
  }

  // ── Keyboard: Tab reaches a policy row's Open link with a visible focus ring. ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/commission/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 120 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => { const el = document.activeElement; const href = el?.getAttribute?.("href") ?? ""; if (!el || el.tagName !== "A" || !/^\\/dashboard-admin\\/commission\\/[0-9a-f-]{36}\\/?$/.test(href)) return null; const cs = getComputedStyle(el); return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow }; })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached a policy link with a visible ring", focus);
  report.keyboard = focus;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-010-RUNF-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  seed("--cleanup-run-f-config-rows");
  const fixtures = {};
  for (const [name, cleanupFlag, inspectFlag] of [
    ["superAdmin", "--cleanup-super-admin-fixture", "--inspect-super-admin-fixture"],
    ["catalogueAdmin", "--cleanup-catalogue-admin-fixture", "--inspect-catalogue-admin-fixture"],
  ]) {
    seed(cleanupFlag);
    fixtures[name] = JSON.parse(seed(inspectFlag).trim().split(/\r?\n/).find((line) => line.startsWith("{")) ?? "{}");
    assert(fixtures[name].activeCapability === false, `${name} fixture still privileged after cleanup`, fixtures[name]);
  }
  report.fixtures = fixtures;
  console.log("FEATURE-010-RUNF-FIXTURE-CLEANUP", JSON.stringify(fixtures));
}
