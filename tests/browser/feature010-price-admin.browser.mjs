// Feature 010 T049 / Feature 011 T013 — real Chrome proof, against a RUNNING PRODUCTION SERVER (`next start`), that an
// administrative price change revalidates the `reference-prices` tag and the public surface updates at once.
//
//   1. Refusal: WAREHOUSE and FINANCE are refused `/dashboard-admin/prices/…` by direct URL; anonymous is sent to the
//      operator sign-in.
//   2. Through the console UI as the disposable platform ADMIN: create an APPROVED source, record observation V1.
//      The public homepage (anonymous HTTP) shows V1's exact stored text.
//   3. CACHED: a newer observation V2 written OUTSIDE the product (privileged script — no revalidation) does NOT appear
//      on the homepage across repeated requests: the public result is served from the `reference-prices` cache.
//   4. Through the console UI: record a newer observation V3. The very next homepage request shows V3 — long before the
//      300s TTL could have expired (elapsed time recorded).
//   5. Through the console UI: set the licence to RESTRICTED. The homepage stops showing the source at once.
//   6. axe (colour-contrast on) over the price admin pages, EN/AR × light/dark, 1366/390; one <main>; no overflow.
//
// Requires `npm run build` + `npx next start -p 3231` (HILLS_UI_URL, default http://localhost:3231) and the CURRENT
// TEST_FIXTURE_PASSWORD in .env.local. Fixtures: the disposable catalogue ADMIN is prepared first and de-privileged in
// `finally`; every `F010P-` row is removed in `finally`.
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
const FIXTURES = { admin: "catalogue-admin+t021-test@example.com", warehouse: "warehouse-admin+foundation-test@example.com", finance: "finance-admin+foundation-test@example.com" };
const SOURCE = { name: "F010P E2E Source", code: "F010P-E2E" };
const V1 = { raw: "201.1111", stored: "201.111100", observedAt: "2026-09-15T10:00" };
const V2 = { raw: "202.2222", stored: "202.222200", observedAt: "2026-09-16T10:00:00Z" };
const V3 = { raw: "203.3333", stored: "203.333300", observedAt: "2026-09-17T10:00" };
const TTL_SECONDS = 300;

