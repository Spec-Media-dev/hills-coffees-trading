// Feature 012 RUN B — real Chrome + axe proof for the RUN B surfaces:
//   /dashboard/disputes · /dashboard/disputes/[id] (evidence area) · /dashboard/notifications ·
//   /dashboard/notifications/preferences · /dashboard/orders/[id] (T007 dispute linkage).
// A DISPUTED shipment does not exist in the fixture data (nothing in the approved system sets one
// merely because a dispute exists — DB-OPEN-09), so the delivery-detail linkage is NOT rendered and
// is therefore not browser-tested here; it is covered by tests/delivery/pages.test.tsx.
//
// Matrix: EN/AR × light/dark × 390/1366 on every surface — axe (colour contrast on) zero violations,
// correct lang/dir, one <main>, no horizontal overflow, no raw error text, no file input, no
// mark-read/unread control, no count on the notifications entry. Plus: evidence note inline
// validation + real add, preferences save + persistence, honest empty notification state for a user
// with none, anonymous + cross-organization refusal, visible keyboard focus, clean console/network.
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
const NOTIFICATION_TAG = "[F012-RUN-B]";
const FIXTURES = {
  buyer: { email: "buyer-only+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000001", orderId: "05000000-0000-4000-8000-00000000000b", orderCode: "F005-FIX-ORDER-A" },
  otherOrg: { email: "buyer-and-seller+foundation-test@example.com" },
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
runFixtureScript(["--cleanup-notification-test-rows"]);
runFixtureScript(["--seed-notification-fixture"]);

const buyerSession = await signIn(FIXTURES.buyer.email);
const otherOrgSession = await signIn(FIXTURES.otherOrg.email);
const buyerRest = restClientFor(buyerSession);

// One dispute raised under the buyer's own session (disputes_create), with one hostile-markup note.
const [dispute] = await buyerRest.call("POST", "disputes", {
  body: { order_id: FIXTURES.buyer.orderId, opened_by_user_id: buyerRest.userId, opened_by_organization_id: FIXTURES.buyer.organizationId, reason: `${TAG} RUN B browser proof.` },
  prefer: "return=representation",
});
await buyerRest.call("POST", "dispute_evidence", { body: { dispute_id: dispute.id, uploaded_by: buyerRest.userId, note: `Seeded note <b data-injected="1">bold?</b> <img src=x onerror="window.__xss=1">` } });

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const RAW_ERROR = /violates|row-level security|PGRST|42501|23503|SQLSTATE|stack trace|TypeError/i;

const SURFACES = [
  { key: "disputes", path: "/dashboard/disputes/" },
  { key: "dispute-detail", path: `/dashboard/disputes/${dispute.id}/` },
  { key: "notifications", path: "/dashboard/notifications/" },
  { key: "preferences", path: "/dashboard/notifications/preferences/" },
  { key: "order-linkage", path: `/dashboard/orders/${FIXTURES.buyer.orderId}/` },
];

const report = { matrix: [], evidence: null, preferences: null, emptyNotifications: null, anonymous: [], crossOrg: null, focus: null, linkage: null };

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

/** Paced navigation that waits for a genuinely fresh document (see feature012-runa.browser.mjs). */
async function visit(url) {
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
    const bell = document.querySelector('[data-slot="notifications-entry"]');
    return {
      path: location.pathname, lang: root.lang, dir: root.dir, dark: root.classList.contains("dark"),
      overflow: root.scrollWidth - root.clientWidth, mains: document.querySelectorAll("main").length,
      body: document.body.innerText,
      fileInputs: document.querySelectorAll('input[type="file"]').length,
      markRead: [...document.querySelectorAll("button, a")].filter((el) => /mark (all )?(as )?read|تعليم.*كمقروء/i.test(el.textContent ?? "")).length,
      bell: bell ? { tag: bell.tagName, href: bell.getAttribute("href"), text: (bell.textContent ?? "").trim(), label: bell.getAttribute("aria-label") } : null,
      stateScreens: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")),
      injected: Boolean(document.querySelector("[data-injected]")) || Boolean(window.__xss),
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

try {
  // ── Anonymous: the private RUN B routes never render private data. ──
  await setSessionCookie(null);
  await viewport(client, 1366, 900);
  for (const { path } of SURFACES) {
    await visit(`${baseUrl}${path}`);
    const facts = await client.evaluate(`({ url: location.href, body: document.body.innerText })`);
    const leaked = facts.body.includes(NOTIFICATION_TAG) || facts.body.includes("Seeded note") || facts.body.includes(FIXTURES.buyer.orderCode);
    assert(!leaked, `Anonymous visitor saw private data at ${path}`, { url: facts.url });
    report.anonymous.push({ path, landedOn: new URL(facts.url).pathname, leaked });
  }

  // ── Cross-organization member: no dispute/evidence, no other user's notification; honest empty state. ──
  await setSessionCookie(otherOrgSession);
  await visit(`${baseUrl}/dashboard/disputes/${dispute.id}/`);
  const crossDetail = await client.evaluate(`({ body: document.body.innerText })`);
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await visit(`${baseUrl}/dashboard/notifications/`);
  const crossNotifications = await client.evaluate(`({ body: document.body.innerText, empty: Boolean(document.querySelector('[data-slot="notifications-empty"]')), limitation: Boolean(document.querySelector('[data-slot="notification-limitation"]')), items: document.querySelectorAll('[data-slot="notification-item"]').length })`);
  const crossLeak = crossDetail.body.includes("Seeded note") || crossDetail.body.includes("RUN B browser proof") || crossNotifications.body.includes(NOTIFICATION_TAG);
  assert(!crossLeak, "Cross-organization member observed another organization's dispute/evidence or another user's notification", {});
  assert(/not found|404|غير موجود/i.test(crossDetail.body), "Cross-organization dispute detail did not render not-found", { body: crossDetail.body.slice(0, 300) });
  assert(crossNotifications.empty && crossNotifications.limitation && crossNotifications.items === 0, "Notifications for a user with none are not the honest empty state", crossNotifications);
  report.crossOrg = { disputeNotFound: true, leaked: false };
  report.emptyNotifications = { empty: true, limitationShown: true };

  // ── Owner session. ──
  await setSessionCookie(buyerSession);

  // ── Evidence: exact-field inline validation (EN + AR), then a real add through the form. ──
  for (const locale of ["en", "ar"]) {
    await setAppearance({ theme: "light", locale, width: 1366, height: 900 });
    await visit(`${baseUrl}/dashboard/disputes/${dispute.id}/`);
    assert(await waitFor(`Boolean(document.querySelector('[data-slot="evidence-note-form"] button[type=submit]'))`), `${locale}: evidence form missing`, {});
    await client.evaluate(`document.querySelector('[data-slot="evidence-note-form"] button[type=submit]').click()`);
    assert(await waitFor(`document.querySelector('[data-slot="evidence-note-form"] textarea')?.getAttribute("aria-invalid") === "true"`), `${locale}: evidence inline error did not appear`, {});
    const inline = await client.evaluate(`(() => { const t = document.querySelector('[data-slot="evidence-note-form"] textarea'); const ids = (t.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean); const label = document.querySelector('label[for="' + t.id + '"]'); return { labelled: Boolean(label && label.innerText.trim()), described: ids.map((id) => document.getElementById(id)?.innerText ?? null) }; })()`);
    const expected = locale === "en" ? "Enter a note." : "أدخل ملاحظة.";
    assert(inline.labelled && inline.described.includes(expected), `${locale}: evidence error not associated with the textarea`, inline);
  }
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await visit(`${baseUrl}/dashboard/disputes/${dispute.id}/`);
  await client.evaluate(`(() => {
    const area = document.querySelector('[data-slot="evidence-note-form"] textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, "Browser-added note: pallet 3 wrap was cut on arrival.");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[data-slot="evidence-note-form"] button[type=submit]').click();
  })()`);
  const noteShown = await waitFor(`[...document.querySelectorAll('[data-slot="evidence-note"]')].some((el) => el.textContent.includes("pallet 3 wrap"))`, 160);
  const evidenceFacts = await client.evaluate(`({ notes: document.querySelectorAll('[data-slot="evidence-note"]').length, filesNotice: Boolean(document.querySelector('[data-slot="evidence-files-unavailable"]')), fileInputs: document.querySelectorAll('input[type="file"]').length, injected: Boolean(document.querySelector("[data-injected]")) || Boolean(window.__xss) })`);
  assert(noteShown && evidenceFacts.filesNotice && evidenceFacts.fileInputs === 0 && !evidenceFacts.injected, "Evidence add / DB-BLOCK-01 explanation / inertness failed", evidenceFacts);
  report.evidence = { added: true, ...evidenceFacts };

  // ── T007 linkage on the order page: lists the dispute and states that it changes nothing. ──
  await visit(`${baseUrl}/dashboard/orders/${FIXTURES.buyer.orderId}/`);
  const linkage = await client.evaluate(`(() => { const s = document.querySelector('[data-slot="order-dispute-linkage"]'); return { present: Boolean(s), links: s ? [...s.querySelectorAll('a[href*="/dashboard/disputes/"]')].map((a) => a.getAttribute("href")) : [], noEffect: s ? /does not change this order's status/.test(s.innerText) && /does not automatically freeze or hold/.test(s.innerText) : false, claimsDisputedStatus: Boolean(document.querySelector('[data-slot="order-own-disputed-status"]')) }; })()`);
  assert(linkage.present && linkage.links.some((href) => href.includes(dispute.id)) && linkage.noEffect && !linkage.claimsDisputedStatus, "Order linkage missing, wrong, or implies a freeze", linkage);
  report.linkage = linkage;

  // ── Preferences: save a change, reload, and see it persisted. ──
  await visit(`${baseUrl}/dashboard/notifications/preferences/`);
  await client.evaluate(`document.getElementById("pref-SHIPMENT_UPDATES__EMAIL").click()`);
  await client.evaluate(`document.querySelector('[data-slot="notification-preferences-form"] button[type=submit]').click()`);
  assert(await waitFor(`!document.querySelector('[data-slot="notification-preferences-form"] button[type=submit]').disabled && document.body.innerText.includes("Preferences saved.")`, 120), "Preferences save did not confirm", {});
  await visit(`${baseUrl}/dashboard/notifications/preferences/`);
  const persisted = await client.evaluate(`({ checked: document.getElementById("pref-SHIPMENT_UPDATES__EMAIL").checked, otherChecked: document.getElementById("pref-ORDER_UPDATES__SMS").checked, notSavedBanner: Boolean(document.querySelector('[data-slot="preferences-not-saved"]')), honesty: /does not send notifications/.test(document.body.innerText) })`);
  assert(persisted.checked && !persisted.otherChecked && !persisted.notSavedBanner && persisted.honesty, "Preference did not persist or honesty note missing", persisted);
  report.preferences = persisted;

  // ── Matrix. ──
  for (const locale of ["en", "ar"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1366]) {
        await setAppearance({ theme, locale, width, height: width === 390 ? 844 : 900 });
        for (const { key, path } of SURFACES) {
          await visit(`${baseUrl}${path}`);
          const s = await surface();
          const label = `${locale}-${theme}-${width} ${key}`;
          const diag = { path: s.path, stateScreens: s.stateScreens, body: s.body.slice(0, 300) };
          assert(s.stateScreens.every((state) => state === "loading") && !s.stateScreens.includes("forbidden"), `${label}: page rendered a state screen`, diag);
          assert(s.lang === locale && s.dir === (locale === "ar" ? "rtl" : "ltr"), `${label}: wrong lang/dir`, diag);
          assert(s.dark === (theme === "dark"), `${label}: theme not applied`, diag);
          assert(s.overflow <= 1, `${label}: horizontal overflow`, { overflow: s.overflow });
          assert(s.mains === 1, `${label}: expected exactly one <main>`, diag);
          assert(!RAW_ERROR.test(s.body), `${label}: raw error text on the page`, diag);
          assert(s.fileInputs === 0 && s.markRead === 0 && !s.injected, `${label}: fake upload/read control or live markup`, { fileInputs: s.fileInputs, markRead: s.markRead, injected: s.injected });
          assert(s.bell && s.bell.tag === "A" && /\/dashboard\/notifications\/?$/.test(s.bell.href) && !/\d/.test(`${s.bell.text}${s.bell.label}`), `${label}: notifications entry is not a count-free link`, s.bell);
          assert(s.violations.length === 0, `${label}: axe violations`, s.violations);
          report.matrix.push({ label, violations: s.violations.length, overflow: s.overflow, lang: s.lang, dir: s.dir });
        }
      }
    }
  }

  // ── Visible keyboard focus on the notifications entry (EN light 1366). ──
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await visit(`${baseUrl}/dashboard/notifications/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 80 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => { const el = document.activeElement; if (!el || el.getAttribute("data-slot") !== "notifications-entry") return null; const cs = getComputedStyle(el); return { focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth }; })()`);
  }
  assert(focus && focus.focusVisible && focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0, "Notifications entry has no visible keyboard focus", focus ?? {});
  report.focus = focus;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-012-RUNB-BROWSER-REPORT", JSON.stringify(report, null, 2));
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
  console.log("FEATURE-012-RUNB-BROWSER-CLEANUP", JSON.stringify({ disputes, notifications }));
  if (disputes.failed || notifications.failed || disputes.remainingTaggedDisputes !== 0 || notifications.remainingTaggedNotifications !== 0) process.exitCode = 1;
}
