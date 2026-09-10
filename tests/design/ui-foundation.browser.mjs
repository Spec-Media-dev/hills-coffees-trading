import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3230/";
const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function jsonEndpoint(url) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error(`Chrome endpoint did not become ready: ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
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
        if (!pending) return;
        this.pending.delete(message.id);
        return message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      }
      const listeners = this.events.get(message.method) ?? [];
      this.events.delete(message.method);
      listeners.forEach((resolve) => resolve(message.params));
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => this.events.set(method, [...(this.events.get(method) ?? []), resolve]));
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
}

const profile = mkdtempSync(join(tmpdir(), "hills-ui-proof-"));
const port = await freePort();
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=390,844",
  baseUrl,
], { stdio: "ignore", windowsHide: true });

let client;
try {
  const targets = await jsonEndpoint(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No page target found");
  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  async function setViewport(width, height, mobile = false) {
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.reload", { ignoreCache: true });
    await loaded;
    await client.evaluate("document.fonts.ready.then(() => true)");
  }

  await setViewport(390, 844, true);
  const mobile = await client.evaluate(`(() => {
    const root = document.documentElement;
    const heading = document.querySelector("h1");
    // A public CTA may be rendered as a native button or as the accessible link produced by the
    // Hills Button primitive. Verify the visible control, not an element-specific implementation.
    const button = [...document.querySelectorAll('[data-slot="button"], main a[href]')]
      .find((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const paragraph = document.querySelector("main p");
    root.dir = "rtl";
    root.lang = "ar";
    paragraph.textContent = "هذه فقرة عربية طويلة للغاية لاختبار التفاف المحتوى بصورة صحيحة داخل شاشة هاتف ضيقة من دون قص النص أو إنشاء تمرير أفقي غير مقصود.".repeat(4);
    const h = heading.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const hStyle = getComputedStyle(heading);
    const bodyStyle = getComputedStyle(document.body);
    const pStyle = getComputedStyle(paragraph);
    return {
      viewport: innerWidth,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      heading: { left: h.left, right: h.right, width: h.width, font: hStyle.fontFamily, fontSize: hStyle.fontSize, tracking: hStyle.letterSpacing },
      button: { left: b.left, right: b.right, width: b.width, height: b.height },
      body: { font: bodyStyle.fontFamily, lineHeight: bodyStyle.lineHeight, fontSize: bodyStyle.fontSize },
      paragraph: { scrollWidth: paragraph.scrollWidth, clientWidth: paragraph.clientWidth, overflowWrap: pStyle.overflowWrap },
      layoutShift: performance.getEntriesByType("layout-shift").reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : entry.value), 0),
    };
  })()`);
  assert(mobile.viewport === 390 && mobile.scrollWidth === mobile.clientWidth, "390px page has horizontal overflow", mobile);
  assert(mobile.heading.left >= 0 && mobile.heading.right <= mobile.clientWidth, "RTL heading is clipped", mobile);
  assert(mobile.button.left >= 0 && mobile.button.right <= mobile.clientWidth && mobile.button.height >= 44, "RTL button is clipped or undersized", mobile);
  assert(mobile.paragraph.scrollWidth === mobile.paragraph.clientWidth, "Long RTL content does not wrap", mobile);
  assert(mobile.heading.font.toLowerCase().includes("readex") && mobile.body.font.toLowerCase().includes("cairo"), "Arabic fonts did not resolve", mobile);
  assert(mobile.heading.tracking === "-0.005em" || Math.abs(Number.parseFloat(mobile.heading.tracking) / Number.parseFloat(mobile.heading.fontSize) + 0.005) < 0.001, "RTL display tracking is not -0.005em", mobile);
  assert(Math.abs(Number.parseFloat(mobile.body.lineHeight) / Number.parseFloat(mobile.body.fontSize) - 1.8) < 0.01, "RTL body line-height is not 1.8", mobile);
  assert(mobile.layoutShift === 0, "Font swap caused a layout shift", mobile);

  const mobileTable = await client.evaluate(`(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = '<div data-proof="table" class="hidden overflow-hidden md:block"></div><div data-proof="cards" class="grid min-w-0 gap-3 md:hidden"><article class="min-w-0 break-words">' + "بيانات عربية طويلة ".repeat(30) + '</article></div>';
    document.body.append(fixture);
    const result = {
      tableDisplay: getComputedStyle(fixture.querySelector('[data-proof="table"]')).display,
      cardsDisplay: getComputedStyle(fixture.querySelector('[data-proof="cards"]')).display,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
    fixture.remove();
    return result;
  })()`);
  assert(mobileTable.tableDisplay === "none" && mobileTable.cardsDisplay === "grid" && mobileTable.scrollWidth === mobileTable.clientWidth, "390px table did not transform to a non-scrolling card list", mobileTable);

  const direction = await client.evaluate(`(() => {
    const directional = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    directional.dataset.directionalIcon = "true";
    const fixed = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.append(directional, fixed);
    const result = {
      directional: getComputedStyle(directional).transform,
      fixed: getComputedStyle(fixed).transform,
    };
    directional.remove();
    fixed.remove();
    return result;
  })()`);
  assert(direction.directional !== "none" && direction.fixed === "none", "RTL icon direction contract failed", direction);

  const contrast = await client.evaluate(`(() => {
    const root = document.documentElement;
    const pairs = ["draft", "pending", "review", "paid", "transit", "complete", "cancelled", "danger"];
    const channel = (value) => {
      value /= 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (colour) => {
      const values = colour.match(/[\\d.]+/g).slice(0, 3).map(Number);
      return 0.2126 * channel(values[0]) + 0.7152 * channel(values[1]) + 0.0722 * channel(values[2]);
    };
    const measure = (theme) => {
      root.classList.toggle("dark", theme === "dark");
      return Object.fromEntries(pairs.map((name) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--status-" + name + ")";
        probe.style.backgroundColor = "var(--status-" + name + "-surface)";
        document.body.append(probe);
        const style = getComputedStyle(probe);
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
        probe.remove();
        return [name, (values[0] + 0.05) / (values[1] + 0.05)];
      }));
    };
    const result = { light: measure("light"), dark: measure("dark") };
    root.classList.remove("dark");
    return result;
  })()`);
  assert(Object.values(contrast.light).every((ratio) => ratio >= 4.5), "Light status contrast is below WCAG AA", contrast);
  assert(Object.values(contrast.dark).every((ratio) => ratio >= 4.5), "Dark status contrast is below WCAG AA", contrast);

  const tokens = await client.evaluate(`(() => {
    const root = document.documentElement;
    const names = [
      "--surface-raised", "--surface-subtle", "--surface-inverse", "--gold-on-light", "--gold-on-dark",
      "--primary-hover", "--primary-active", "--border-strong", "--border-subtle", "--overlay",
      "--scrim-top", "--scrim-bottom", "--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl",
      "--status-draft", "--status-pending", "--status-review", "--status-paid", "--status-transit",
      "--status-complete", "--status-cancelled", "--status-danger",
    ];
    const read = (theme) => {
      root.classList.toggle("dark", theme === "dark");
      const style = getComputedStyle(root);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
    };
    const result = { light: read("light"), dark: read("dark") };
    root.classList.remove("dark");
    return result;
  })()`);
  assert(Object.values(tokens.light).every(Boolean) && Object.values(tokens.dark).every(Boolean), "Foundation tokens do not resolve in both themes", tokens);

  const surfaces = await client.evaluate(`(() => {
    const root = document.documentElement;
    const host = document.createElement("div");
    host.innerHTML = '<article data-proof="card" class="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 shadow-[var(--shadow-xs)]"><input data-proof="input" class="h-11 w-full rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-4"><span data-proof="status" class="inline-flex rounded-[var(--radius-pill)] bg-[var(--status-paid-surface)] px-2.5 py-1 text-[var(--status-paid)]"><i class="size-1.5 rounded-full bg-current"></i>Paid</span></article>';
    document.body.append(host);
    const read = (theme) => {
      root.classList.toggle("dark", theme === "dark");
      const card = getComputedStyle(host.querySelector('[data-proof="card"]'));
      const input = getComputedStyle(host.querySelector('[data-proof="input"]'));
      const status = getComputedStyle(host.querySelector('[data-proof="status"]'));
      return { cardBackground: card.backgroundColor, cardRadius: card.borderRadius, inputHeight: input.height, statusColour: status.color, statusBackground: status.backgroundColor };
    };
    const result = { light: read("light"), dark: read("dark") };
    root.classList.remove("dark");
    host.remove();
    return result;
  })()`);
  assert(surfaces.light.cardRadius === "14px" && surfaces.light.inputHeight === "44px", "Foundation surface sizing failed", surfaces);
  assert(surfaces.light.cardBackground !== surfaces.dark.cardBackground && surfaces.light.statusColour !== surfaces.dark.statusColour, "Representative Light/Dark rendering did not diverge through role tokens", surfaces);

  await setViewport(768, 900, false);
  const tablet = await client.evaluate(`(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = '<div data-proof="table" class="hidden overflow-hidden md:block"></div><div data-proof="cards" class="grid min-w-0 gap-3 md:hidden"></div>';
    document.body.append(fixture);
    const result = {
      viewport: innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      tableDisplay: getComputedStyle(fixture.querySelector('[data-proof="table"]')).display,
      cardsDisplay: getComputedStyle(fixture.querySelector('[data-proof="cards"]')).display,
    };
    fixture.remove();
    return result;
  })()`);
  assert(tablet.scrollWidth === tablet.clientWidth && tablet.tableDisplay === "block" && tablet.cardsDisplay === "none", "Tablet table transformation failed", tablet);

  await setViewport(1600, 1000, false);
  const desktop = await client.evaluate(`(() => {
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
    const container = document.querySelector(".hc-container");
    const h1 = document.querySelector("h1");
    const body = getComputedStyle(document.body);
    const rect = container.getBoundingClientRect();
    const band = document.querySelector("main > section");
    const bandRect = band?.getBoundingClientRect();
    return { viewport: innerWidth, clientWidth: document.documentElement.clientWidth, width: rect.width, left: rect.left, right: document.documentElement.clientWidth - rect.right, fullBleedWidth: bandRect?.width, h1Font: getComputedStyle(h1).fontFamily, bodyFont: body.fontFamily };
  })()`);
  assert(desktop.width === 1536 && Math.abs(desktop.left - desktop.right) < 0.01, "96rem container is not centered at 1600px", desktop);
  assert(desktop.fullBleedWidth === desktop.clientWidth, "Full-bleed band does not span the viewport", desktop);
  assert(desktop.h1Font.toLowerCase().includes("benito") && desktop.bodyFont.toLowerCase().includes("manrope"), "Latin brand fonts did not resolve", desktop);

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reduced = await client.evaluate(`(() => {
    const root = getComputedStyle(document.documentElement);
    const button = getComputedStyle(document.querySelector('[data-slot="button"]'));
    return { tokens: ["--dur-instant", "--dur-fast", "--dur-base", "--dur-slow", "--dur-slowest"].map((name) => root.getPropertyValue(name).trim()), buttonDuration: button.transitionDuration };
  })()`);
  assert(reduced.tokens.every((duration) => duration === "1ms") && reduced.buttonDuration.split(",").every((duration) => Number.parseFloat(duration) <= 0.001), "Reduced motion does not collapse to <=1ms", reduced);

  const gsapSource = readFileSync(join(process.cwd(), "node_modules/gsap/dist/gsap.min.js"), "utf8");
  await client.evaluate(gsapSource);
  const gsapLifecycle = await client.evaluate(`(() => {
    const before = gsap.globalTimeline.getChildren().length;
    const mount = () => {
      const scope = document.createElement("div");
      const target = document.createElement("div");
      scope.append(target);
      document.body.append(scope);
      let timeline;
      const context = gsap.context(() => {
        timeline = gsap.timeline({ paused: true }).to(target, { clipPath: "inset(0%)" });
      }, scope);
      return () => { timeline.kill(); context.revert(); scope.remove(); };
    };
    const firstCleanup = mount();
    firstCleanup();
    const afterFirst = gsap.globalTimeline.getChildren().length;
    const secondCleanup = mount();
    secondCleanup();
    const afterSecond = gsap.globalTimeline.getChildren().length;
    return { before, afterFirst, afterSecond };
  })()`);
  assert(gsapLifecycle.before === gsapLifecycle.afterFirst && gsapLifecycle.before === gsapLifecycle.afterSecond, "GSAP mount/unmount/remount leaked a global timeline", gsapLifecycle);

  console.log(JSON.stringify({ mobile, mobileTable, direction, contrast, tokens, surfaces, tablet, desktop, reduced, gsapLifecycle }, null, 2));
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([once(chrome, "exit"), delay(2000)]);
  }
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
