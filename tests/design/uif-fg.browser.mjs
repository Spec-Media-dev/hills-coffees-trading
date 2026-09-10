import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3004";
const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const fixtures = {
  member: "buyer-only+foundation-test@example.com",
  admin: "warehouse-admin+foundation-test@example.com",
};

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
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function goto(client, url) {
  await client.send("Page.navigate", { url });
  // The app's authenticated server render may refresh the session cookie before `complete`; a
  // bounded post-navigation delay avoids probing Runtime while that navigation context is replaced.
  await delay(750);
}

async function signIn(email) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: process.env.TEST_FIXTURE_PASSWORD }),
  });
  const session = await response.json();
  assert(response.ok && session.access_token && session.refresh_token, "Fixture authentication failed", { status: response.status });
  return session;
}

loadEnv();
const profile = mkdtempSync(join(tmpdir(), "hills-uif-fg-"));
const debugPort = await freePort();
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `${baseUrl}/dashboard`], { stdio: "ignore", windowsHide: true });
let client;
try {
  const target = (await json(`http://127.0.0.1:${debugPort}/json/list`)).find((item) => item.type === "page");
  client = new Cdp(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const failures = [];
  const browserIssues = [];
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      browserIssues.push({ type: `console.${message.params.type}`, args: message.params.args?.map((arg) => arg.value ?? arg.description ?? "") });
    }
    if (message.method === "Runtime.exceptionThrown") {
      browserIssues.push({ type: "page-exception", details: message.params.exceptionDetails });
    }
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
      browserIssues.push({ type: `log.${message.params.entry.level}`, text: message.params.entry.text });
    }
    if (message.method === "Page.javascriptDialogOpening") {
      browserIssues.push({ type: "javascript-dialog", message: message.params.message });
    }
  });
  await client.send("Runtime.addBinding", { name: "uifProofError" });
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.bindingCalled" && message.params.name === "uifProofError") failures.push(message.params.payload);
  });

  const results = [];
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
    for (const width of [390, 768, 1440]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width === 390 });
      await goto(client, `${baseUrl}${route}`);
      for (const dark of [false, true]) {
        for (const rtl of [false, true]) {
          const result = await client.evaluate(`(() => {
            const root = document.documentElement;
            root.classList.toggle("dark", ${dark});
            root.lang = ${rtl ? '"ar"' : '"en"'};
            root.dir = ${rtl ? '"rtl"' : '"ltr"'};
            const sidebar = document.querySelector("nav[aria-label]");
            const topbar = document.querySelector("header");
            const title = document.querySelector("h1");
            const menu = document.querySelector('button[aria-label]');
            const rect = (element) => element ? (() => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; })() : null;
            return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, sidebar: rect(sidebar), topbar: rect(topbar), title: rect(title), menu: rect(menu), theme: root.classList.contains("dark"), dir: root.dir, lang: root.lang };
          })()`);
          assert(result.scrollWidth === result.clientWidth, `${surface} overflow at ${width}px`, result);
          assert(result.topbar && result.topbar.width > 0 && result.topbar.height > 0 && result.topbar.left >= 0 && result.topbar.right <= result.clientWidth, `${surface} topbar is not visible at ${width}px`, result);
          assert(result.title && result.title.left >= 0 && result.title.right <= result.clientWidth, `${surface} title clips at ${width}px`, result);
          if (width < 1024) assert(result.menu && result.menu.width >= 44 && result.menu.height >= 44, `${surface} mobile menu is inaccessible at ${width}px`, result);
          if (width >= 1024) {
            assert(result.sidebar && result.sidebar.width > 0, `${surface} desktop sidebar missing at ${width}px`, result);
            if (rtl) assert(Math.abs(result.sidebar.right - result.clientWidth) <= 1, `${surface} RTL sidebar is not at inline-end at ${width}px`, result);
          }
          results.push({ surface, width, dark, rtl, ...result });
        }
      }
      if (width === 390) {
        await client.evaluate(`document.querySelector('button[aria-expanded]')?.click()`);
        await delay(100);
        const drawer = await client.evaluate(`(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const navigation = dialog?.querySelector('nav[aria-label]');
          return { open: Boolean(dialog), navigation: Boolean(navigation), width: dialog?.getBoundingClientRect().width ?? 0 };
        })()`);
        assert(drawer.open && drawer.navigation && drawer.width > 0, `${surface} mobile drawer did not open`, drawer);
        await client.evaluate(`document.querySelector('[role="dialog"] button[aria-label]')?.click()`);
        await delay(400);
        const closed = await client.evaluate(`(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return true;
          const style = getComputedStyle(dialog);
          return dialog.getAttribute('data-state') === 'closed' || style.visibility === 'hidden' || style.pointerEvents === 'none';
        })()`);
        assert(closed, `${surface} mobile drawer did not close`, { surface });
      }
    }
  }
  const authorizedSettings = [];
  await client.send("Network.clearBrowserCookies");
  const memberSession = await signIn(fixtures.member);
  await client.send("Network.setCookie", {
    url: baseUrl,
    name: `sb-${projectRef}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(memberSession)).toString("base64url")}`,
    path: "/",
    sameSite: "Lax",
  });
  for (const route of ["/dashboard/settings", "/dashboard/settings/"]) {
    await goto(client, `${baseUrl}${route}`);
    const surface = await client.evaluate(`({
      denied: Boolean(document.querySelector('[data-state-screen="unauthorized"], [data-state-screen="forbidden"]')),
      pathname: location.pathname,
      body: document.body.innerText.slice(0, 500),
    })`);
    assert(!surface.denied && surface.pathname === "/dashboard/settings/", `Authorized member settings failed for ${route}`, { route, surface });
    authorizedSettings.push({ route, ...surface });
  }
  const authorizedShells = [];
  for (const [surface, email, routes] of [
    ["member", fixtures.member, ["/dashboard", "/dashboard/"]],
    ["admin", fixtures.admin, ["/dashboard-admin", "/dashboard-admin/"]],
  ]) {
    await client.send("Network.clearBrowserCookies");
    const session = await signIn(email);
    await client.send("Network.setCookie", {
      url: baseUrl,
      name: `sb-${projectRef}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      path: "/",
      sameSite: "Lax",
    });
    for (const route of routes) {
      await goto(client, `${baseUrl}${route}`);
      const shell = await client.evaluate(`({
        denied: Boolean(document.querySelector('[data-state-screen="unauthorized"], [data-state-screen="forbidden"]')),
        pathname: location.pathname,
        body: document.body.innerText.slice(0, 500),
      })`);
      const expectedPath = surface === "member" ? "/dashboard/" : "/dashboard-admin/";
      assert(!shell.denied && shell.pathname === expectedPath, `Authorized ${surface} shell failed for ${route}`, { route, shell });
      authorizedShells.push({ surface, route, ...shell });
    }
  }
  const denialChecks = [
    { cookie: null, route: "/dashboard" },
    { cookie: null, route: "/dashboard/" },
    { cookie: null, route: "/dashboard/settings" },
    { cookie: null, route: "/dashboard/settings/" },
    { cookie: null, route: "/dashboard-admin" },
    { cookie: null, route: "/dashboard-admin/" },
    { cookie: fixtures.member, route: "/dashboard-admin" },
    { cookie: fixtures.member, route: "/dashboard-admin/" },
    { cookie: fixtures.admin, route: "/dashboard" },
    { cookie: fixtures.admin, route: "/dashboard/" },
    { cookie: fixtures.admin, route: "/dashboard/settings" },
    { cookie: fixtures.admin, route: "/dashboard/settings/" },
  ];
  const denials = [];
  for (const check of denialChecks) {
    // Supabase may chunk a session across `.0`, `.1`, … cookies. Clear the whole browser jar before
    // every denial case so an old chunk cannot silently authenticate the next navigation.
    await client.send("Network.clearBrowserCookies");
    if (check.cookie) {
      const session = await signIn(check.cookie);
      await client.send("Network.setCookie", {
        url: baseUrl,
        name: `sb-${projectRef}-auth-token`,
        value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
        path: "/",
        sameSite: "Lax",
      });
    }
    await goto(client, `${baseUrl}${check.route}`);
    const denialSurface = await client.evaluate(`({
      denied: Boolean(document.querySelector('[data-state-screen="unauthorized"], [data-state-screen="forbidden"]')),
      pathname: location.pathname,
      body: document.body.innerText.slice(0, 500),
    })`);
    assert(denialSurface.denied || denialSurface.pathname === "/", `Route protection failed for ${check.route}`, { check, denialSurface });
    denials.push({ check, ...denialSurface });
  }
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reduced = await client.evaluate(`(() => ["--dur-instant", "--dur-fast", "--dur-base", "--dur-slow"].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()))()`);
  assert(reduced.every((value) => value === "1ms"), "Reduced motion tokens are not collapsed", reduced);
  assert(failures.length === 0 && browserIssues.length === 0, "Browser reported console/runtime issues", { failures, browserIssues });
  console.log(JSON.stringify({ scenarios: results.length, authorizedSettings, authorizedShells, denialChecks: denialChecks.length, denials, reduced, failures, browserIssues }, null, 2));
} finally {
  client?.close();
  if (chrome.exitCode === null) { chrome.kill(); await Promise.race([once(chrome, "exit"), delay(2000)]); }
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
