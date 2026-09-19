// Feature 010 RUN J — T010 / DB-OPEN-22: real Chrome + axe over the Compliance organization status
// surface, signed in as the disposable PURE COMPLIANCE operator (possible only since migration
// `20260919130000_feature_010_db_open_22_compliance_organization_read.sql`). Matrix: EN/AR ×
// light/dark × 390/1366 over the organizations list, the `suspended` fixture organization's detail
// (ACTIVE at that point) and a not-found id. Per surface: axe clean (colour contrast on), one <main>,
// an h1, correct lang/dir/theme, no horizontal overflow, text-labelled status badges, the correct
// status, the suspension effect explained honestly (members lose capability on their NEXT request;
// the in-flight-operations policy is stated as undecided, not simulated), no raw database text.
// Then, through the real UI (EN, light, 1366): keyboard Tab reaches an organization "Open" link with a
// visible ring; Suspend with no reason → error associated with the reason field, nothing written;
// with a reason → the confirmation alertdialog; Escape cancels (database snapshot unchanged);
// confirming suspends (database: SUSPENDED, reason in `kyb_reviews`, one new `account_status_history`
// row); Reinstate with a reason → ACTIVE again. No console/page/request errors.
// Fixtures: the `suspended` organization is set ACTIVE for the run and reset to its canonical state
// in `finally`; the COMPLIANCE operator is prepared here and de-privileged in `finally`.
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

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3231";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const ORG = "f0000000-0000-4000-8000-000000000064";
const NIL = "00000000-0000-4000-8000-000000000000";
const SUSPEND_REASON = "Browser proof: trade licence expired.";
const REINSTATE_REASON = "Browser proof: renewed licence verified.";

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
const RAW_ERROR = /PGRST|permission denied|violates|SQLSTATE|row-level security|42501|P0001|_read_failed|organization_compliance_|TypeError|undefined is not/i;

const APPEARANCES = [];
for (const locale of ["en", "ar"]) for (const theme of ["light", "dark"]) for (const width of [390, 1366]) APPEARANCES.push({ locale, theme, width, height: width === 390 ? 844 : 900, dir: locale === "ar" ? "rtl" : "ltr", label: `${locale}-${theme}-${width}` });
const report = { matrix: [], keyboard: null, validation: null, cancel: null, suspended: null, reinstated: null, fixtures: null };

seed("--prepare-compliance-fixture");
seed("--reset-suspended-fixture");
seed("--set-suspended-organization-status=ACTIVE");
const start = seedJson("--inspect-suspended-organization");
assert(start.organization.status === "ACTIVE" && start.organizationCanBuy === true, "Fixture organization is not ACTIVE for the run", start.organization);
const compliance = await signIn("compliance-reviewer+t010-test@example.com");

