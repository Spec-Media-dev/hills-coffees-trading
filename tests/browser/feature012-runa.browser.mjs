// Feature 012 RUN A (T006) — real Chrome + axe proof for the NEW member dispute surfaces ONLY:
// /dashboard/disputes and /dashboard/disputes/[disputeId]. Same harness and fixture discipline as the
// Feature 009/010 browser proofs (real password-grant sessions, PostgREST under each session's own RLS,
// never a service role for any product path; the privileged seed script only prepares/cleans fixtures).
//
// Proves: (1) the raise-dispute flow end-to-end through the real form (inline errors associated with
// their controls, EN + AR, then a real submit that lands on the new dispute's page), (2) all six
// approved statuses render their exact textual label + description on the detail page in EN and AR,
// (3) EN/AR × light/dark × 390/1366 on both routes: axe (colour contrast on) zero violations, correct
// lang/dir, no horizontal overflow, badges carry text, (4) visible keyboard focus, (5) untrusted text
// renders inert, (6) anonymous and cross-organization visitors observe nothing, (7) the honesty notice
// never claims a freeze, (8) zero console/page errors and zero failed requests.
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
const FIXTURES = {
  buyer: { email: "buyer-only+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000001", orderId: "05000000-0000-4000-8000-00000000000b", orderCode: "F005-FIX-ORDER-A" },
  otherOrg: { email: "buyer-and-seller+foundation-test@example.com" },
  blocked: { email: "blocked-member+foundation-test@example.com" },
  compliance: { email: "compliance-reviewer+t010-test@example.com" },
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

function restClientFor(session) {
  async function call(method, path, { body, prefer } = {}) {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    assert(response.ok, `PostgREST ${method} ${path} failed`, { status: response.status, data });
    return data;
  }
  return { call, userId: session.user.id };
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

runFixtureScript(["--cleanup-dispute-test-rows"]);
runFixtureScript(["--prepare-compliance-fixture"]);

const buyerSession = await signIn(FIXTURES.buyer.email);
const otherOrgSession = await signIn(FIXTURES.otherOrg.email);
const blockedSession = await signIn(FIXTURES.blocked.email);
const complianceSession = await signIn(FIXTURES.compliance.email);
const buyerRest = restClientFor(buyerSession);
const complianceRest = restClientFor(complianceSession);

/**
 * Fixture disputes in each of the six statuses. Raised under the BUYER's own session (the
 * `disputes_create` authority T003 uses), moved under the disposable COMPLIANCE session along the
 * SAME approved transition path and column allowlist `lib/disputes/compliance.ts` enforces (proven
 * through that module itself in tests/disputes/role-restriction.test.ts).
 */
async function disputeInStatus(target) {
  const [row] = await buyerRest.call("POST", "disputes", {
    body: { order_id: FIXTURES.buyer.orderId, opened_by_user_id: buyerRest.userId, opened_by_organization_id: FIXTURES.buyer.organizationId, reason: `${TAG} Browser proof ${target}. <b data-injected="1">bold?</b> <img src=x onerror="window.__xss=1">` },
    prefer: "return=representation",
  });
  const path = { OPEN: [], UNDER_REVIEW: ["UNDER_REVIEW"], FROZEN: ["UNDER_REVIEW", "FROZEN"], RESOLVED: ["UNDER_REVIEW", "RESOLVED"], REJECTED: ["REJECTED"], CLOSED: ["UNDER_REVIEW", "RESOLVED", "CLOSED"] }[target];
  for (const status of path) {
    const now = new Date().toISOString();
    const outcome = status === "RESOLVED" || status === "REJECTED" ? { resolution: `Browser proof outcome for ${target}.`, resolved_by: complianceRest.userId, resolved_at: now } : {};
    await complianceRest.call("PATCH", `disputes?id=eq.${row.id}`, { body: { status, updated_at: now, ...outcome } });
  }
  return row.id;
}

const STATUSES = ["OPEN", "UNDER_REVIEW", "FROZEN", "RESOLVED", "REJECTED", "CLOSED"];
const disputeIds = {};
for (const status of STATUSES) disputeIds[status] = await disputeInStatus(status);

const LABELS = {
  en: { OPEN: "Open", UNDER_REVIEW: "Under review", FROZEN: "Frozen", RESOLVED: "Resolved", REJECTED: "Rejected", CLOSED: "Closed" },
  ar: { OPEN: "مفتوح", UNDER_REVIEW: "قيد المراجعة", FROZEN: "مجمّد", RESOLVED: "تمت التسوية", REJECTED: "مرفوض", CLOSED: "مغلق" },
};

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const report = { raiseFlow: null, inlineErrors: [], statuses: [], matrix: [], focus: null, anonymous: [], crossOrg: null, blocked: null, injection: null };

const browser = await launchBrowser("about:blank");
const { client } = browser;
await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

/**
 * `goto` polls `document.readyState`, which the PREVIOUS document can still answer "complete" before
 * the new one commits. Mark the old document first and wait until a fresh one is fully loaded.
 */
async function visit(url) {
  // Pace requests: every dashboard render calls Supabase Auth `getUser()` plus several role RPCs, and a
  // burst of back-to-back renders trips Supabase's own rate limiter — which identity resolution then
  // (correctly) fails closed on, turning a real page into an "unauthorized/forbidden" one mid-proof.
  await new Promise((resolve) => setTimeout(resolve, 900));
  await client.evaluate(`window.__f012Stale = true`).catch(() => undefined);
  await goto(client, url);
  const fresh = await waitFor(`!window.__f012Stale && document.readyState === "complete"`, 200);
  assert(fresh, `Navigation to ${url} never produced a fresh document`, {});
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
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    return {
      path: location.pathname,
      lang: root.lang, dir: root.dir, dark: root.classList.contains("dark"),
      overflow: root.scrollWidth - root.clientWidth,
      mains: document.querySelectorAll("main").length,
      body: document.body.innerText,
      badges: [...document.querySelectorAll('[data-slot="dispute-status-badge"]')].map((el) => ({ status: el.getAttribute("data-status"), text: (el.innerText ?? "").trim() })),
      stateScreens: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")),
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

async function waitFor(expression, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await client.evaluate(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

try {
  // ── (6a) Anonymous: neither route renders private dispute data. ──
  await setSessionCookie(null);
  await viewport(client, 1366, 900);
  for (const path of ["/dashboard/disputes/", `/dashboard/disputes/${disputeIds.RESOLVED}/`]) {
    await visit(`${baseUrl}${path}`);
    const facts = await client.evaluate(`({ url: location.href, body: document.body.innerText })`);
    const leaked = facts.body.includes(FIXTURES.buyer.orderCode) || facts.body.includes("Browser proof");
    assert(!leaked, `Anonymous visitor saw private dispute data at ${path}`, { url: facts.url });
    report.anonymous.push({ path, landedOn: new URL(facts.url).pathname, leaked });
  }

  // ── (6b) Cross-organization member: not-found on the detail page; nothing of Org A's in its list. ──
  await setSessionCookie(otherOrgSession);
  await visit(`${baseUrl}/dashboard/disputes/${disputeIds.OPEN}/`);
  const crossDetail = await client.evaluate(`({ url: location.href, body: document.body.innerText })`);
  await visit(`${baseUrl}/dashboard/disputes/`);
  const crossList = await client.evaluate(`({ body: document.body.innerText, rows: document.querySelectorAll('[data-slot="dispute-status-badge"]').length })`);
  const crossLeak = crossDetail.body.includes("Browser proof") || crossDetail.body.includes(FIXTURES.buyer.orderCode) || crossList.body.includes(FIXTURES.buyer.orderCode) || crossList.body.includes("Browser proof");
  assert(!crossLeak, "Cross-organization member observed another organization's dispute", {});
  report.crossOrg = { detailNotFound: /not found|404|غير موجود/i.test(crossDetail.body), leaked: crossLeak };
  assert(report.crossOrg.detailNotFound, "Cross-organization detail did not render not-found", { body: crossDetail.body.slice(0, 400) });

  // ── Blocked member: refused under the existing auth contract (no dispute data). ──
  await setSessionCookie(blockedSession);
  await visit(`${baseUrl}/dashboard/disputes/`);
  const blockedFacts = await client.evaluate(`({ body: document.body.innerText, states: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")), form: Boolean(document.querySelector("textarea")) })`);
  assert(!blockedFacts.form && !blockedFacts.body.includes("Browser proof"), "Blocked member reached the dispute surface", blockedFacts);
  report.blocked = { states: blockedFacts.states, formRendered: blockedFacts.form };

  // ── Owner session for everything below. ──
  await setSessionCookie(buyerSession);

  // ── (1) Inline validation, EN and AR: errors are localized and associated with their control. ──
  for (const locale of ["en", "ar"]) {
    await setAppearance({ theme: "light", locale, width: 1366, height: 900 });
    await visit(`${baseUrl}/dashboard/disputes/`);
    const formReady = await waitFor(`Boolean(document.querySelector("form button[type=submit]"))`);
    if (!formReady) {
      const seen = await client.evaluate(`({ url: location.href, states: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")), cookies: document.cookie.split(";").map((c) => c.split("=")[0].trim()), body: document.body.innerText.slice(0, 500) })`);
      assert(false, `${locale}: raise form not rendered for the buyer`, seen);
    }
    await client.evaluate(`document.querySelector("form button[type=submit]").click()`);
    assert(await waitFor(`document.querySelectorAll('[aria-invalid="true"]').length >= 2`), `${locale}: inline errors did not appear`, {});
    const inline = await client.evaluate(`(() => [...document.querySelectorAll('form [aria-invalid="true"]')].map((el) => {
      const ids = (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
      const label = document.querySelector('label[for="' + el.id + '"]');
      return { tag: el.tagName, labelled: Boolean(label && label.innerText.trim()), described: ids.map((id) => document.getElementById(id)?.innerText ?? null) };
    }))()`);
    const expected = locale === "en" ? ["Choose the order this dispute is about.", "Describe the problem in at least 10 characters."] : ["اختر الطلب الذي يتعلق به هذا النزاع.", "صِف المشكلة في 10 أحرف على الأقل."];
    for (const message of expected) assert(inline.some((field) => field.described.includes(message)), `${locale}: inline error not associated with its control`, { inline, message });
    assert(inline.every((field) => field.labelled), `${locale}: invalid control without a label`, inline);
    report.inlineErrors.push({ locale, fields: inline.length });
  }

  // ── (1) Real raise flow through the form (EN). ──
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await visit(`${baseUrl}/dashboard/disputes/`);
  await client.evaluate(`(() => {
    const select = document.querySelector("form select");
    const setSelect = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setSelect.call(select, ${JSON.stringify(FIXTURES.buyer.orderId)});
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const area = document.querySelector("form textarea");
    const setArea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setArea.call(area, ${JSON.stringify(`${TAG} Raised through the real browser form: bags arrived torn.`)});
    area.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("form button[type=submit]").click();
  })()`);
  const landed = await waitFor(`/\\/dashboard\\/disputes\\/[0-9a-f-]{36}/.test(location.pathname) && Boolean(document.querySelector('[data-slot="dispute-status-badge"]'))`, 120);
  const raised = await client.evaluate(`({ path: location.pathname, status: document.querySelector('[data-slot="dispute-status-badge"]')?.getAttribute("data-status"), reason: document.querySelector('[data-slot="dispute-reason"]')?.innerText })`);
  assert(landed && raised.status === "OPEN" && raised.reason?.includes("bags arrived torn"), "Raise flow did not land on an OPEN dispute", { raised, consoleErrors: client.consoleErrors, pageErrors: client.pageErrors, requestFailures: client.requestFailures, toasts: await client.evaluate(`[...document.querySelectorAll("[data-sonner-toast]")].map((el) => el.innerText)`) });
  report.raiseFlow = raised;

  // ── (2) All six statuses: exact label + description, EN and AR. (5) Untrusted text inert. ──
  for (const locale of ["en", "ar"]) {
    await setAppearance({ theme: "light", locale, width: 1366, height: 900 });
    for (const status of STATUSES) {
      await visit(`${baseUrl}/dashboard/disputes/${disputeIds[status]}/`);
      const facts = await client.evaluate(`({
        badge: document.querySelector('[data-slot="dispute-status-badge"]')?.innerText.trim(),
        badgeStatus: document.querySelector('[data-slot="dispute-status-badge"]')?.getAttribute("data-status"),
        description: document.querySelector('[data-slot="dispute-status-description"]')?.innerText.trim(),
        injected: Boolean(document.querySelector('[data-injected]')) || Boolean(window.__xss),
        reasonText: document.querySelector('[data-slot="dispute-reason"]')?.innerText ?? "",
        resolution: document.querySelector('[data-slot="dispute-resolution"]')?.innerText ?? null,
        url: location.href,
        states: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")),
        body: document.body.innerText.slice(0, 400),
      })`);
      assert(facts.badgeStatus === status && facts.badge === LABELS[locale][status], `${locale}/${status}: wrong status label`, facts);
      assert(facts.description && facts.description.length > 10, `${locale}/${status}: no status description`, facts);
      assert(!facts.injected && facts.reasonText.includes("<b data-injected"), `${locale}/${status}: untrusted markup was not rendered inert`, facts);
      if (status === "RESOLVED" || status === "REJECTED" || status === "CLOSED") assert(facts.resolution?.includes("Browser proof outcome"), `${locale}/${status}: resolution missing`, facts);
      report.statuses.push({ locale, status, label: facts.badge });
    }
  }
  report.injection = { markupRenderedAsText: true, scriptExecuted: false };

  // ── (3) Matrix: EN/AR × light/dark × 390/1366 on both routes. ──
  for (const locale of ["en", "ar"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1366]) {
        await setAppearance({ theme, locale, width, height: width === 390 ? 844 : 900 });
        for (const path of ["/dashboard/disputes/", `/dashboard/disputes/${disputeIds.FROZEN}/`]) {
          await visit(`${baseUrl}${path}`);
          const s = await surface();
          const label = `${locale}-${theme}-${width} ${path}`;
          assert(s.lang === locale && s.dir === (locale === "ar" ? "rtl" : "ltr"), `${label}: wrong lang/dir`, s);
          assert(s.dark === (theme === "dark"), `${label}: theme not applied`, { dark: s.dark });
          assert(s.overflow <= 1, `${label}: horizontal overflow`, { overflow: s.overflow });
          assert(s.mains === 1, `${label}: expected exactly one <main>`, { mains: s.mains });
          assert(s.badges.length > 0 && s.badges.every((b) => b.text.length > 0), `${label}: a status badge has no text`, { badges: s.badges, path: s.path, stateScreens: s.stateScreens, body: s.body.slice(0, 600) });
          assert(s.violations.length === 0, `${label}: axe violations`, s.violations);
          // (7) Honesty notice present, and it negates rather than claims a freeze.
          const honest = locale === "en" ? s.body.includes("does not automatically freeze or hold") : s.body.includes("لا يؤدي تلقائيًا إلى تجميد");
          assert(honest, `${label}: honesty notice missing`, {});
          report.matrix.push({ label, violations: s.violations.length, overflow: s.overflow, lang: s.lang, dir: s.dir });
        }
      }
    }
  }

  // ── (4) Visible keyboard focus on a dispute link (EN, light, 1366). ──
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await visit(`${baseUrl}/dashboard/disputes/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 80 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el.tagName !== "A" || !/\\/dashboard\\/disputes\\/[0-9a-f-]{36}/.test(el.getAttribute("href") ?? "")) return null;
      const cs = getComputedStyle(el);
      return { href: el.getAttribute("href"), focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()`);
  }
  assert(focus, "Keyboard Tab never reached a dispute link", {});
  assert(focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Focused dispute link has no visible focus indicator", focus);
  report.focus = focus;

  // ── (8) Clean console / page / network. ──
  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-012-RUNA-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  // Each cleanup step runs independently (one failing must never skip de-privileging the operator);
  // disputes go first because `resolved_by` references the disposable operator's profile.
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
  const complianceOperator = attempt(["--cleanup-compliance-fixture"]);
  console.log("FEATURE-012-RUNA-BROWSER-CLEANUP", JSON.stringify({ disputes, complianceOperator }));
  if (disputes.failed || complianceOperator.failed || disputes.remainingTaggedDisputes !== 0 || complianceOperator.activeAdminPrivilege !== false) process.exitCode = 1;
}
