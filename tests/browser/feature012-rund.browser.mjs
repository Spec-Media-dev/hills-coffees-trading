// Feature 012 RUN D (T024) — the Feature-012-wide real Chrome + axe accessibility/RTL pass.
//
// Surfaces (every Feature 012 surface that can render with live data):
//   disputes list · dispute detail (evidence area) · dispute not-found · notifications (with a row) ·
//   notifications (honest empty, another user) · notification preferences · order detail history ·
//   ownership history · dashboard navigation.
// Not renderable, and why (recorded): listing-detail history — no member-owned listing can exist live
// (Feature 006's recorded gap; covered by a render test); an audit-access limitation page — T015 ships
// the model + `AuditAccessNotice` but no member route (covered by render tests).
//
// Matrix: EN/AR × light/dark × 390/1366/1920 on every surface. Per surface: axe (colour contrast on)
// zero violations, lang/dir, theme, exactly one <main>, no horizontal overflow, correlation ids inside
// the viewport, every status badge textual, every timeline named + non-interactive, no aria-disabled
// fake control, every focusable element in <main> has an accessible name, no raw error text.
// Plus: full keyboard traversal of the dispute detail (every stop visibly focused, no trap) in EN and
// AR, and exact-field validation (aria-invalid + role=alert message) on both dispute forms, EN + AR.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3231";
const TAG = "[F012-RUN-A]";
const ORDER_A = "05000000-0000-4000-8000-00000000000b";
const ORG_A = "f0000000-0000-4000-8000-000000000001";
const ORG_B = "f0000000-0000-4000-8000-000000000002";

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

async function rest(session, method, path, body) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}`, "content-type": "application/json", prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert(response.ok, `PostgREST ${method} ${path} failed`, { status: response.status, data });
  return data;
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

runFixtureScript(["--cleanup-dispute-test-rows"]);
runFixtureScript(["--cleanup-notification-test-rows"]);
runFixtureScript(["--seed-notification-fixture"]);

const orgA = await signIn("buyer-only+foundation-test@example.com");
const orgB = await signIn("buyer-and-seller+foundation-test@example.com");
const [dispute] = await rest(orgA, "POST", "disputes", { order_id: ORDER_A, opened_by_user_id: orgA.user.id, opened_by_organization_id: ORG_A, reason: `${TAG} RUN D accessibility pass.` });
await rest(orgA, "POST", "dispute_evidence", { dispute_id: dispute.id, uploaded_by: orgA.user.id, note: "Photo of the torn bags is held by our warehouse manager." });
const [historyRow] = await rest(orgB, "GET", `order_status_history?select=order_id,orders!inner(buyer_organization_id)&orders.buyer_organization_id=eq.${ORG_B}&limit=1`);
assert(historyRow?.order_id, "Standing fixture missing: no Org B order with history", {});

const SURFACES = [
  { key: "disputes", session: orgA, path: "/dashboard/disputes/" },
  { key: "dispute-detail", session: orgA, path: `/dashboard/disputes/${dispute.id}/` },
  { key: "dispute-not-found", session: orgA, path: "/dashboard/disputes/12000000-0000-4000-8000-0000000000ff/", notFound: true },
  { key: "notifications", session: orgA, path: "/dashboard/notifications/" },
  { key: "notifications-empty", session: orgB, path: "/dashboard/notifications/", empty: true },
  { key: "preferences", session: orgA, path: "/dashboard/notifications/preferences/" },
  { key: "order-history", session: orgB, path: `/dashboard/orders/${historyRow.order_id}/`, timeline: true },
  { key: "ownership-history", session: orgA, path: "/dashboard/inventory/history/", timeline: true, correlation: true },
  { key: "dashboard-nav", session: orgA, path: "/dashboard/" },
];
const APPEARANCES = [];
for (const locale of ["en", "ar"]) for (const theme of ["light", "dark"]) for (const width of [390, 1366, 1920]) APPEARANCES.push({ locale, theme, width, height: width === 390 ? 844 : width === 1366 ? 900 : 1080 });

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const RAW_ERROR = /violates|row-level security|PGRST|42501|SQLSTATE|history_read_failed|dispute_read_failed|TypeError/i;

const report = { matrix: [], keyboard: [], validation: [] };
const browser = await launchBrowser("about:blank");
const { client } = browser;
await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

async function waitFor(expression, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await client.evaluate(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}
async function visit(url) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  await client.evaluate(`window.__f012Stale = true`).catch(() => undefined);
  await goto(client, url);
  assert(await waitFor(`!window.__f012Stale && document.readyState === "complete"`, 200), `Navigation to ${url} never produced a fresh document`, {});
  await new Promise((resolve) => setTimeout(resolve, 250));
}
async function setSessionCookie(session) {
  await client.send("Network.deleteCookies", { name: cookieName, url: baseUrl });
  if (session) await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(session), path: "/", sameSite: "Lax" });
}
async function setAppearance({ theme, locale, width, height }) {
  await viewport(client, width, height);
  await visit(`${baseUrl}/robots.txt`);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(locale)}); })()`);
}

