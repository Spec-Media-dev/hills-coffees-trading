// Real-production companion for T037.  This deliberately inspects bytes emitted by
// `next start`; unit/jsdom representations are not accepted as proof here.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.HILLS_PHASE11_URL ?? "http://127.0.0.1:3231";
const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const canaries = [
  "PRIVATE-CANARY-COST-001",
  "PRIVATE-CANARY-EMAIL-001",
  "PRIVATE-CANARY-PHONE-001",
  "PRIVATE-CANARY-DOC-001",
  "PRIVATE-CANARY-INTERNAL-001",
  "Foundation Test — Buyer Only",
];
const surfaces = [
  ["home", "/"],
  ["coffeeIndex", "/coffee/"],
  ["coffee", "/coffee/public-test-coffee-published/"],
  ["originIndex", "/origins/"],
  ["origin", "/origins/public-test-origin-active/"],
  ["sourcing", "/sourcing/"],
  ["contact", "/contact/"],
];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => { throw new Error(message); };

function assertClean(surface, body) {
  for (const canary of canaries) {
    if (body.includes(canary)) fail(`${surface} leaked deterministic private canary: ${canary}`);
  }
}

async function get(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const body = await response.text();
  if (!response.ok) fail(`${path} returned ${response.status}`);
  return { body, contentType: response.headers.get("content-type") ?? "" };
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not reserve a Chrome debugging port"));
      server.close(() => resolve(address.port));
    });
  });
}

async function chromeJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await delay(100);
  }
  fail(`Chrome did not become ready: ${url}`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) fail(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

async function renderedDom(path) {
  const debugPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "hills-t037-"));
  const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `${baseUrl}${path}`], { stdio: "ignore", windowsHide: true });
  let client;
  try {
    const targets = await chromeJson(`http://127.0.0.1:${debugPort}/json/list`);
    const target = targets.find((item) => item.type === "page");
    if (!target) fail("Chrome did not expose a page target");
    client = new Cdp(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await client.evaluate("document.readyState") === "complete") break;
      await delay(100);
    }
    await delay(300);
    return await client.evaluate("document.documentElement.outerHTML");
  } finally {
    client?.socket.close();
    chrome.kill();
  }
}

const proof = {};
for (const [label, path] of surfaces) {
  const ssr = await get(path);
  if (!ssr.contentType.includes("text/html")) fail(`${label} SSR did not return HTML`);
  assertClean(`${label} SSR HTML`, ssr.body);
  proof[`${label}SsrBytes`] = ssr.body.length;

  const flight = await get(`${path}?_rsc=t037proof`, { RSC: "1" });
  if (!flight.contentType.includes("text/x-component")) fail(`${label} request did not return an RSC/Flight payload: ${flight.contentType}`);
  assertClean(`${label} RSC/Flight`, flight.body);
  proof[`${label}FlightBytes`] = flight.body.length;

  const dom = await renderedDom(path);
  assertClean(`${label} fully rendered DOM`, dom);
  proof[`${label}DomBytes`] = dom.length;
}

const sitemap = await get("/sitemap.xml");
if (!sitemap.contentType.includes("xml")) fail(`sitemap did not return XML: ${sitemap.contentType}`);
assertClean("sitemap.xml", sitemap.body);
proof.sitemapBytes = sitemap.body.length;

console.log(JSON.stringify({ t037: "production SSR + RSC/Flight + rendered DOM clean", ...proof }, null, 2));
