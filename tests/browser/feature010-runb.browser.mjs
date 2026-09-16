// Feature 010 RUN B (Phases 3–4) — real Chrome + axe proof over the Compliance console: KYB queue
// and detail, organizations (gap state for a pure COMPLIANCE role), listing queue and detail, the
// decision form's inline validation, direct-URL refusal for the wrong role, keyboard reach and the
// mobile viewport. Uses the human-authorized disposable COMPLIANCE fixture (prepared/cleaned through
// the approved seed-script boundary) and the standing WAREHOUSE fixture. No mocked data.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const FIXTURES = {
  compliance: "compliance-reviewer+t010-test@example.com",
  warehouse: "warehouse-admin+foundation-test@example.com",
  applicationApproved: "f0000000-0000-4000-8000-000000000012",
  offerPendingReview: "06000000-0000-4000-8000-00000000000d",
};

function runFixtureScript(args) {
  loadEnv();
  return execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/seed-test-fixtures.ts", ...args], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
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

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

runFixtureScript(["--prepare-compliance-fixture"]);
runFixtureScript(["--reset-listing-review-fixtures"]);

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

const pages = [
  { key: "kyb-queue", path: "/dashboard-admin/kyb/?view=all", expectEn: /KYB review/, expectAr: /مراجعة التحقق/ },
  { key: "kyb-detail", path: `/dashboard-admin/kyb/${FIXTURES.applicationApproved}/`, expectEn: /Documents/, expectAr: /المستندات/ },
  { key: "organizations", path: "/dashboard-admin/organizations/", expectEn: /not readable by your role/, expectAr: /غير قابلة للقراءة لدورك/ },
  { key: "listing-queue", path: "/dashboard-admin/listings/", expectEn: /Listing review/, expectAr: /مراجعة القوائم/ },
  { key: "listing-detail", path: `/dashboard-admin/listings/${FIXTURES.offerPendingReview}/`, expectEn: /Record a decision/, expectAr: /تسجيل قرار/ },
];

const report = { surfaces: [], forbidden: null, validation: null, keyboard: null };
const browser = await launchBrowser("about:blank");
const { client } = browser;

async function setAppearance(appearance) {
  await viewport(client, appearance.width, appearance.height);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)}); })()`);
}

async function setSession(session) {
  await client.send("Network.clearBrowserCookies");
  if (session) await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(session), path: "/", sameSite: "Lax" });
}

async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    return {
      url: location.pathname,
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      language: root.lang,
      direction: root.dir,
      dark: root.classList.contains("dark"),
      mains: document.querySelectorAll("main").length,
      hasHeading: Boolean(document.querySelector("h1")),
      body: document.body.innerText,
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── WAREHOUSE by direct URL into the KYB queue: forbidden, names the required role, leaks nothing. ──
  const warehouseSession = await signIn(FIXTURES.warehouse);
  await setSession(warehouseSession);
  // localStorage is origin-bound: land on the app origin once before setting theme/locale.
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/kyb/`);
  {
    const body = await client.evaluate(`document.body.innerText`);
    assert(/Not permitted for your role/.test(body) && /Required role: Compliance/.test(body), "WAREHOUSE was not refused from the KYB queue", {});
    assert(!/KYB applications submitted|f0000000-0000-4000-8000-0000000000/.test(body), "WAREHOUSE saw queue content", {});
    report.forbidden = { path: "/dashboard-admin/kyb/", refused: true };
  }

  // ── COMPLIANCE: every surface across the appearance matrix. ──
  const complianceSession = await signIn(FIXTURES.compliance);
  await setSession(complianceSession);
  for (const appearance of scenarios) {
    for (const page of pages) {
      await setAppearance(appearance);
      await goto(client, `${baseUrl}${page.path}`);
      const surface = await evaluateSurface();
      const label = `${appearance.label} ${page.key}`;
      assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth });
      assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
      assert(surface.mains === 1, `${label} must have exactly one <main>`, { mains: surface.mains });
      assert(surface.hasHeading, `${label} has no h1`, {});
      assert(surface.language === appearance.locale && surface.direction === appearance.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
      assert(surface.dark === (appearance.theme === "dark"), `${label} wrong theme`, {});
      const expected = appearance.locale === "ar" ? page.expectAr : page.expectEn;
      assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected) });
      // No status conveyed by colour alone: every status badge carries text.
      const badgesWithoutText = await client.evaluate(`[...document.querySelectorAll('[data-slot="admin-status-badge"],[data-slot="listing-status-badge"]')].filter((el) => !(el.textContent ?? "").trim()).length`);
      assert(badgesWithoutText === 0, `${label} has a text-less status badge`, {});
      // Never a raw database/provider error string.
      assert(!/PGRST|permission denied|violates|SQLSTATE|supabase/i.test(surface.body), `${label} leaked a raw error`, {});
      report.surfaces.push({ label, url: surface.url, violations: surface.violations.length });
    }
  }

  // ── Decision form: inline validation on the exact field, confirmation for a high-impact decision. ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/listings/${FIXTURES.offerPendingReview}/`);
  {
    const rejectBox = await client.evaluate(`(() => { const el = document.querySelector('[data-decision-option="REJECTED"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
    assert(rejectBox, "REJECTED option not rendered", {});
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rejectBox.x, y: rejectBox.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rejectBox.x, y: rejectBox.y, button: "left", clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const submitBox = await client.evaluate(`(() => { const el = document.querySelector('[data-decision-form="decision"] button[type="submit"]'); if (!el || el.disabled) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert(submitBox, "Submit button not enabled after choosing a decision", {});
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: submitBox.x, y: submitBox.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: submitBox.x, y: submitBox.y, button: "left", clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const validation = await client.evaluate(`(() => {
      const error = document.querySelector('[data-decision-form="decision"] [role="alert"]');
      const textarea = document.querySelector('[data-decision-form="decision"] textarea');
      const dialog = document.querySelector('[role="alertdialog"]');
      return { errorText: error?.textContent ?? null, ariaInvalid: textarea?.getAttribute("aria-invalid"), describedBy: textarea?.getAttribute("aria-describedby"), dialogOpen: Boolean(dialog) };
    })()`);
    assert(validation.errorText && /reason is required/i.test(validation.errorText), "Missing-reason inline error not shown on the reason field", validation);
    assert(validation.ariaInvalid === "true", "Reason field not marked aria-invalid", validation);
    assert(!validation.dialogOpen, "Confirmation dialog opened despite a validation error", validation);
    // With a reason typed, the high-impact decision asks for confirmation (and we CANCEL — no write).
    await client.evaluate(`(() => { const t = document.querySelector('[data-decision-form="decision"] textarea'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; setter.call(t, "Browser proof — confirmation only, cancelled."); t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: submitBox.x, y: submitBox.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: submitBox.x, y: submitBox.y, button: "left", clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const confirm = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "" }; })()`);
    assert(confirm.open && /Record this decision\?/.test(confirm.text), "Confirmation dialog did not open for a high-impact decision", confirm);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const stillPending = await client.evaluate(`document.querySelector('[data-slot="listing-status-badge"]')?.dataset.status`);
    assert(stillPending === "PENDING_REVIEW", "Cancelling the confirmation still changed the listing", { stillPending });
    report.validation = { inlineError: validation.errorText, confirmOpened: true, cancelledNoWrite: true };
  }

  // ── Keyboard: Tab reaches the queue's first "Open" link with a visible focus ring. ──
  await goto(client, `${baseUrl}/dashboard-admin/kyb/?view=all`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 80 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => {
      const el = document.activeElement;
      const href = el?.getAttribute?.("href") ?? "";
      if (!el || el.tagName !== "A" || !/^\\/dashboard-admin\\/kyb\\/[0-9a-f-]{36}\\/?$/.test(href)) return null;
      const cs = getComputedStyle(el);
      return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached an application link with a visible ring", focus);
  report.keyboard = focus;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-010-RUNB-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  const cleanup = runFixtureScript(["--cleanup-compliance-fixture"]);
  console.log("COMPLIANCE-FIXTURE-CLEANUP", cleanup.trim().split(/\r?\n/).find((line) => line.startsWith("{")) ?? cleanup);
}