async function surface() {
  return client.evaluate(`(async () => {
    const root = document.documentElement;
    const main = document.querySelector("main");
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const focusables = main ? [...main.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0) : [];
    const nameOf = (el) => (el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent) || (el.id && document.querySelector('label[for="' + el.id + '"]')?.textContent) || el.textContent || el.getAttribute("title") || "").trim();
    return {
      path: location.pathname, lang: root.lang, dir: root.dir, dark: root.classList.contains("dark"),
      overflow: root.scrollWidth - root.clientWidth, viewportWidth: root.clientWidth, mains: document.querySelectorAll("main").length,
      body: document.body.innerText,
      stateScreens: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")).filter((s) => s !== "loading"),
      notFound: Boolean(document.querySelector('[data-slot="dispute-not-found"]')),
      badgesWithoutText: [...document.querySelectorAll('[data-slot$="status-badge"]')].filter((el) => !(el.innerText ?? "").trim()).length,
      badges: document.querySelectorAll('[data-slot$="status-badge"]').length,
      timelines: [...document.querySelectorAll('[data-slot="history-timeline"]')].map((t) => ({ entries: t.querySelectorAll('[data-slot="history-entry"]').length, named: Boolean(document.getElementById(t.getAttribute("aria-labelledby") ?? "")?.textContent?.trim()), controls: t.querySelectorAll("button, a, input, select, textarea, form, [tabindex]").length })),
      correlationOutside: [...document.querySelectorAll('[data-slot="correlation-id"]')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > root.clientWidth + 1 || r.left < -1; }).length,
      correlationCount: document.querySelectorAll('[data-slot="correlation-id"]').length,
      // A fake-disabled control = something a keyboard user can still reach that only CLAIMS to be disabled.
      // (The shell breadcrumb's current-page item — role=link aria-disabled aria-current=page, not
      // focusable — is the standard breadcrumb pattern, not a control; it is excluded by the focusability test.)
      fakeDisabled: [...document.querySelectorAll('[aria-disabled="true"]')].filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled")).map((el) => el.outerHTML.slice(0, 160)),
      unnamedFocusables: focusables.filter((el) => !nameOf(el)).map((el) => el.outerHTML.slice(0, 120)),
      notificationItems: document.querySelectorAll('[data-slot="notification-item"]').length,
      notificationsEmpty: Boolean(document.querySelector('[data-slot="notifications-empty"]')),
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

try {
  for (const appearance of APPEARANCES) {
    let current = null;
    for (const target of SURFACES) {
      if (current !== target.session) {
        await setSessionCookie(target.session);
        current = target.session;
      }
      await setAppearance(appearance);
      await visit(`${baseUrl}${target.path}`);
      const s = await surface();
      const label = `${appearance.locale}-${appearance.theme}-${appearance.width} ${target.key}`;
      const diag = { path: s.path, stateScreens: s.stateScreens, body: s.body.slice(0, 300) };
      assert(s.stateScreens.length === 0, `${label}: unexpected state screen`, diag);
      assert(target.notFound ? s.notFound : !s.notFound, `${label}: not-found state mismatch`, diag);
      assert(s.lang === appearance.locale && s.dir === (appearance.locale === "ar" ? "rtl" : "ltr"), `${label}: wrong lang/dir`, diag);
      assert(s.dark === (appearance.theme === "dark"), `${label}: theme not applied`, diag);
      assert(s.overflow <= 1, `${label}: horizontal overflow`, { overflow: s.overflow });
      assert(s.mains === 1, `${label}: expected exactly one <main>`, diag);
      assert(!RAW_ERROR.test(s.body), `${label}: raw error text`, diag);
      assert(s.badgesWithoutText === 0, `${label}: a status badge relies on colour alone`, {});
      assert(s.fakeDisabled.length === 0, `${label}: aria-disabled fake control present`, s.fakeDisabled);
      assert(s.unnamedFocusables.length === 0, `${label}: focusable element without an accessible name`, s.unnamedFocusables);
      assert(s.correlationOutside === 0, `${label}: a correlation id overflows the viewport`, {});
      if (target.timeline) assert(s.timelines.length > 0 && s.timelines.every((t) => t.entries > 0 && t.named && t.controls === 0), `${label}: timeline missing/unnamed/interactive`, s.timelines);
      if (target.correlation) assert(s.correlationCount > 0, `${label}: no correlation ids rendered`, {});
      if (target.key === "notifications") assert(s.notificationItems > 0, `${label}: the fixture notification is not rendered`, diag);
      if (target.empty) assert(s.notificationsEmpty && s.notificationItems === 0, `${label}: notifications empty state missing`, diag);
      assert(s.violations.length === 0, `${label}: axe violations`, s.violations);
      report.matrix.push({ label, violations: 0, overflow: s.overflow, badges: s.badges, timelines: s.timelines.length, correlation: s.correlationCount });
    }
  }

  // Keyboard traversal of the dispute detail: every stop visibly focused, focus always moves on (no trap).
  await setSessionCookie(orgA);
  for (const appearance of [{ locale: "en", theme: "light", width: 1366, height: 900 }, { locale: "ar", theme: "dark", width: 390, height: 844 }]) {
    await setAppearance(appearance);
    await visit(`${baseUrl}/dashboard/disputes/${dispute.id}/`);
    await client.evaluate(`document.body.focus()`);
    const stops = [];
    let reachedEvidence = false;
    for (let step = 0; step < 90; step += 1) {
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
      // Each element is tagged on first focus; focusing an already-tagged element means the Tab order
      // wrapped (normal end of page) — a trap would instead keep focus on the same element.
      const stop = await client.evaluate(`(() => { const el = document.activeElement; if (!el || el === document.body) return null; const repeat = el.hasAttribute("data-f012-visited"); el.setAttribute("data-f012-visited", ""); const cs = getComputedStyle(el); return { repeat, same: el === window.__f012Last, id: el.tagName + "|" + (el.getAttribute("href") ?? el.getAttribute("name") ?? ""), inMain: Boolean(el.closest("main")), visible: el.matches(":focus-visible") && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"), evidence: Boolean(el.closest('[data-slot="evidence-note-form"]')), _set: (window.__f012Last = el, true) }; })()`);
      if (!stop) break;
      assert(!stop.same, `${appearance.locale}: focus did not move (keyboard trap)`, stop);
      if (stop.repeat) break;
      stops.push(stop);
      if (stop.evidence) reachedEvidence = true;
    }
    const invisible = stops.filter((stop) => stop.inMain && !stop.visible);
    assert(reachedEvidence, `${appearance.locale}: keyboard never reached the evidence form`, { stops: stops.length });
    assert(invisible.length === 0, `${appearance.locale}: focused elements without a visible indicator`, invisible);
    report.keyboard.push({ locale: appearance.locale, width: appearance.width, stops: stops.length, invisibleInMain: invisible.length, reachedEvidence });
  }

  // Exact-field validation, EN + AR: empty submit → aria-invalid + associated role=alert message.
  for (const locale of ["en", "ar"]) {
    await setAppearance({ theme: "light", locale, width: 1366, height: 900 });
    for (const [path, formSelector] of [["/dashboard/disputes/", "form:has(textarea[name=reason])"], [`/dashboard/disputes/${dispute.id}/`, '[data-slot="evidence-note-form"]']]) {
      await visit(`${baseUrl}${path}`);
      assert(await waitFor(`Boolean(document.querySelector(${JSON.stringify(formSelector)})?.querySelector("button[type=submit]"))`), `${locale} ${path}: form missing`, {});
      await client.evaluate(`document.querySelector(${JSON.stringify(formSelector)}).querySelector("button[type=submit]").click()`);
      assert(await waitFor(`Boolean(document.querySelector(${JSON.stringify(formSelector)}).querySelector('[aria-invalid="true"]'))`), `${locale} ${path}: no aria-invalid after empty submit`, {});
      const fields = await client.evaluate(`[...document.querySelector(${JSON.stringify(formSelector)}).querySelectorAll('[aria-invalid="true"]')].map((el) => { const alerts = (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)).filter((node) => node && node.getAttribute("role") === "alert"); return { labelled: Boolean(document.querySelector('label[for="' + el.id + '"]')), alert: alerts[0]?.textContent ?? null }; })`);
      assert(fields.length > 0 && fields.every((field) => field.labelled && field.alert), `${locale} ${path}: invalid field not labelled or missing its alert`, fields);
      report.validation.push({ locale, path, invalidFields: fields.length, messages: fields.map((field) => field.alert) });
    }
  }

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-012-RUND-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  const attempt = (args, tries = 3) => {
    for (let i = 1; i <= tries; i += 1) {
      try {
        return JSON.parse(runFixtureScript(args).split(/\r?\n/).find((line) => line.startsWith("{")) ?? "{}");
      } catch (error) {
        if (i === tries) return { failed: true, error: String(error?.stderr ?? error).trim().split(/\r?\n/).pop() };
      }
    }
  };
  const disputes = attempt(["--cleanup-dispute-test-rows"]);
  const notifications = attempt(["--cleanup-notification-test-rows"]);
  console.log("FEATURE-012-RUND-BROWSER-CLEANUP", JSON.stringify({ disputes, notifications }));
  if (disputes.failed || notifications.failed || disputes.remainingTaggedDisputes !== 0 || notifications.remainingTaggedNotifications !== 0) process.exitCode = 1;
}
