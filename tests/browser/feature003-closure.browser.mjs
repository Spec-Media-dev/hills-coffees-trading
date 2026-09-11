// Feature 003 closure (T035/T036) — real Chrome browser proof, same CDP harness Feature 002's
// Phase 12 already established (tests/browser/cdp-harness.mjs). No external browser-automation
// dependency; this drives the machine's own installed Chrome headlessly against the ALREADY-RUNNING
// dev server (never a second instance — Next.js allows only one `next dev` per project directory).
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

const publicRoutes = ["/sign-in/", "/sign-up/", "/reset-password/", "/admin/sign-in/"];

const browser = await launchBrowser(`${baseUrl}/sign-in/`);
const { client } = browser;
const report = { accessibility: [], rtl: [], responsive: [], authenticated: [], consoleErrors: [] };

async function fillAndSubmit(email, pw) {
  // The dev server compiles each route on first visit — give client hydration real time to attach
  // event listeners before dispatching input/click, rather than trusting `document.readyState`.
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
  const readback = await client.evaluate(`(() => ({
    email: document.querySelector('input[name="email"]').value,
    password: document.querySelector('input[name="password"]').value.length,
  }))()`);
  const rect = await client.evaluate(`(() => document.querySelector('button[type="submit"]').getBoundingClientRect().toJSON())()`);
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const url = await client.evaluate("location.pathname");
    if (url !== "/sign-in/" && url !== "/admin/sign-in/") break;
    await delays(150);
  }
  await delays(400);
  const diag = await client.evaluate(`(() => ({
    pathname: location.pathname,
    toast: document.querySelector('[data-sonner-toast]')?.textContent ?? null,
    fieldErrors: Array.from(document.querySelectorAll('[role="alert"]')).map((el) => el.textContent),
    buttonText: document.querySelector('button[type="submit"]')?.textContent,
  }))()`);
  return { ...diag, readback, consoleErrors: [...client.consoleErrors], pageErrors: [...client.pageErrors] };
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // T035/T036 — public, unauthenticated Feature 003 surfaces: real axe pass + heading/landmark
  // structure + RTL entry, at mobile and desktop.
  for (const [label, width, height] of [["mobile", 390, 844], ["desktop", 1440, 1000]]) {
    await viewport(client, width, height);
    for (const route of publicRoutes) {
      await goto(client, `${baseUrl}${route}`);
      const result = await client.evaluate(`(async () => {
        const axeResult = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]));
        const h1Count = headings.filter((level) => level === 1).length;
        const root = document.documentElement;
        return {
          violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
          h1Count,
          main: Boolean(document.querySelector('main')),
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
        };
      })()`);
      assert(result.violations.length === 0, `axe WCAG violation on ${route} (${label})`, result);
      assert(result.h1Count === 1 && result.main, `heading/landmark failure on ${route} (${label})`, result);
      assert(result.scrollWidth <= result.clientWidth + 1, `horizontal overflow on ${route} (${label})`, result);
      report.accessibility.push({ route, label, violations: result.violations.length });
    }
  }

  // RTL entry — real Arabic locale preference, same technique Phase 12 established.
  await viewport(client, 390, 844);
  for (const route of publicRoutes) {
    await client.evaluate(`localStorage.setItem('hills-locale', 'ar')`);
    await goto(client, `${baseUrl}${route}`);
    const rtl = await client.evaluate(`(() => {
      const root = document.documentElement;
      return { dir: root.dir, clientWidth: root.clientWidth, scrollWidth: root.scrollWidth };
    })()`);
    assert(rtl.dir === "rtl", `${route} did not enter RTL`, rtl);
    assert(rtl.scrollWidth <= rtl.clientWidth + 1, `${route} RTL overflow`, rtl);
    report.rtl.push({ route, ...rtl });
  }
  await client.evaluate(`localStorage.setItem('hills-locale', 'en')`);

  if (!password) {
    report.authenticated.push({ skipped: true, reason: "TEST_FIXTURE_PASSWORD not available in this environment" });
  } else {
    // Real authenticated pass — buyer-only (ACTIVE + APPROVED, no MFA factor): /dashboard/,
    // /dashboard/settings/. Real form fill + real submit + real cookie session, not a mock.
    await viewport(client, 1440, 1000);
    await goto(client, `${baseUrl}/sign-in/`);
    const diag1 = await fillAndSubmit("buyer-only+foundation-test@example.com", password);
    assert(diag1.pathname === "/dashboard/", "buyer-only sign-in did not land on /dashboard/", diag1);

    for (const route of ["/dashboard/", "/dashboard/settings/"]) {
      await goto(client, `${baseUrl}${route}`);
      const result = await client.evaluate(`(async () => {
        const axeResult = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
        return { violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })) };
      })()`);
      assert(result.violations.length === 0, `axe WCAG violation on authenticated ${route}`, result);
      report.authenticated.push({ route, fixture: "buyer-only", violations: result.violations.length });
    }

    // Clear the session (real cookie/storage clear via CDP) before the next fixture's session —
    // equivalent to a real sign-out for this browser profile's purposes.
    await client.send("Network.clearBrowserCookies");
    await client.evaluate("localStorage.clear()");

    // Real authenticated pass — pending-kyb (org PENDING_KYB, an incomplete DRAFT application):
    // /dashboard/kyb/ draft screen.
    await goto(client, `${baseUrl}/sign-in/`);
    const diag2 = await fillAndSubmit("pending-kyb+foundation-test@example.com", password);
    assert(diag2.pathname === "/dashboard/", "pending-kyb sign-in did not land on /dashboard/", diag2);

    for (const route of ["/dashboard/", "/dashboard/kyb/"]) {
      await goto(client, `${baseUrl}${route}`);
      const result = await client.evaluate(`(async () => {
        const axeResult = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
        return { violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })) };
      })()`);
      assert(result.violations.length === 0, `axe WCAG violation on authenticated ${route} (pending-kyb)`, result);
      report.authenticated.push({ route, fixture: "pending-kyb", violations: result.violations.length });
    }

    await client.send("Network.clearBrowserCookies");
    await client.evaluate("localStorage.clear()");
  }

  console.log("FEATURE-003-CLOSURE-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  report.consoleErrors = client.consoleErrors;
  report.pageErrors = client.pageErrors;
  await browser.close();
}

if (client.pageErrors.length > 0) {
  throw new Error(`Uncaught page errors during Feature 003 browser closure pass: ${JSON.stringify(client.pageErrors)}`);
}