function seed(args, env = {}) {
  return execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/seed-test-fixtures.ts"), ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] }).toString();
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
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** The public homepage as an anonymous visitor sees it (plain HTTP, no cookies). */
async function publicHome() {
  const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
  const html = await response.text();
  return { status: response.status, html, has: (text) => html.includes(text) };
}

const report = { server: baseUrl, refusal: null, created: null, v1Public: null, cached: null, revalidated: null, restricted: null, surfaces: [], fixtures: null };

seed(["--prepare-catalogue-admin-fixture"]);
seed(["--cleanup-price-admin-rows"]);

const browser = await launchBrowser("about:blank");
const { client } = browser;

async function setSession(session) {
  await client.send("Network.clearBrowserCookies");
  if (session) await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(session), path: "/", sameSite: "Lax" });
}
async function waitFor(expression, attempts = 60, every = 250) {
  for (let i = 0; i < attempts; i += 1) {
    if (await client.evaluate(`Boolean(${expression})`).catch(() => false)) return true;
    await pause(every);
  }
  return false;
}
/** Paced navigation with a stale-document marker (see memory: goto can read the previous document's readyState). */
async function visit(url) {
  await pause(900);
  await client.evaluate(`window.__f010pStale = true`).catch(() => undefined);
  await goto(client, url);
  assert(await waitFor(`!window.__f010pStale && document.readyState === "complete"`, 200), `Navigation to ${url} never produced a fresh document`, {});
  await pause(300);
}
/** Fills a RecordForm by field name and submits it through the form's own submit handler. */
async function submitRecordForm(formKey, values) {
  const result = await client.evaluate(`(() => {
    const root = document.querySelector('[data-record-form="${formKey}"]');
    if (!root) return "no-form";
    const form = root.querySelector("form");
    for (const [name, value] of Object.entries(${JSON.stringify(values)})) {
      const el = form.elements.namedItem(name);
      if (!el) return "no-field:" + name;
      if (el.type === "checkbox") el.checked = value === true;
      else el.value = value;
    }
    form.requestSubmit();
    return "submitted";
  })()`);
  assert(result === "submitted", `Could not submit ${formKey}`, { result });
}
async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    return { url: location.pathname, lang: root.lang, dir: root.dir, dark: root.classList.contains("dark"), mains: document.querySelectorAll("main").length, overflow: root.scrollWidth > root.clientWidth + 1, violations: axeResult.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })) };
  })()`);
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── 1. refusal by direct URL ──
  {
    const refused = [];
    for (const [label, email] of [["WAREHOUSE", FIXTURES.warehouse], ["FINANCE", FIXTURES.finance]]) {
      await setSession(await signIn(email));
      for (const path of ["/dashboard-admin/prices/", "/dashboard-admin/prices/sources/new/", "/dashboard-admin/prices/differentials/new/"]) {
        await visit(`${baseUrl}${path}`);
        const body = await client.evaluate("document.body.innerText");
        assert(/Not permitted for your role/.test(body) && /Required role: Admin/.test(body), `${label} was not refused from ${path}`, { body: body.slice(0, 300) });
        assert(!/Record an observation|New price source|Reference prices/.test(body.replace(/Not permitted[\s\S]*/, "")) && (await client.evaluate(`document.querySelectorAll("[data-record-form], main table").length`)) === 0, `${label} saw price admin content on ${path}`, {});
        refused.push(`${label} ${path}`);
      }
    }
    await setSession(null);
    await visit(`${baseUrl}/dashboard-admin/prices/`);
    const anonymousPath = await client.evaluate("location.pathname");
    assert(anonymousPath.startsWith("/admin/sign-in"), "Anonymous was not sent to the operator sign-in", { anonymousPath });
    report.refusal = { refused, anonymous: anonymousPath };
  }

  // ── 2. create an APPROVED source and record V1 through the console UI ──
  await setSession(await signIn(FIXTURES.admin));
  await visit(`${baseUrl}/dashboard-admin/prices/sources/new/`);
  await submitRecordForm("price-source", { name: SOURCE.name, code: SOURCE.code, sourceType: "ICE_ARABICA", licenceStatus: "APPROVED", delayType: "DELAYED", delayMinutes: "15", isActive: true });
  assert(await waitFor(`/^\\/dashboard-admin\\/prices\\/sources\\/[0-9a-f-]{36}/.test(location.pathname)`, 80), "Creating the source did not navigate to its detail page", { body: (await client.evaluate("document.body.innerText")).slice(0, 400) });
  await pause(800);
  const detailUrl = `${baseUrl}${await client.evaluate("location.pathname")}`;
  report.created = { detail: detailUrl.replace(baseUrl, "") };
  assert(await waitFor(`document.querySelector('[data-record-form="price-observation"]')`, 40), "The observation form is missing on the source page", {});

  async function recordObservation(value) {
    await visit(detailUrl);
    await submitRecordForm("price-observation", { symbol: "KC", commodityType: "ARABICA", rawValue: value.raw, rawCurrency: "USD", rawUnit: "cents/lb", observedAt: value.observedAt, isStale: false });
    const shown = await waitFor(`document.querySelector('[data-stored-value="${value.stored}"]')`, 80);
    assert(shown, `Observation ${value.raw} did not appear on the source page after saving`, { body: (await client.evaluate("document.body.innerText")).slice(0, 600) });
  }
  await recordObservation(V1);
  {
    const home = await publicHome();
    assert(home.status === 200 && home.has(V1.stored) && home.has(SOURCE.name), "The public homepage does not show V1 after the console mutation", { status: home.status, hasV1: home.has(V1.stored) });
    report.v1Public = { status: home.status, shows: V1.stored };
  }

  // ── 3. a write OUTSIDE the product is NOT visible: the public result is cached ──
  seed(["--insert-price-admin-direct-observation"], { F010P_DIRECT_OBSERVATION: JSON.stringify({ sourceCode: SOURCE.code, symbol: "KC", rawValue: V2.raw, observedAt: V2.observedAt }) });
  {
    const samples = [];
    for (let i = 0; i < 4; i += 1) {
      await pause(1500);
      const home = await publicHome();
      samples.push({ v1: home.has(V1.stored), v2: home.has(V2.stored) });
      assert(home.has(V1.stored) && !home.has(V2.stored), "The homepage reflected a direct database write — the public result is not cached", { sample: samples.at(-1) });
    }
    report.cached = { directWrite: V2.stored, samples, conclusion: "V2 (stored, newer) never shown; V1 served from the reference-prices cache" };
  }

  // ── 4. the console mutation revalidates the tag: V3 shows on the NEXT request ──
  {
    const before = Date.now();
    await recordObservation(V3);
    const savedAt = Date.now();
    let home = await publicHome();
    let requests = 1;
    while (!home.has(V3.stored) && requests < 10) {
      await pause(500);
      home = await publicHome();
      requests += 1;
    }
    const elapsedMs = Date.now() - savedAt;
    assert(home.has(V3.stored), "The homepage did not show V3 after the console mutation", { requests });
    assert(!home.has(V1.stored) && !home.has(V2.stored), "The homepage still shows a superseded value", {});
    assert(elapsedMs < TTL_SECONDS * 1000 / 10, "The public update took too long to be revalidation-driven", { elapsedMs });
    report.revalidated = { shows: V3.stored, requestsUntilVisible: requests, msFromSaveToVisible: elapsedMs, msIncludingUi: Date.now() - before, ttlSeconds: TTL_SECONDS };
  }

  // ── 5. restricting the licence removes the source from the public site at once ──
  {
    await visit(detailUrl);
    await submitRecordForm("price-source", { licenceStatus: "RESTRICTED" });
    assert(await waitFor(`document.querySelector('[data-public-state="hidden"]')`, 80), "The source page did not report the source as hidden after restricting it", {});
    let home = await publicHome();
    let requests = 1;
    while ((home.has(V3.stored) || home.has(SOURCE.name)) && requests < 10) {
      await pause(500);
      home = await publicHome();
      requests += 1;
    }
    assert(!home.has(V3.stored) && !home.has(SOURCE.name), "The homepage still shows a RESTRICTED source", { requests });
    report.restricted = { hidden: true, requestsUntilHidden: requests };
  }

  // ── 6. accessibility over the price admin pages ──
  {
    await visit(`${baseUrl}/dashboard-admin/prices/differentials/new/`);
    const appearances = [
      { theme: "light", locale: "en", width: 1366, height: 900 },
      { theme: "dark", locale: "en", width: 1366, height: 900 },
      { theme: "light", locale: "ar", width: 390, height: 844 },
      { theme: "dark", locale: "ar", width: 390, height: 844 },
    ];
    for (const appearance of appearances) {
      await viewport(client, appearance.width, appearance.height);
      await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)}); })()`);
      for (const path of ["/dashboard-admin/prices/", detailUrl.replace(baseUrl, ""), "/dashboard-admin/prices/sources/new/", "/dashboard-admin/prices/differentials/new/"]) {
        await visit(`${baseUrl}${path}`);
        await waitFor(`document.documentElement.lang === "${appearance.locale}"`, 40);
        const surface = await evaluateSurface();
        report.surfaces.push({ ...appearance, path: surface.url, violations: surface.violations.length });
        assert(surface.violations.length === 0, `axe violations on ${path}`, { appearance, violations: surface.violations });
        assert(surface.mains === 1 && !surface.overflow, `Structure problem on ${path}`, { appearance, surface: { mains: surface.mains, overflow: surface.overflow } });
        assert(surface.lang === appearance.locale && surface.dark === (appearance.theme === "dark"), `Appearance not applied on ${path}`, { appearance, surface: { lang: surface.lang, dark: surface.dark } });
      }
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  const removed = seed(["--cleanup-price-admin-rows"]).trim();
  const fixture = seed(["--cleanup-catalogue-admin-fixture"]).trim();
  report.fixtures = { removed, fixture };
  console.log(JSON.stringify(report, null, 2));
  const deprivileged = JSON.parse(fixture.split(/\r?\n/).find((line) => line.startsWith("{")) ?? "{}");
  assert(deprivileged.activeAdminPrivilege === false, "The disposable ADMIN fixture was not de-privileged", deprivileged);
}
