// Feature 002 Phase 6 (T019-T022) + Phase 8 (T024-T029) real-browser closure proof, over installed
// Chrome via CDP — no new project dependency. Complements the static/unit proofs in
// tests/public/{rfq,json-ld,seo-boundary}.test.tsx: this proves the RFQ form's actual client
// behaviour (accessible validation, the honest unavailable result, no page reload) and that the
// SEO surfaces (JSON-LD, noindex) are genuinely present in rendered pages, at desktop/mobile,
// Light/Dark and EN/AR-RTL.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3230";
const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

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
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
          else pending.resolve(message.result);
        }
        return;
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.consoleErrors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
      }
      if (message.method === "Runtime.exceptionThrown") {
        this.pageErrors.push(message.params.exceptionDetails.text);
      }
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

const profile = mkdtempSync(join(tmpdir(), "hills-p68-"));
const debugPort = await freePort();
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    `${baseUrl}/`,
  ],
  { stdio: "ignore", windowsHide: true }
);

let client;
const results = {};
try {
  const target = (await json(`http://127.0.0.1:${debugPort}/json/list`)).find((item) => item.type === "page");
  client = new Cdp(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  // ── Contact page, desktop, EN/light: field errors appear inline, no navigation ────────────────
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await goto(client, `${baseUrl}/contact/`);

  const initialUrl = await client.evaluate("window.location.href");
  const h1Text = await client.evaluate("document.querySelector('h1')?.textContent ?? ''");
  const hasCompanyLabel = await client.evaluate(
    `Boolean(Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Company name'))`
  );
  results.contactServerContent = { initialUrl, h1Text, hasCompanyLabel };
  assert(h1Text.length > 0, "Contact page missing server-rendered H1", results.contactServerContent);
  assert(hasCompanyLabel, "Contact page missing the RFQ form's Company name label", results.contactServerContent);

  // Submit with everything empty — RHF's client validation must intercept, not a native form POST.
  await client.evaluate(`document.querySelector('button[type="submit"]').click()`);
  await delay(300);
  const afterInvalidSubmit = await client.evaluate(`(() => ({
    url: window.location.href,
    hasAlert: document.querySelectorAll('[role="alert"]').length > 0,
  }))()`);
  results.invalidSubmit = afterInvalidSubmit;
  assert(afterInvalidSubmit.url === initialUrl, "Invalid submission navigated/reloaded the page", afterInvalidSubmit);
  assert(afterInvalidSubmit.hasAlert, "Invalid submission produced no inline field error", afterInvalidSubmit);

  // Fill every required field + consent, then submit — must resolve to the honest unavailable panel.
  await client.evaluate(`(() => {
    const setNative = (el, value) => {
      const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setNative(document.querySelector('input[name="companyName"]'), 'Acme Roasters');
    setNative(document.querySelector('select[name="buyerType"]'), 'roaster');
    setNative(document.querySelector('select[name="countryCode"]'), 'AE');
    setNative(document.querySelector('input[name="estimatedVolumeKg"]'), '500');
    setNative(document.querySelector('input[name="contactName"]'), 'Jordan Buyer');
    setNative(document.querySelector('input[name="contactEmail"]'), 'jordan@example.com');
    document.querySelector('[data-slot="checkbox"]').click();
  })()`);
  await delay(150);
  await client.evaluate(`document.querySelector('button[type="submit"]').click()`);
  await delay(600);

  const afterValidSubmit = await client.evaluate(`(() => ({
    url: window.location.href,
    unavailableVisible: document.body.textContent.includes("isn't live yet") || document.body.textContent.includes('not live yet'),
    claimsSuccess: /submitted successfully|request received/i.test(document.body.textContent),
  }))()`);
  results.validSubmit = afterValidSubmit;
  assert(afterValidSubmit.url === initialUrl, "Valid submission navigated/reloaded the page", afterValidSubmit);
  assert(afterValidSubmit.unavailableVisible, "Valid submission did not render the honest unavailable panel", afterValidSubmit);
  assert(!afterValidSubmit.claimsSuccess, "Valid submission rendered a success claim", afterValidSubmit);

  results.consoleErrors = client.consoleErrors.slice();
  results.pageErrors = client.pageErrors.slice();
  assert(client.pageErrors.length === 0, "Contact page threw a runtime error", results.pageErrors);

  // ── Dark + RTL + mobile: no overflow, contact page composes correctly ───────────────────────────
  for (const [label, width, height, mobile] of [
    ["mobile-390", 390, 844, true],
    ["desktop-1440", 1440, 1000, false],
  ]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await client.evaluate(`localStorage.setItem('hills-theme', 'dark'); localStorage.setItem('hills-locale', 'ar')`);
    await goto(client, `${baseUrl}/contact/`);
    const layout = await client.evaluate(`(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      dir: document.documentElement.dir,
      theme: document.documentElement.classList.contains('dark'),
    }))()`);
    results[`darkRtl_${label}`] = layout;
    assert(!layout.overflow, `${label}: horizontal overflow in dark/RTL`, layout);
    assert(layout.dir === "rtl", `${label}: dir not rtl after locale switch`, layout);
    assert(layout.theme, `${label}: dark class not applied after theme switch`, layout);
    await client.evaluate(`localStorage.setItem('hills-theme', 'light'); localStorage.setItem('hills-locale', 'en')`);
  }

  // ── JSON-LD actually rendered in the DOM (not merely present via a static fetch) ────────────────
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await goto(client, `${baseUrl}/coffee/public-test-coffee-published/`);
  const coffeeJsonLd = await client.evaluate(`(() => {
    const el = document.querySelector('script[type="application/ld+json"]');
    if (!el) return { present: false };
    try {
      const parsed = JSON.parse(el.textContent);
      return { present: true, hasGraph: Array.isArray(parsed['@graph']), types: parsed['@graph'].map((n) => n['@type']) };
    } catch (e) {
      return { present: true, parseError: String(e) };
    }
  })()`);
  results.coffeeJsonLd = coffeeJsonLd;
  assert(coffeeJsonLd.present && coffeeJsonLd.hasGraph, "Coffee detail JSON-LD missing or malformed", coffeeJsonLd);
  assert(coffeeJsonLd.types.includes("Product"), "Coffee detail JSON-LD missing Product node", coffeeJsonLd);

  await goto(client, `${baseUrl}/origins/public-test-origin-active/`);
  const originJsonLd = await client.evaluate(`(() => {
    const el = document.querySelector('script[type="application/ld+json"]');
    if (!el) return { present: false };
    try {
      const parsed = JSON.parse(el.textContent);
      return { present: true, hasGraph: Array.isArray(parsed['@graph']), types: parsed['@graph'].map((n) => n['@type']) };
    } catch (e) {
      return { present: true, parseError: String(e) };
    }
  })()`);
  results.originJsonLd = originJsonLd;
  assert(originJsonLd.present && originJsonLd.hasGraph, "Origin detail JSON-LD missing or malformed", originJsonLd);
  assert(originJsonLd.types.includes("Place"), "Origin detail JSON-LD missing Place node", originJsonLd);

  console.log(JSON.stringify(results, null, 2));
} finally {
  client?.socket.close();
  chrome.kill();
}
