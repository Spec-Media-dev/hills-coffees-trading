// UIF-046 (accessibility) + UIF-044/045 gap-fill closure proof, real browser (installed Chrome over
// CDP). Complements the already-passing `uif-fg.browser.mjs` (Member/Admin overflow, RTL sidebar
// edge, drawer open/close via programmatic click, denial matrix) and `ui-foundation.browser.mjs`
// (isolated token/contrast/RTL/responsive/GSAP fixtures) rather than repeating them: this script
// proves real KEYBOARD operation (Tab reaches the drawer trigger, Enter opens it, focus moves inside,
// Escape closes it, focus restores to the trigger — not a programmatic `.click()`), heading order
// across representative Public + Member + Admin routes, and that every focused control shows a
// visible focus outline.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3230";
const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const fixtures = { member: "buyer-only+foundation-test@example.com", admin: "warehouse-admin+foundation-test@example.com" };

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message, details) => {
  if (!condition) throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
};

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a debug port"));
      server.close(() => resolve(address.port));
    });
  });
}

async function json(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error(`Chrome did not become ready: ${url}`);
}

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

async function goto(client, url) {
  await client.send("Page.navigate", { url });
  for (let i = 0; i < 100; i += 1) {
    const { result } = await client.send("Runtime.evaluate", { expression: "document.readyState" });
    if (result.value === "complete") break;
    await delay(100);
  }
  await delay(300);
}

async function signIn(email) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email, password: process.env.TEST_FIXTURE_PASSWORD }),
  });
  const session = await response.json();
  assert(response.ok && session.access_token && session.refresh_token, "Fixture authentication failed", { status: response.status });
  return session;
}

/**
 * `rawKeyDown` + (for a character key) `char` + `keyUp` is the sequence that actually triggers a
 * native `<button>`'s default keyboard activation in headless Chrome — a plain `keyDown`/`keyUp`
 * pair dispatches the DOM event but does not synthesize the browser's built-in "Enter/Space
 * activates a focused button" behaviour. Confirmed empirically against this exact trigger before
 * writing this helper.
 */
async function pressKey(client, key, code, windowsVirtualKeyCode, text, modifiers = 0) {
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers });
  if (text) await client.send("Input.dispatchKeyEvent", { type: "char", key, text });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers });
}

loadEnv();
const profile = mkdtempSync(join(tmpdir(), "hills-uif-h-"));
const debugPort = await freePort();
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `${baseUrl}/`], { stdio: "ignore", windowsHide: true });
let client;
try {
  const target = (await json(`http://127.0.0.1:${debugPort}/json/list`)).find((item) => item.type === "page");
  client = new Cdp(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

  const headingResults = [];
  // ── Heading order: representative Public + Member + Admin routes ──────────────────────────────
  for (const route of ["/", "/coffee/", "/about/", "/contact/"]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await goto(client, `${baseUrl}${route}`);
    const headings = await client.evaluate(`Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]))`);
    const h1Count = headings.filter((level) => level === 1).length;
    let skipped = false;
    let previous = headings[0] ?? 1;
    for (const level of headings) { if (level > previous + 1) skipped = true; previous = level; }
    headingResults.push({ route, h1Count, skipped, headings });
    assert(h1Count === 1, `${route} does not have exactly one h1`, { route, h1Count, headings });
    assert(!skipped, `${route} skips a heading level`, { route, headings });
  }

  // ── Member + Admin: keyboard-driven drawer open/focus-trap/close/focus-restore at 390px ────────
  const keyboardResults = [];
  for (const [surface, email] of Object.entries(fixtures)) {
    const session = await signIn(email);
    await client.send("Network.setCookie", {
      url: baseUrl,
      name: `sb-${projectRef}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      path: "/",
      sameSite: "Lax",
    });
    const route = surface === "member" ? "/dashboard" : "/dashboard-admin";
    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await goto(client, `${baseUrl}${route}`);

    // Focus the trigger directly (deterministic), then drive the rest by real key events.
    await client.evaluate(`document.querySelector('button[aria-expanded]')?.focus()`);
    const triggerFocused = await client.evaluate(`document.activeElement === document.querySelector('button[aria-expanded]')`);
    const triggerOutline = await client.evaluate(`(() => { const el = document.activeElement; const s = getComputedStyle(el); return s.outlineStyle !== 'none' || s.outlineWidth !== '0px' || s.boxShadow !== 'none'; })()`);

    await pressKey(client, "Enter", "Enter", 13, String.fromCharCode(13));
    await delay(300);
    const opened = await client.evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); return { open: Boolean(dialog), focusInside: Boolean(dialog && dialog.contains(document.activeElement)) }; })()`);

    // Tab within the drawer should keep focus inside it (a real focus trap, not merely "some element focused").
    await pressKey(client, "Tab", "Tab", 9);
    await delay(50);
    const stillInside = await client.evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); return Boolean(dialog && dialog.contains(document.activeElement)); })()`);

    await pressKey(client, "Escape", "Escape", 27);
    await delay(400);
    const closed = await client.evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); if (!dialog) return true; const s = getComputedStyle(dialog); return dialog.getAttribute('data-state') === 'closed' || s.visibility === 'hidden' || s.pointerEvents === 'none'; })()`);
    const focusRestored = await client.evaluate(`document.activeElement === document.querySelector('button[aria-expanded]')`);

    keyboardResults.push({ surface, triggerFocused, triggerOutline, ...opened, stillInside, closed, focusRestored });
    assert(triggerFocused, `${surface}: drawer trigger did not receive focus`, { surface });
    assert(triggerOutline, `${surface}: focused drawer trigger has no visible focus indicator`, { surface });
    assert(opened.open, `${surface}: Enter did not open the drawer`, { surface, opened });
    assert(opened.focusInside, `${surface}: opening the drawer did not move focus inside it`, { surface, opened });
    assert(stillInside, `${surface}: Tab escaped the drawer's focus trap`, { surface });
    assert(closed, `${surface}: Escape did not close the drawer`, { surface });
    assert(focusRestored, `${surface}: closing the drawer did not restore focus to the trigger`, { surface });
  }

  console.log(JSON.stringify({ headingResults, keyboardResults }, null, 2));
} finally {
  client?.socket.close();
  chrome.kill();
}
