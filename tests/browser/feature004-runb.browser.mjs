// Feature 004 RUN B — real Chrome browser proof for the live overview page + org switcher, on the
// same CDP harness (tests/browser/cdp-harness.mjs) Feature 002/003 already established. Run against
// an ISOLATED production server (never the developer's own dev server — see the Feature 003 closure
// run's documented reason for that discipline).
import { readFileSync } from "node:fs";
import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  try {
    const contents = readFileSync(".env.local", "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3230";
const password = process.env.TEST_FIXTURE_PASSWORD;
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const delays = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!password) {
  console.log("FEATURE-004-RUNB-BROWSER-REPORT", JSON.stringify({ skipped: true, reason: "TEST_FIXTURE_PASSWORD not available" }));
  process.exit(0);
}

const browser = await launchBrowser(`${baseUrl}/sign-in/`);
const { client } = browser;
const report = { fixtures: [], consoleErrors: [], pageErrors: [] };

async function signIn(email, pw) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const hydrated = await client.evaluate(
      `Boolean(Object.keys(document.querySelector('button[type="submit"]') ?? {}).find((k) => k.startsWith('__reactProps')))`
    );
    if (hydrated) break;
    await delays(300);
  }
  await client.evaluate(`(() => {
    const email = document.querySelector('input[name="email"]');
    const pass = document.querySelector('input[name="password"]');
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue(email, ${JSON.stringify(email)});
    setValue(pass, ${JSON.stringify(pw)});
  })()`);
  const rect = await client.evaluate(`(() => document.querySelector('button[type="submit"]').getBoundingClientRect().toJSON())()`);
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const url = await client.evaluate("location.pathname");
    if (url !== "/sign-in/") break;
    await delays(150);
  }
  await delays(400);
}

async function axeCheck(label) {
  const result = await client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
    const root = document.documentElement;
    return {
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      dir: root.dir,
    };
  })()`);
  assert(result.violations.length === 0, `axe violation (${label})`, result);
  assert(result.scrollWidth <= result.clientWidth + 1, `horizontal overflow (${label})`, result);
  return result;
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // Buyer-only (single org): EN light desktop, EN dark desktop, AR light mobile, AR dark mobile.
  await viewport(client, 1440, 1000);
  await goto(client, `${baseUrl}/sign-in/`);
  await signIn("buyer-only+foundation-test@example.com", password);
  await goto(client, `${baseUrl}/dashboard/`);
  const enLightDesktop = await axeCheck("buyer-only EN light desktop");
  report.fixtures.push({ fixture: "buyer-only", pass: "EN light desktop", violations: enLightDesktop.violations.length });

  // No selector for a single-membership fixture.
  const singleOrgCombobox = await client.evaluate(`Boolean(document.querySelector('[role="combobox"]'))`);
  assert(singleOrgCombobox === false, "single-membership fixture unexpectedly shows a selector combobox", { singleOrgCombobox });

  await client.evaluate(`document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark');`);
  await delays(150);
  const enDarkDesktop = await axeCheck("buyer-only EN dark desktop");
  report.fixtures.push({ fixture: "buyer-only", pass: "EN dark desktop", violations: enDarkDesktop.violations.length });
  await client.evaluate(`document.documentElement.classList.remove('dark'); document.documentElement.removeAttribute('data-theme');`);

  await viewport(client, 390, 844);
  await client.evaluate(`localStorage.setItem('hills-locale', 'ar')`);
  await goto(client, `${baseUrl}/dashboard/`);
  const arLightMobile = await axeCheck("buyer-only AR light mobile");
  report.fixtures.push({ fixture: "buyer-only", pass: "AR light mobile", violations: arLightMobile.violations.length, dir: arLightMobile.dir });
  assert(arLightMobile.dir === "rtl", "AR mobile did not enter RTL", arLightMobile);

  await client.evaluate(`document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark');`);
  await delays(150);
  const arDarkMobile = await axeCheck("buyer-only AR dark mobile");
  report.fixtures.push({ fixture: "buyer-only", pass: "AR dark mobile", violations: arDarkMobile.violations.length });
  await client.evaluate(`document.documentElement.classList.remove('dark'); document.documentElement.removeAttribute('data-theme'); localStorage.setItem('hills-locale', 'en');`);

  await client.send("Network.clearBrowserCookies");
  await client.evaluate("localStorage.clear()");

  // Multi-org fixture: a fresh sign-in with no acting-org cookie yet lands on the FORCED
  // OrganizationSelector first (`requiresOrganizationSelection`) — click through it, THEN the
  // compact switcher (this run's new T009 piece) must render on the resulting AppShell page.
  await viewport(client, 1440, 1000);
  await goto(client, `${baseUrl}/sign-in/`);
  await signIn("multi-org+foundation-test@example.com", password);
  await goto(client, `${baseUrl}/dashboard/`);
  const stillChoosing = await client.evaluate(`document.body.innerText.includes("Choose which organization")`);
  if (stillChoosing) {
    const orgRect = await client.evaluate(`(() => {
      const btn = document.querySelector('form button[type="submit"]');
      return btn ? btn.getBoundingClientRect().toJSON() : null;
    })()`);
    assert(orgRect !== null, "multi-org fixture showed no organization-selection button", { orgRect });
    const ox = orgRect.left + orgRect.width / 2;
    const oy = orgRect.top + orgRect.height / 2;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ox, y: oy });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ox, y: oy, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ox, y: oy, button: "left", clickCount: 1 });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const choosing = await client.evaluate(`document.body.innerText.includes("Choose which organization")`);
      if (!choosing) break;
      await delays(300);
    }
  }
  const multiOrgCheck = await axeCheck("multi-org EN light desktop");
  report.fixtures.push({ fixture: "multi-org", pass: "EN light desktop", violations: multiOrgCheck.violations.length });
  const switcherState = await client.evaluate(`(() => {
    const trigger = document.querySelector('[role="combobox"]');
    return { present: Boolean(trigger), ariaLabel: trigger?.getAttribute('aria-label') ?? null, text: trigger?.textContent ?? null };
  })()`);
  assert(switcherState.present === true, "multi-org fixture did not render the acting-organization switcher", switcherState);
  report.fixtures.push({ fixture: "multi-org", switcherState });

  await client.send("Network.clearBrowserCookies");
  await client.evaluate("localStorage.clear()");

  // Pending-kyb fixture: confirm the ineligible-state page (KybStatusScreen) is still what renders,
  // not the new overview, and it too passes axe.
  await goto(client, `${baseUrl}/sign-in/`);
  await signIn("pending-kyb+foundation-test@example.com", password);
  await goto(client, `${baseUrl}/dashboard/`);
  const pendingKybCheck = await axeCheck("pending-kyb EN light desktop");
  report.fixtures.push({ fixture: "pending-kyb", pass: "EN light desktop", violations: pendingKybCheck.violations.length });
  const noOverviewChrome = await client.evaluate(`Boolean(document.querySelector('[role="combobox"]'))`);
  assert(noOverviewChrome === false, "pending-kyb fixture unexpectedly rendered dashboard shell chrome", { noOverviewChrome });

  console.log("FEATURE-004-RUNB-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  report.consoleErrors = client.consoleErrors;
  report.pageErrors = client.pageErrors;
  await browser.close();
}

if (client.pageErrors.length > 0) {
  throw new Error(`Uncaught page errors during Feature 004 RUN B browser pass: ${JSON.stringify(client.pageErrors)}`);
}