const browser = await launchBrowser("about:blank");
const { client } = browser;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForExpr(expression, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await client.evaluate(expression)) return true;
    await pause(150);
  }
  return false;
}
async function visit(url) {
  await pause(900);
  await client.evaluate(`window.__t010Stale = true`).catch(() => undefined);
  await goto(client, url);
  assert(await waitForExpr(`!window.__t010Stale && document.readyState === "complete"`, 200), `Navigation to ${url} never produced a fresh document`, {});
  await pause(250);
}
async function setAppearance(a) {
  await viewport(client, a.width, a.height);
  await visit(`${baseUrl}/robots.txt`);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(a.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(a.locale)}); })()`);
}
async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll("main *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > root.clientWidth + 1 || r.left < -1); }).slice(0, 5).map((el) => el.tagName + (typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 3).join(".") : ""));
    return {
      url: location.pathname, width: root.clientWidth, scrollWidth: root.scrollWidth, language: root.lang, direction: root.dir, dark: root.classList.contains("dark"),
      mains: document.querySelectorAll("main").length, heading: (document.querySelector("h1")?.innerText ?? "").trim(), body: document.body.innerText, overflowing,
      states: [...document.querySelectorAll("[data-admin-state]")].map((el) => el.getAttribute("data-admin-state")),
      badgesWithoutText: [...document.querySelectorAll('[data-slot="admin-status-badge"]')].filter((el) => !(el.innerText ?? "").trim()).length,
      headerStatus: document.querySelector('main [data-slot="admin-status-badge"]')?.dataset.status ?? null,
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}
async function settle(expected, a) {
  let surface = await evaluateSurface();
  for (let i = 0; i < 32 && !(expected.test(surface.body) && surface.language === a.locale && surface.direction === a.dir); i += 1) {
    await pause(250);
    surface = await evaluateSurface();
  }
  return surface;
}
function checkSurface(label, surface, a, expected) {
  assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected), body: surface.body.slice(0, 500) });
  assert(surface.scrollWidth <= surface.width + 1 && surface.overflowing.length === 0, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth, overflowing: surface.overflowing });
  assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
  assert(surface.mains === 1 && surface.heading.length > 0, `${label} landmark/heading structure`, { mains: surface.mains, heading: surface.heading });
  assert(surface.language === a.locale && surface.direction === a.dir && surface.dark === (a.theme === "dark"), `${label} wrong lang/dir/theme`, {});
  assert(!RAW_ERROR.test(surface.body), `${label} leaked raw database text`, {});
  assert(surface.badgesWithoutText === 0, `${label} has a text-less status badge`, {});
  assert(!surface.states.includes("capability-gap"), `${label} still renders the DB-OPEN-22 capability gap`, surface.states);
}
const click = async (box) => {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
};
const boxOf = async (selector) => client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const setReason = async (value) =>
  client.evaluate(`(() => { const el = document.querySelector('[data-decision-form="status"] textarea'); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const key = async (k, code = k) => {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};
const dbState = () => {
  const snap = seedJson("--inspect-suspended-organization");
  return { status: snap.organization.status, canBuy: snap.organizationCanBuy, history: snap.accountStatusHistory.length, reviews: snap.kybReviews, lastHistory: snap.accountStatusHistory.at(-1) };
};

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });
  await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(compliance), path: "/", sameSite: "Lax" });

  const pages = [
    { key: "organizations", path: "/dashboard-admin/organizations/", en: /Foundation Test — Suspended/, ar: /Foundation Test — Suspended/ },
    { key: "organization-detail", path: `/dashboard-admin/organizations/${ORG}/`, en: /Suspend organization[\s\S]*next request/, ar: /إيقاف المنظمة/, detail: true },
    { key: "not-found", path: `/dashboard-admin/organizations/${NIL}/`, en: /Not found/, ar: /غير موجود/, state: "not-found" },
  ];
  for (const a of APPEARANCES) {
    await setAppearance(a);
    for (const page of pages) {
      await visit(`${baseUrl}${page.path}`);
      const label = `${a.label} ${page.key}`;
      const expected = a.locale === "ar" ? page.ar : page.en;
      const surface = await settle(expected, a);
      checkSurface(label, surface, a, expected);
      if (page.state) assert(surface.states.includes(page.state), `${label} does not render ${page.state}`, surface.states);
      if (page.detail) {
        assert(surface.headerStatus === "ACTIVE", `${label} shows the wrong status`, { headerStatus: surface.headerStatus });
        if (a.locale === "en") assert(/lose trading capability on their next request/.test(surface.body) && /not decided by this console/.test(surface.body), `${label} does not explain the suspension effect honestly`, {});
      }
      report.matrix.push({ label, url: surface.url, states: surface.states, violations: surface.violations.length });
    }
  }

  // ── Keyboard: Tab reaches an organization "Open" link with a visible focus ring. ──
  await setAppearance(APPEARANCES[1]);
  await visit(`${baseUrl}/dashboard-admin/organizations/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 150 && !focus; step += 1) {
    await key("Tab");
    focus = await client.evaluate(`(() => { const el = document.activeElement; const href = el?.getAttribute?.("href") ?? ""; if (!el || el.tagName !== "A" || !/^\\/dashboard-admin\\/organizations\\/[0-9a-f-]{36}\\/?$/.test(href)) return null; const cs = getComputedStyle(el); return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow }; })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached an organization link with a visible ring", focus);
  report.keyboard = focus;

  // ── Real UI: suspend (validation → dialog → Escape → confirm), then reinstate. ──
  const detailUrl = `${baseUrl}/dashboard-admin/organizations/${ORG}/`;
  await visit(detailUrl);
  await settle(/Suspend organization/, APPEARANCES[1]);
  await click(await boxOf('[data-decision-option="SUSPENDED"]'));
  await pause(200);
  await click(await boxOf('[data-decision-form="status"] button[type="submit"]'));
  await pause(400);
  const validation = await client.evaluate(`(() => { const form = document.querySelector('[data-decision-form="status"]'); const textarea = form.querySelector("textarea"); const describedBy = textarea?.getAttribute("aria-describedby") ?? ""; const alert = describedBy.split(/\\s+/).map((id) => document.getElementById(id)).find((el) => el && el.getAttribute("role") === "alert"); return { invalid: textarea?.getAttribute("aria-invalid"), alertText: alert?.textContent ?? null, dialogOpen: Boolean(document.querySelector('[role="alertdialog"]')) }; })()`);
  assert(validation.invalid === "true" && /reason is required/i.test(validation.alertText ?? "") && !validation.dialogOpen, "Missing reason is not associated with the reason field", validation);
  assert(dbState().status === "ACTIVE", "A missing-reason attempt wrote something", {});
  report.validation = validation;

  await setReason(SUSPEND_REASON);
  await pause(100);
  await click(await boxOf('[data-decision-form="status"] button[type="submit"]'));
  await pause(500);
  const dialog = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "", focusInside: Boolean(d && d.contains(document.activeElement)), labelled: Boolean(d && (d.getAttribute("aria-labelledby") || d.getAttribute("aria-label"))) }; })()`);
  assert(dialog.open && /Change organization status\?/.test(dialog.text) && /next request/.test(dialog.text) && dialog.focusInside && dialog.labelled, "Suspension confirmation dialog is not keyboard-accessible or does not explain the effect", dialog);
  const dialogAxe = await client.evaluate(`(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => ({ id: v.id, impact: v.impact })))()`);
  assert(dialogAxe.length === 0, "axe violations with the dialog open", dialogAxe);
  const beforeCancel = dbState();
  await key("Escape");
  await pause(600);
  const afterCancel = dbState();
  assert(!(await client.evaluate(`Boolean(document.querySelector('[role="alertdialog"]'))`)) && JSON.stringify(afterCancel) === JSON.stringify(beforeCancel) && afterCancel.status === "ACTIVE", "Escape did not cancel without a write", { beforeCancel, afterCancel });
  report.cancel = { escapeCancelled: true, status: afterCancel.status, historyUnchanged: afterCancel.history === beforeCancel.history, axeViolationsWithDialog: dialogAxe.length };

  await click(await boxOf('[data-decision-form="status"] button[type="submit"]'));
  await pause(500);
  await click(await boxOf('[role="alertdialog"] [data-slot="alert-dialog-action"], [role="alertdialog"] button:last-of-type'));
  assert(await waitForExpr(`document.querySelector('main [data-slot="admin-status-badge"]')?.dataset.status === "SUSPENDED" || Boolean(document.querySelector('[data-decision-option="ACTIVE"]'))`, 150), "The confirmed suspension did not reach the page", {});
  const suspended = dbState();
  assert(suspended.status === "SUSPENDED" && suspended.canBuy === false && suspended.history === beforeCancel.history + 1 && suspended.lastHistory.old_status === "ACTIVE" && suspended.lastHistory.new_status === "SUSPENDED" && suspended.reviews.at(-1)?.reason === SUSPEND_REASON && suspended.reviews.at(-1)?.decision === "SUSPENDED", "The suspension is not recorded as expected", suspended);
  report.suspended = { status: suspended.status, canBuy: suspended.canBuy, history: `${suspended.lastHistory.old_status}->${suspended.lastHistory.new_status}`, reviewDecision: suspended.reviews.at(-1).decision, reasonRecorded: true };

  await visit(detailUrl);
  await settle(/Reinstate organization/, APPEARANCES[1]);
  await click(await boxOf('[data-decision-option="ACTIVE"]'));
  await pause(200);
  await setReason(REINSTATE_REASON);
  await pause(100);
  await click(await boxOf('[data-decision-form="status"] button[type="submit"]'));
  await pause(500);
  await click(await boxOf('[role="alertdialog"] [data-slot="alert-dialog-action"], [role="alertdialog"] button:last-of-type'));
  assert(await waitForExpr(`document.querySelector('main [data-slot="admin-status-badge"]')?.dataset.status === "ACTIVE" || Boolean(document.querySelector('[data-decision-option="SUSPENDED"]'))`, 150), "The confirmed reinstatement did not reach the page", {});
  const reinstated = dbState();
  assert(reinstated.status === "ACTIVE" && reinstated.canBuy === true && reinstated.history === suspended.history + 1 && reinstated.lastHistory.new_status === "ACTIVE" && reinstated.reviews.at(-1)?.reason === REINSTATE_REASON && reinstated.reviews.at(-1)?.decision === "APPROVED", "The reinstatement is not recorded as expected", reinstated);
  report.reinstated = { status: reinstated.status, canBuy: reinstated.canBuy, history: `${reinstated.lastHistory.old_status}->${reinstated.lastHistory.new_status}`, reviewDecision: reinstated.reviews.at(-1).decision, reasonRecorded: true };

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-010-T010-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  seed("--reset-suspended-fixture");
  const end = seedJson("--inspect-suspended-organization");
  seed("--cleanup-compliance-fixture");
  const operator = seedJson("--inspect-compliance-fixture");
  report.fixtures = { organization: end.organization.status, application: end.application.status, othersUnchanged: end.otherOrganizationsFingerprint === start.otherOrganizationsFingerprint, operator };
  console.log("FEATURE-010-T010-FIXTURE-CLEANUP", JSON.stringify(report.fixtures));
  assert(end.organization.status === "SUSPENDED" && end.application.status === "APPROVED" && report.fixtures.othersUnchanged && operator.activeCapability === false, "Fixture cleanup incomplete", report.fixtures);
}
