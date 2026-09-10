// Shared real-browser harness for Feature 002 Phase 12. It deliberately uses installed Chrome
// over CDP, matching the already-proven design closure scripts without a runtime dependency.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a CDP port"));
      server.close(() => resolve(address.port));
    });
  });
}

async function jsonEndpoint(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await delay(100);
  }
  throw new Error(`Chrome did not become ready: ${url}`);
}

export class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.requestFailures = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
      }
      if (message.method === "Runtime.exceptionThrown") this.pageErrors.push(message.params.exceptionDetails.text);
      if (message.method === "Network.loadingFailed" && !message.params.canceled && message.params.errorText) this.requestFailures.push(message.params.errorText);
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
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  close() { this.socket.close(); }
}

export async function launchBrowser(initialUrl) {
  const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const profile = mkdtempSync(join(tmpdir(), "hills-phase12-"));
  const debugPort = await freePort();
  const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, initialUrl], { stdio: "ignore", windowsHide: true });
  const target = (await jsonEndpoint(`http://127.0.0.1:${debugPort}/json/list`)).find((item) => item.type === "page");
  if (!target) throw new Error("Chrome did not expose a page target");
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  return {
    client,
    async close() {
      client.close();
      if (chrome.exitCode === null) chrome.kill();
      await delay(150);
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}

export async function goto(client, url, { scripts = true } = {}) {
  await client.send("Emulation.setScriptExecutionDisabled", { value: !scripts });
  await client.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await client.evaluate("document.readyState") === "complete") break;
    await delay(100);
  }
  await delay(350);
}

export async function viewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
}

export function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}\n${JSON.stringify(details ?? {}, null, 2)}`);
}
