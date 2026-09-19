// Feature 012 RUN C — real Chrome + axe proof for the surfaces RUN C actually changed:
//   · order detail with history (Feature 007, T016)   — an Org B order that genuinely has history
//   · ownership history (Feature 005, T016)            — Org A's ledger (correlation ids present)
//   · dashboard navigation (T017)                      — disputes + notifications entries
// NOT browser-tested, and why (recorded, not hidden):
//   · listing detail history (Feature 006) — no member-owned listing can exist live (Feature 006's own
//     recorded gap); the page only renders an organization's OWN listing. Covered by
//     tests/listings/manage-detail-page.test.tsx.
//   · an audit-access explanation page — T015 introduces the access model + `AuditAccessNotice`
//     component but no member route (Feature 010 owns the audit console).
//
// Matrix: EN/AR × light/dark × 390/1366 — axe (colour contrast on) zero violations, lang/dir, one
// <main>, no horizontal overflow (correlation ids must not force it), timelines named by a visible
// heading, no button/link/form/input inside any history timeline, no raw error text, nav entries
// carry no count. Plus visible keyboard focus on the Disputes nav link and clean console/network.
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3231";
const ORG_B = "f0000000-0000-4000-8000-000000000002";

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

const orgASession = await signIn("buyer-only+foundation-test@example.com");
const orgBSession = await signIn("buyer-and-seller+foundation-test@example.com");

// Read-only: locate, under Org B's OWN session, one of its orders that already has history.
const lookup = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/order_status_history?select=order_id,orders!inner(buyer_organization_id)&orders.buyer_organization_id=eq.${ORG_B}&limit=1`, {
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${orgBSession.access_token}` },
});
const [historyRow] = await lookup.json();
assert(historyRow?.order_id, "Standing fixture missing: no Org B order with history", {});

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const RAW_ERROR = /violates|row-level security|PGRST|42501|SQLSTATE|history_read_failed|TypeError/i;

const SURFACES = [
  { key: "order-history", session: orgBSession, path: `/dashboard/orders/${historyRow.order_id}/`, expectTimeline: true, expectCorrelation: false },
  { key: "ownership-history", session: orgASession, path: "/dashboard/inventory/history/", expectTimeline: true, expectCorrelation: true },
  { key: "dashboard-nav", session: orgASession, path: "/dashboard/", expectTimeline: false, expectCorrelation: false },
];

const report = { matrix: [], nav: null, focus: null };
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
    const timelines = [...document.querySelectorAll('[data-slot="history-timeline"]')];
    const visibleText = (el) => [...el.querySelectorAll("*")].length ? el.innerText.trim() : (el.textContent ?? "").trim();
    return {
      path: location.pathname, lang: root.lang, dir: root.dir, dark: root.classList.contains("dark"),
      overflow: root.scrollWidth - root.clientWidth, mains: document.querySelectorAll("main").length,
      body: document.body.innerText,
      stateScreens: [...document.querySelectorAll("[data-state-screen]")].map((el) => el.getAttribute("data-state-screen")).filter((s) => s !== "loading"),
      timelines: timelines.map((t) => { const heading = document.getElementById(t.getAttribute("aria-labelledby") ?? ""); return { entries: t.querySelectorAll('[data-slot="history-entry"]').length, named: Boolean(heading && (heading.textContent ?? "").trim()), controls: t.querySelectorAll("button, a, input, select, textarea, form, [contenteditable]").length }; }),
      correlationIds: [...document.querySelectorAll('[data-slot="correlation-id"]')].map((el) => { const r = el.getBoundingClientRect(); return { mono: getComputedStyle(el).fontFamily.toLowerCase().includes("mono"), right: Math.round(r.right), left: Math.round(r.left) }; }),
      viewportWidth: root.clientWidth,
      navLinks: [...document.querySelectorAll('a[href="/dashboard/disputes"], a[href="/dashboard/disputes/"], a[href="/dashboard/notifications"], a[href="/dashboard/notifications/"]')].map((a) => ({ href: a.getAttribute("href"), text: (a.innerText ?? "").trim(), label: a.getAttribute("aria-label") })),
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

try {
  for (const locale of ["en", "ar"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1366]) {
        for (const target of SURFACES) {
          await setSessionCookie(target.session);
          await setAppearance({ theme, locale, width, height: width === 390 ? 844 : 900 });
          await visit(`${baseUrl}${target.path}`);
          const s = await surface();
          const label = `${locale}-${theme}-${width} ${target.key}`;
          const diag = { path: s.path, stateScreens: s.stateScreens, body: s.body.slice(0, 300) };
          assert(s.stateScreens.length === 0, `${label}: page rendered a state screen`, diag);
          assert(s.lang === locale && s.dir === (locale === "ar" ? "rtl" : "ltr"), `${label}: wrong lang/dir`, diag);
          assert(s.dark === (theme === "dark"), `${label}: theme not applied`, diag);
          assert(s.overflow <= 1, `${label}: horizontal overflow`, { overflow: s.overflow });
          assert(s.mains === 1, `${label}: expected exactly one <main>`, diag);
          assert(!RAW_ERROR.test(s.body), `${label}: raw error text`, diag);
          if (target.expectTimeline) {
            assert(s.timelines.length >= 1 && s.timelines.every((t) => t.entries > 0 && t.named && t.controls === 0), `${label}: history timeline missing, unnamed, empty or interactive`, s.timelines);
          }
          if (target.expectCorrelation) {
            assert(s.correlationIds.length > 0 && s.correlationIds.every((c) => c.mono && c.right <= s.viewportWidth + 1 && c.left >= -1), `${label}: correlation ids missing, not monospaced, or overflowing`, s.correlationIds.slice(0, 3));
          }
          if (target.key === "dashboard-nav") {
            const hrefs = s.navLinks.map((link) => link.href.replace(/\/$/, ""));
            // At 390px the sidebar collapses into the mobile menu; the entries must still exist in the DOM.
            assert(hrefs.includes("/dashboard/disputes") && hrefs.includes("/dashboard/notifications"), `${label}: disputes/notifications nav entries missing`, s.navLinks);
            assert(s.navLinks.every((link) => !/\d/.test(`${link.text}${link.label ?? ""}`)), `${label}: a nav entry shows a count`, s.navLinks);
            report.nav = s.navLinks;
          }
          assert(s.violations.length === 0, `${label}: axe violations`, s.violations);
          report.matrix.push({ label, violations: s.violations.length, overflow: s.overflow, timelines: s.timelines.length, correlationIds: s.correlationIds.length });
        }
      }
    }
  }

  // Visible keyboard focus on the Disputes nav entry (EN light 1366).
  await setSessionCookie(orgASession);
  await setAppearance({ theme: "light", locale: "en", width: 1366, height: 900 });
  await visit(`${baseUrl}/dashboard/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 80 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => { const el = document.activeElement; if (!el || el.tagName !== "A" || !/^\\/dashboard\\/disputes\\/?$/.test(el.getAttribute("href") ?? "")) return null; const cs = getComputedStyle(el); return { focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow }; })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Disputes nav entry has no visible keyboard focus", focus ?? {});
  report.focus = focus;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-012-RUNC-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
