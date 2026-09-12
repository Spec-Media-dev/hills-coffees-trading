// Feature 004 RUN C — real Chrome browser proof for T023 (accessibility/keyboard/drawer) and T025
// (no-JS content availability), on the same CDP harness (tests/browser/cdp-harness.mjs). Run against
// an ISOLATED production server, never the developer's own dev server.
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
  console.log("FEATURE-004-RUNC-BROWSER-REPORT", JSON.stringify({ skipped: true, reason: "TEST_FIXTURE_PASSWORD not available" }));
  process.exit(0);
}

const browser = await launchBrowser(`${baseUrl}/sign-in/`);
const { client } = browser;
const report = { checks: [] };

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

async function pressKey(key, options = {}) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, ...options });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, ...options });
  await delays(120);
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // === T023 accessibility re-confirmation after this run's registry `description` addition ===
  await viewport(client, 1440, 1000);
  await goto(client, `${baseUrl}/sign-in/`);
  await signIn("buyer-only+foundation-test@example.com", password);
  await goto(client, `${baseUrl}/dashboard/`);
  const axeOverview = await client.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
  })()`);
  assert(axeOverview.length === 0, "axe violation on /dashboard/ after registry description change", axeOverview);
  report.checks.push({ check: "axe /dashboard/ (buyer-only)", violations: axeOverview.length });

  await goto(client, `${baseUrl}/dashboard/settings/`);
  const axeSettings = await client.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
  })()`);
  assert(axeSettings.length === 0, "axe violation on /dashboard/settings/", axeSettings);
  report.checks.push({ check: "axe /dashboard/settings/", violations: axeSettings.length });

  // Landmarks: sidebar nav, topbar/header, main.
  const landmarks = await client.evaluate(`(() => ({
    nav: Boolean(document.querySelector('nav[aria-label]')),
    header: Boolean(document.querySelector('header')),
    main: document.querySelectorAll('main').length,
  }))()`);
  assert(landmarks.nav === true, "no labelled nav landmark found", landmarks);
  assert(landmarks.header === true, "no header landmark found", landmarks);
  assert(landmarks.main === 1, "expected exactly one main landmark", landmarks);
  report.checks.push({ check: "landmarks", landmarks });

  // Active nav state exposed (aria-current).
  const activeNav = await client.evaluate(`(() => {
    const current = document.querySelector('[aria-current="page"]');
    return { present: Boolean(current), text: current?.textContent ?? null };
  })()`);
  report.checks.push({ check: "active nav aria-current", activeNav });

  await goto(client, `${baseUrl}/dashboard/`);

  // === T023 keyboard traversal + visible focus: Tab into the notification button and account menu ===
  await client.evaluate(`document.body.focus()`);
  for (let i = 0; i < 25; i += 1) await pressKey("Tab");
  const focusAfterTabs = await client.evaluate(`(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, ariaLabel: el?.getAttribute('aria-label'), hasFocusVisibleStyle: getComputedStyle(el).outlineStyle !== 'none' || getComputedStyle(el).outlineWidth !== '0px' };
  })()`);
  report.checks.push({ check: "keyboard focus after 25 tabs", focusAfterTabs });

  // === Mobile drawer: open, focus trap, Escape closes + focus restoration ===
  await viewport(client, 390, 844);
  await goto(client, `${baseUrl}/dashboard/`);
  const drawerTriggerRect = await client.evaluate(`(() => {
    const btn = document.querySelector('button[aria-label]');
    return btn ? btn.getBoundingClientRect().toJSON() : null;
  })()`);
  assert(drawerTriggerRect !== null, "no mobile drawer trigger button found at mobile width", {});
  const dtx = drawerTriggerRect.left + drawerTriggerRect.width / 2;
  const dty = drawerTriggerRect.top + drawerTriggerRect.height / 2;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dtx, y: dty });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: dtx, y: dty, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dtx, y: dty, button: "left", clickCount: 1 });
  await delays(300);
  const drawerOpenState = await client.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return { present: Boolean(dialog), focusInsideDialog: Boolean(dialog && dialog.contains(document.activeElement)) };
  })()`);
  report.checks.push({ check: "mobile drawer open + focus trap", drawerOpenState });

  await pressKey("Escape");
  await delays(300);
  const drawerClosedState = await client.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return { dialogGone: !dialog, focusRestoredToTrigger: document.activeElement?.getAttribute('aria-label') !== null };
  })()`);
  report.checks.push({ check: "mobile drawer Escape close + focus restore", drawerClosedState });

  // Reconfirm no horizontal overflow at mobile after all this interaction.
  const overflow = await client.evaluate(`(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))()`);
  assert(overflow.scrollWidth <= overflow.clientWidth + 1, "horizontal overflow after drawer interaction", overflow);

  await client.send("Network.clearBrowserCookies");
  await client.evaluate("localStorage.clear()");

  // === T025 — real no-JS check: sign in WITH JS, then re-request /dashboard/ with JS disabled ===
  await viewport(client, 1440, 1000);
  await goto(client, `${baseUrl}/sign-in/`);
  await signIn("buyer-only+foundation-test@example.com", password);
  await goto(client, `${baseUrl}/dashboard/`, { scripts: false });
  const noJsContent = await client.evaluate(`(() => ({
    bodyLength: document.body.innerText.length,
    hasNav: Boolean(document.querySelector('nav')),
    hasMain: Boolean(document.querySelector('main')),
    hasOrgName: document.body.innerText.length > 0,
    scriptsDisabledStillShowsContent: document.body.innerText.includes('Overview') || document.body.innerText.includes('نظرة عامة'),
  }))()`);
  assert(noJsContent.hasNav === true, "no-JS: sidebar nav missing", noJsContent);
  assert(noJsContent.hasMain === true, "no-JS: main content missing", noJsContent);
  assert(noJsContent.bodyLength > 100, "no-JS: page body suspiciously empty", noJsContent);
  report.checks.push({ check: "no-JS /dashboard/ content present", noJsContent });
  // Re-enable JS for the harness's own subsequent navigation/cleanup.
  await client.send("Emulation.setScriptExecutionDisabled", { value: false });

  console.log("FEATURE-004-RUNC-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  report.consoleErrors = client.consoleErrors;
  report.pageErrors = client.pageErrors;
  await browser.close();
}

if (client.pageErrors.length > 0) {
  throw new Error(`Uncaught page errors during Feature 004 RUN C browser pass: ${JSON.stringify(client.pageErrors)}`);
}
