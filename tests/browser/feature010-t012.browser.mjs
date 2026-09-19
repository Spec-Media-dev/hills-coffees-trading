// Feature 010 T012 — real Chrome + axe over the Compliance dispute review surface
// (`/dashboard-admin/disputes`, `/dashboard-admin/disputes/[disputeId]`), composed from Feature 012's
// layer. Matrix: EN/AR × light/dark × 390/1366 over the queue (awaiting action + all), a FROZEN
// dispute's detail (with its database-written transition history), and a not-found id. Per surface:
// axe clean (colour contrast on), exactly one <main>, an h1, correct lang/dir/theme, no horizontal
// overflow, every dispute status badge text-labelled, the member's text rendered as inert text (the
// injected markup never becomes an element), the record-only freeze note present and NO claim that a
// dispute froze or held the order/payment (DB-OPEN-09), no raw database text.
// Then, through the real UI: keyboard Tab reaches a queue "Open" link with a visible ring; on an OPEN
// dispute a missing reason is associated with the reason field (no write); a reasoned "Under review"
// records a history entry attributed to "You"; "Rejected" opens the alertdialog, Escape cancels
// without a write, confirming records the rejection. No console/page/request errors.
//
// Fixtures: the disposable COMPLIANCE operator (prepared here, de-privileged in `finally`); disputes are
// raised under the standing buyer's own session (Feature 012's `disputes_create` path), tagged, and
// removed in `finally` (history cascades with them). Prior transitions use `transition_dispute` — the
// same database function the console's named operations call.
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
const TAG = "[F012-RUN-A]";
const ORDER_A = "05000000-0000-4000-8000-00000000000b";
const ORG_A = "f0000000-0000-4000-8000-000000000001";
const NIL = "00000000-0000-4000-8000-000000000000";
const MEMBER_TEXT = `${TAG} T012 browser proof — <b data-injected="1">bags</b> torn <img src=x onerror="window.__xss=1">`;

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

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const RAW_ERROR = /PGRST|permission denied|violates|SQLSTATE|row-level security|42501|P0001|_read_failed|dispute_stale|invalid_dispute_transition|TypeError|undefined is not/i;
// A dispute never froze/held anything (DB-OPEN-09): no sentence may claim it did.
const FAKE_FREEZE = /\b(order|payment|shipment|settlement|inventory|delivery)\b[^.]{0,40}\b(is|has been|was|now)\s+(frozen|on hold|held|suspended|stopped)\b/i;

const APPEARANCES = [];
for (const locale of ["en", "ar"]) for (const theme of ["light", "dark"]) for (const width of [390, 1366]) APPEARANCES.push({ locale, theme, width, height: width === 390 ? 844 : 900, dir: locale === "ar" ? "rtl" : "ltr", label: `${locale}-${theme}-${width}` });
const report = { matrix: [], keyboard: null, validation: null, recorded: [], dialog: null, fixtures: null };

seed("--seed-dispute-fixtures");
seed("--cleanup-dispute-test-rows");
seed("--prepare-compliance-fixture");

const buyer = await signIn("buyer-only+foundation-test@example.com");
const compliance = await signIn("compliance-reviewer+t010-test@example.com");
const raise = async (text) => (await rest(buyer, "POST", "disputes", { order_id: ORDER_A, opened_by_user_id: buyer.user.id, opened_by_organization_id: ORG_A, reason: text }))[0];
const transition = (id, from, to, reason) => rest(compliance, "POST", "rpc/transition_dispute", { p_dispute_id: id, p_expected_status: from, p_to_status: to, p_reason: reason });

