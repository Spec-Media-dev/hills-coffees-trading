// Feature 010 RUN A (Phases 1–2) — real Chrome + axe proof over the Operations Console shell,
// overview, area placeholders, forbidden state and self-account page. Same harness and fixture
// discipline as `feature009-*.browser.mjs`: real password-grant sessions for the WAREHOUSE and
// FINANCE operator fixtures (both without an organization), a real auth cookie, real DOM/CSS
// assertions via CDP. No mocked data, no service role.
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
  warehouse: "warehouse-admin+foundation-test@example.com",
  finance: "finance-admin+foundation-test@example.com",
  member: "buyer-only+foundation-test@example.com",
};

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

const report = { overview: [], placeholder: [], forbidden: [], account: [], anonymous: null, member: null, keyboard: null, drawer: null };

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

function assertClean(label, surface, expected) {
  assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth });
  assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
  assert(surface.mains === 1, `${label} must have exactly one <main>`, { mains: surface.mains });
  assert(surface.hasHeading, `${label} has no h1`, {});
  assert(surface.language === expected.locale && surface.direction === expected.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
  assert(surface.dark === (expected.theme === "dark"), `${label} wrong theme`, { dark: surface.dark });
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── Anonymous: the console redirects to the dedicated operator sign-in and leaks nothing. ──
  await setSession(null);
  await viewport(client, 1366, 900);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  {
    const facts = await client.evaluate(`({ path: location.pathname, body: document.body.innerText })`);
    assert(facts.path.startsWith("/admin/sign-in"), "Anonymous visitor was not sent to /admin/sign-in/", facts);
    assert(!/Operations overview|Shipments requested/.test(facts.body), "Anonymous visitor saw console content", {});
    report.anonymous = { landedOn: facts.path };
  }

  // ── Approved trading member with no operational role: refused everywhere in the console. ──
  const memberSession = await signIn(FIXTURES.member);
  await setSession(memberSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  {
    const facts = await client.evaluate(`({ path: location.pathname, body: document.body.innerText })`);
    assert(/Operations access required/.test(facts.body), "Member without a role did not get the operations-access-required state", { path: facts.path });
    assert(!/Operations overview|Shipments requested/.test(facts.body), "Member without a role saw console content", {});
    await goto(client, `${baseUrl}/dashboard-admin/shipments/`);
    const deep = await client.evaluate(`({ path: location.pathname, body: document.body.innerText })`);
    assert(/Operations access required/.test(deep.body) && !/Not available yet/.test(deep.body), "Member without a role reached a console area by direct URL", { path: deep.path });
    report.member = { root: facts.path, directUrl: deep.path, refused: true };
  }

  // ── WAREHOUSE operator: overview + placeholder + account across the full appearance matrix. ──
  const warehouseSession = await signIn(FIXTURES.warehouse);
  await setSession(warehouseSession);

  for (const appearance of scenarios) {
    await setAppearance(appearance);
    await goto(client, `${baseUrl}/dashboard-admin/`);
    const overview = await evaluateSurface();
    assertClean(`${appearance.label} overview`, overview, appearance);
    const expectSection = appearance.locale === "ar" ? /المستودع/ : /Warehouse/;
    const forbidSection = appearance.locale === "ar" ? /المالية|الامتثال/ : /Finance|Compliance/;
    assert(expectSection.test(overview.body), `${appearance.label} overview missing the Warehouse section`, {});
    assert(!/Payments under review|Payouts pending|KYB applications/.test(overview.body), `${appearance.label} overview leaked a non-warehouse section`, {});
    assert(!/\$\d|USD \d|AED \d/.test(overview.body), `${appearance.label} overview shows a money figure`, {});
    const tiles = await client.evaluate(`[...document.querySelectorAll("[data-metric]")].map((el) => ({ key: el.dataset.metric, state: el.dataset.metricState, text: el.textContent }))`);
    assert(tiles.length === 5 && tiles.every((t) => ["value", "empty", "unavailable"].includes(t.state)), `${appearance.label} overview tiles are not the five warehouse metrics`, tiles);
    assert(tiles.every((t) => t.state !== "empty" || !/\b0\b/.test(t.text)), `${appearance.label} an empty tile renders a bare 0`, tiles);
    report.overview.push({ ...appearance, url: overview.url, tiles: tiles.map((t) => `${t.key}:${t.state}`), violations: overview.violations.length, sectionOk: expectSection.test(overview.body), noForeignSection: !forbidSection.test(overview.body.replace(/(Operations console|وحدة تشغيل)[^\n]*/g, "")) });

    // Planned area (warehouse-permitted): honest "not available yet", no controls.
    await goto(client, `${baseUrl}/dashboard-admin/shipments/`);
    const placeholder = await evaluateSurface();
    assertClean(`${appearance.label} shipments placeholder`, placeholder, appearance);
    const plannedText = appearance.locale === "ar" ? /غير متاح بعد/ : /Not available yet/;
    assert(plannedText.test(placeholder.body), `${appearance.label} shipments placeholder is not honest`, {});
    const controls = await client.evaluate(`document.querySelectorAll("main form, main table, main input, main select, main button:not([aria-haspopup])").length`);
    assert(controls === 0, `${appearance.label} placeholder renders controls`, { controls });
    report.placeholder.push({ label: appearance.label, url: placeholder.url, violations: placeholder.violations.length });

    // Forbidden area by direct URL (finance, not warehouse): the forbidden state names the role.
    await goto(client, `${baseUrl}/dashboard-admin/payments/`);
    const forbidden = await evaluateSurface();
    assertClean(`${appearance.label} payments forbidden`, forbidden, appearance);
    const forbiddenText = appearance.locale === "ar" ? /غير مسموح لدورك/ : /Not permitted for your role/;
    assert(forbiddenText.test(forbidden.body), `${appearance.label} direct URL into finance did not render the forbidden state`, {});
    assert(!/Waiting on a dependency|بانتظار اعتمادية/.test(forbidden.body), `${appearance.label} forbidden route leaked the area's own state`, {});
    report.forbidden.push({ label: appearance.label, url: forbidden.url, violations: forbidden.violations.length, state: await client.evaluate(`document.querySelector("[data-admin-state]")?.dataset.adminState`) });

    // Account page: real email, security status, no password field, initials avatar.
    await goto(client, `${baseUrl}/dashboard-admin/account/`);
    const account = await evaluateSurface();
    assertClean(`${appearance.label} account`, account, appearance);
    assert(account.body.includes(FIXTURES.warehouse), `${appearance.label} account page does not show the real sign-in email`, {});
    const passwordInputs = await client.evaluate(`document.querySelectorAll('input[type="password"]').length`);
    assert(passwordInputs === 0, `${appearance.label} account page accepts a password value`, { passwordInputs });
    const totp = await client.evaluate(`document.querySelector("[data-totp-enrolled]")?.dataset.totpEnrolled`);
    assert(["true", "false"].includes(totp), `${appearance.label} account page could not read real MFA status`, { totp });
    report.account.push({ label: appearance.label, violations: account.violations.length, totpEnrolled: totp });
  }

  // ── Keyboard: Tab reaches the sidebar's first area link with a visible focus ring (EN, 1366). ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 40 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => {
      const el = document.activeElement;
      const href = (el.getAttribute("href") ?? ""); const norm = href.endsWith("/") ? href.slice(0, -1) : href;
      if (!el || el.tagName !== "A" || norm !== "/dashboard-admin/shipments") return null;
      const cs = getComputedStyle(el);
      return { href: el.getAttribute("href"), focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached the Shipments nav link with a visible ring", focus);
  report.keyboard = focus;

  // ── Mobile drawer at 390px (AR): the menu trigger opens the drawer and lists the permitted areas only. ──
  await setAppearance(scenarios[3]);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  const triggerBox = await client.evaluate(`(() => { const b = document.querySelector('header button[aria-expanded]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);
  assert(triggerBox && triggerBox.w >= 24 && triggerBox.h >= 24, "Mobile menu trigger missing or too small", triggerBox);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: triggerBox.x, y: triggerBox.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: triggerBox.x, y: triggerBox.y, button: "left", clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const drawer = await client.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const links = [...dialog.querySelectorAll("a[href]")].map((a) => { const h = a.getAttribute("href") ?? ""; return h.endsWith("/") ? h.slice(0, -1) : h; });
    return { links, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`);
  assert(drawer && drawer.links.includes("/dashboard-admin/shipments") && drawer.links.includes("/dashboard-admin/inventory"), "Mobile drawer did not open with the warehouse areas", drawer);
  assert(!drawer.links.includes("/dashboard-admin/payments") && !drawer.links.includes("/dashboard-admin/kyb"), "Mobile drawer advertised a non-permitted area", drawer);
  assert(drawer.overflow <= 1, "Mobile drawer caused horizontal overflow", drawer);
  report.drawer = drawer;

  // ── FINANCE operator: the mirror-image check — finance section only, warehouse forbidden. ──
  const financeSession = await signIn(FIXTURES.finance);
  await setSession(financeSession);
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  {
    const body = await client.evaluate(`document.body.innerText`);
    assert(/Payments under review/.test(body) && !/Shipments requested|KYB applications/.test(body), "Finance overview is not finance-only", {});
    assert(/Feature 008/.test(body), "Finance overview lacks the money-deferred note", {});
    await goto(client, `${baseUrl}/dashboard-admin/shipments/`);
    const forbiddenBody = await client.evaluate(`document.body.innerText`);
    assert(/Not permitted for your role/.test(forbiddenBody) && /Required role: Warehouse/.test(forbiddenBody), "Finance operator was not refused from the warehouse area by direct URL", {});
    await goto(client, `${baseUrl}/dashboard-admin/roles/`);
    const superBody = await client.evaluate(`document.body.innerText`);
    assert(/Not permitted for your role/.test(superBody), "Finance operator was not refused from the SUPER_ADMIN area by direct URL", {});
  }

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-010-RUNA-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