const frozen = await raise(MEMBER_TEXT);
await rest(buyer, "POST", "dispute_evidence", { dispute_id: frozen.id, uploaded_by: buyer.user.id, note: "Photo of the torn bags is held by our warehouse manager." });
await transition(frozen.id, "OPEN", "UNDER_REVIEW", "Browser proof: review opened.");
await transition(frozen.id, "UNDER_REVIEW", "FROZEN", "Browser proof: awaiting the carrier statement.");
const open = await raise(`${TAG} T012 browser proof — interactive decision target.`);

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
/** Paced navigation with a stale-document marker (a fresh document must replace the previous one). */
async function visit(url) {
  await pause(900);
  await client.evaluate(`window.__t012Stale = true`).catch(() => undefined);
  await goto(client, url);
  assert(await waitForExpr(`!window.__t012Stale && document.readyState === "complete"`, 200), `Navigation to ${url} never produced a fresh document`, {});
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
      url: location.pathname + location.search, width: root.clientWidth, scrollWidth: root.scrollWidth, language: root.lang, direction: root.dir, dark: root.classList.contains("dark"),
      mains: document.querySelectorAll("main").length, hasHeading: Boolean(document.querySelector("h1")), body: document.body.innerText, overflowing,
      states: [...document.querySelectorAll("[data-admin-state]")].map((el) => el.getAttribute("data-admin-state")),
      badges: document.querySelectorAll('[data-slot="dispute-status-badge"]').length,
      badgesWithoutText: [...document.querySelectorAll('[data-slot="dispute-status-badge"]')].filter((el) => !(el.innerText ?? "").trim()).length,
      history: [...document.querySelectorAll("[data-dispute-history-entry]")].map((entry) => ({ statuses: [...entry.querySelectorAll('[data-slot="dispute-status-badge"]')].map((b) => b.dataset.status), reason: entry.querySelector('[data-slot="dispute-history-reason"]')?.textContent ?? null })),
      injected: Boolean(document.querySelector('[data-injected], main img[src="x"]')) || Boolean(window.__xss),
      reasonText: document.querySelector('[data-slot="dispute-reason"]')?.textContent ?? null,
      freezeNote: document.querySelector("[data-dispute-freeze-note]")?.innerText ?? "",
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
  assert(surface.mains === 1 && surface.hasHeading, `${label} landmark/heading structure`, { mains: surface.mains, hasHeading: surface.hasHeading });
  assert(surface.language === a.locale && surface.direction === a.dir && surface.dark === (a.theme === "dark"), `${label} wrong lang/dir/theme`, { language: surface.language, direction: surface.direction, dark: surface.dark });
  assert(!RAW_ERROR.test(surface.body), `${label} leaked raw database text`, {});
  assert(surface.badgesWithoutText === 0, `${label} has a text-less status badge`, {});
  assert(!surface.injected, `${label} rendered member markup as HTML`, {});
  assert(!FAKE_FREEZE.test(surface.body), `${label} claims a dispute froze or held a commercial record`, { match: surface.body.match(FAKE_FREEZE)?.[0] });
}
const click = async (box) => {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
};
const boxOf = async (selector) => client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const setValue = async (selector, value) =>
  client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const key = async (k, code = k) => {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });
  await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(compliance), path: "/", sameSite: "Lax" });

  const pages = [
    { key: "queue", path: "/dashboard-admin/disputes/", en: /Dispute review/, ar: /مراجعة النزاعات/, contains: [frozen.id, open.id] },
    { key: "queue-all", path: "/dashboard-admin/disputes/?view=all", en: /All disputes/, ar: /كل النزاعات/, contains: [frozen.id] },
    { key: "detail-frozen", path: `/dashboard-admin/disputes/${frozen.id}/`, en: /Transition history/, ar: /سجل الانتقالات/, detail: true },
    { key: "not-found", path: `/dashboard-admin/disputes/${NIL}/`, en: /Not found/, ar: /غير موجود/, state: "not-found" },
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
      for (const id of page.contains ?? []) assert(surface.body.includes(id), `${label} is missing dispute ${id}`, {});
      if (!page.state) assert(/DB-OPEN-09/.test(surface.freezeNote), `${label} lacks the record-only freeze note`, { note: surface.freezeNote });
      if (page.detail) {
        assert(surface.reasonText === MEMBER_TEXT, `${label} does not show the member's text verbatim`, { reasonText: surface.reasonText });
        assert(JSON.stringify(surface.history) === JSON.stringify([{ statuses: ["OPEN", "UNDER_REVIEW"], reason: "Browser proof: review opened." }, { statuses: ["UNDER_REVIEW", "FROZEN"], reason: "Browser proof: awaiting the carrier statement." }]), `${label} history is not the database's record`, surface.history);
        const statusLabels = a.locale === "ar" ? /مجمّد[\s\S]*قيد المراجعة/ : /Frozen[\s\S]*Under review/;
        assert(statusLabels.test(surface.body), `${label} status labels missing`, {});
        assert(/Photo of the torn bags/.test(surface.body), `${label} evidence note missing`, {});
      }
      report.matrix.push({ label, url: surface.url, states: surface.states, badges: surface.badges, violations: surface.violations.length });
    }
  }

  // ── Keyboard: Tab reaches a queue "Open" link with a visible focus ring. ──
  await setAppearance(APPEARANCES[1]);
  await visit(`${baseUrl}/dashboard-admin/disputes/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 120 && !focus; step += 1) {
    await key("Tab");
    focus = await client.evaluate(`(() => { const el = document.activeElement; const href = el?.getAttribute?.("href") ?? ""; if (!el || el.tagName !== "A" || !/^\\/dashboard-admin\\/disputes\\/[0-9a-f-]{36}\\/?$/.test(href)) return null; const cs = getComputedStyle(el); return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow }; })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached a dispute row link with a visible ring", focus);
  report.keyboard = focus;

  // ── Real UI decisions on the OPEN dispute (EN, light, 1366). ──
  const detailUrl = `${baseUrl}/dashboard-admin/disputes/${open.id}/`;
  await visit(detailUrl);
  await settle(/Record a status change/, APPEARANCES[1]);
  const offered = await client.evaluate(`[...document.querySelectorAll("[data-decision-option]")].map((el) => el.getAttribute("data-decision-option"))`);
  assert(JSON.stringify(offered) === JSON.stringify(["UNDER_REVIEW", "FROZEN", "REJECTED"]), "OPEN does not offer exactly Feature 012's next statuses", offered);

  await click(await boxOf('[data-decision-option="UNDER_REVIEW"]'));
  await pause(200);
  await click(await boxOf('[data-decision-form="dispute-transition"] button[type="submit"]'));
  await pause(400);
  const validation = await client.evaluate(`(() => { const form = document.querySelector('[data-decision-form="dispute-transition"]'); const textarea = form.querySelector("textarea"); const describedBy = textarea?.getAttribute("aria-describedby") ?? ""; const alert = describedBy.split(/\\s+/).map((id) => document.getElementById(id)).find((el) => el && el.getAttribute("role") === "alert"); return { invalid: textarea?.getAttribute("aria-invalid"), alertText: alert?.textContent ?? null, entries: document.querySelectorAll("[data-dispute-history-entry]").length }; })()`);
  assert(validation.invalid === "true" && /at least 10 characters/.test(validation.alertText ?? "") && validation.entries === 0, "Missing reason is not associated with the reason field (or something was written)", validation);
  report.validation = validation;

  await setValue('[data-decision-form="dispute-transition"] textarea', "Browser proof: review opened from the console UI.");
  await pause(100);
  await click(await boxOf('[data-decision-form="dispute-transition"] button[type="submit"]'));
  assert(await waitForExpr(`document.querySelectorAll("[data-dispute-history-entry]").length === 1`, 120), "The reasoned 'Under review' decision was not recorded in the history", {});
  const firstEntry = await client.evaluate(`(() => { const e = document.querySelector("[data-dispute-history-entry]"); return { statuses: [...e.querySelectorAll('[data-slot="dispute-status-badge"]')].map((b) => b.dataset.status), reason: e.querySelector('[data-slot="dispute-history-reason"]')?.textContent, you: /Changed by[\\s\\S]*You/.test(e.innerText) }; })()`);
  assert(JSON.stringify(firstEntry.statuses) === JSON.stringify(["OPEN", "UNDER_REVIEW"]) && firstEntry.reason === "Browser proof: review opened from the console UI." && firstEntry.you, "The recorded history entry is not attributed/reasoned correctly", firstEntry);
  report.recorded.push(firstEntry);

  await visit(detailUrl);
  await settle(/Record a status change/, APPEARANCES[1]);
  await click(await boxOf('[data-decision-option="REJECTED"]'));
  await pause(200);
  await setValue('[data-decision-form="dispute-transition"] textarea', "Browser proof: grade matches the contracted specification.");
  await pause(100);
  await click(await boxOf('[data-decision-form="dispute-transition"] button[type="submit"]'));
  await pause(500);
  const dialog = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "", focusInside: Boolean(d && d.contains(document.activeElement)), labelled: Boolean(d && (d.getAttribute("aria-labelledby") || d.getAttribute("aria-label"))) }; })()`);
  assert(dialog.open && /Record this status change\?/.test(dialog.text) && dialog.focusInside && dialog.labelled, "Outcome confirmation dialog is not keyboard-accessible", dialog);
  const dialogAxe = await client.evaluate(`(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => ({ id: v.id, impact: v.impact })))()`);
  assert(dialogAxe.length === 0, "axe violations with the dialog open", dialogAxe);
  await key("Escape");
  await pause(500);
  const afterEscape = await client.evaluate(`({ open: Boolean(document.querySelector('[role="alertdialog"]')), status: document.querySelector('main header [data-slot="dispute-status-badge"], main [data-slot="dispute-status-badge"]')?.dataset.status ?? null, entries: document.querySelectorAll("[data-dispute-history-entry]").length })`);
  assert(!afterEscape.open && afterEscape.entries === 1, "Escape did not cancel the decision without a write", afterEscape);

  await click(await boxOf('[data-decision-form="dispute-transition"] button[type="submit"]'));
  await pause(500);
  const confirm = await boxOf('[role="alertdialog"] [data-slot="alert-dialog-action"], [role="alertdialog"] button:last-of-type');
  assert(confirm, "Confirm button not found in the dialog", {});
  await click(confirm);
  assert(await waitForExpr(`document.querySelectorAll("[data-dispute-history-entry]").length === 2 && Boolean(document.querySelector('[data-slot="dispute-resolution"]'))`, 120), "Confirming the rejection did not record it", {});
  const rejected = await client.evaluate(`(() => { const entries = [...document.querySelectorAll("[data-dispute-history-entry]")]; const e = entries[1]; return { statuses: [...e.querySelectorAll('[data-slot="dispute-status-badge"]')].map((b) => b.dataset.status), reason: e.querySelector('[data-slot="dispute-history-reason"]')?.textContent, resolution: document.querySelector('[data-slot="dispute-resolution"]')?.textContent, offered: [...document.querySelectorAll("[data-decision-option]")].map((el) => el.getAttribute("data-decision-option")) }; })()`);
  assert(JSON.stringify(rejected.statuses) === JSON.stringify(["UNDER_REVIEW", "REJECTED"]) && rejected.reason === "Browser proof: grade matches the contracted specification." && rejected.resolution === rejected.reason && JSON.stringify(rejected.offered) === JSON.stringify(["CLOSED"]), "The rejection was not recorded as the outcome with its history entry", rejected);
  report.recorded.push(rejected);
  report.dialog = { ...dialog, text: undefined, axeViolations: dialogAxe.length, escapeCancelled: true };

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-010-T012-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  const disputes = seedJson("--cleanup-dispute-test-rows");
  const history = seedJson("--inspect-dispute-status-history");
  seed("--cleanup-compliance-fixture");
  const operator = seedJson("--inspect-compliance-fixture");
  report.fixtures = { disputes, history, operator };
  console.log("FEATURE-010-T012-FIXTURE-CLEANUP", JSON.stringify(report.fixtures));
  assert(disputes.remainingTaggedDisputes === 0 && history.taggedDisputeIds.length === 0 && operator.activeCapability === false, "Fixture cleanup incomplete", report.fixtures);
}
