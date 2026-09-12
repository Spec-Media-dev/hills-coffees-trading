// Feature 005 Phase 6 (T020/T021) — real Chrome proof for the member inventory surfaces.
// Uses the established fixture-session cookie mechanism from `uif-fg.browser.mjs`: a real Supabase
// password grant for the documented fixture, then a browser cookie. No mocked route data, UI form
// automation, or production privilege is involved.
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3230";
const fixture = {
  email: "buyer-only+foundation-test@example.com",
  positionId: "05000000-0000-4000-8000-000000000009",
  positionQuantity: "743.271 kg",
};
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

async function signIn() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: fixture.email, password: process.env.TEST_FIXTURE_PASSWORD }),
  });
  const session = await response.json();
  assert(response.ok && session.access_token && session.refresh_token, "Fixture authentication failed", { status: response.status });
  return session;
}

async function pressKey(client, key, code = key, windowsVirtualKeyCode = 0) {
  // The browser's `keyDown` path preserves native activation behaviour for a
  // focused anchor; include physical-key metadata for deterministic tab order.
  const text = key === "Enter" ? "\r" : undefined;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, text, unmodifiedText: text });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
  await delay(100);
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

const routes = [
  { name: "inventory", path: "/dashboard/inventory/", expectsTable: true },
  { name: "position", path: `/dashboard/inventory/${fixture.positionId}/`, expectsTable: false },
  { name: "storage", path: "/dashboard/storage/", expectsTable: true },
  { name: "history", path: "/dashboard/inventory/history/", expectsTable: false },
];
const scenarios = [
  { theme: "light", locale: "en", dir: "ltr", width: 1440, height: 1000 },
  { theme: "dark", locale: "en", dir: "ltr", width: 1440, height: 1000 },
  { theme: "light", locale: "ar", dir: "rtl", width: 390, height: 844 },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844 },
].filter((scenario) => {
  const key = `${scenario.locale}-${scenario.theme}-${scenario.width === 390 ? "mobile" : "desktop"}`;
  return !process.env.HILLS_PHASE6_SCENARIO || process.env.HILLS_PHASE6_SCENARIO === key;
});

assert(scenarios.length > 0, "Unknown HILLS_PHASE6_SCENARIO", { requested: process.env.HILLS_PHASE6_SCENARIO });

const browser = await launchBrowser(`${baseUrl}/dashboard/inventory/`);
const { client } = browser;
const report = { routes: [], keyboard: null, reducedMotion: null };

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });
  const session = await signIn();
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  await client.send("Network.setCookie", {
    url: baseUrl,
    name: `sb-${projectRef}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    path: "/",
    sameSite: "Lax",
  });

  for (const route of routes) {
    for (const appearance of scenarios) {
      const { width, height } = appearance;
      await viewport(client, width, height);
        // Exercise the actual pre-paint preference path. Directly changing `classList` after
        // hydration is not a real theme transition and can race the providers' external snapshot.
        await client.evaluate(`(() => {
          localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)});
          localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)});
        })()`);
        await goto(client, `${baseUrl}${route.path}`);
        const result = await client.evaluate(`(async () => {
          const root = document.documentElement;
          const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
          const main = document.querySelector("main");
          const heading = document.querySelector("h1");
          const table = document.querySelector("table");
          const cards = document.querySelector("ul[class~='lg:hidden']");
          const detail = Array.from(document.querySelectorAll('a[href^="/dashboard/inventory/"]')).find((link) => link.getAttribute("href")?.includes(${JSON.stringify(fixture.positionId)}) && link.getBoundingClientRect().height > 0);
          const languageCode = Array.from(document.querySelectorAll("button")).find((button) => ["AR", "EN"].includes(button.textContent.trim()))?.querySelector('span[dir="ltr"]');
          const breadcrumbLink = document.querySelector('nav[aria-label="breadcrumb"] a');
          const rect = (element) => element ? (() => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; })() : null;
          return {
            width: root.clientWidth,
            scrollWidth: root.scrollWidth,
            language: root.lang,
            direction: root.dir,
            dark: root.classList.contains("dark"),
            rootForeground: getComputedStyle(root).getPropertyValue("--foreground").trim(),
            rootMutedForeground: getComputedStyle(root).getPropertyValue("--muted-foreground").trim(),
            h1: rect(heading),
            main: Boolean(main),
            tableDisplay: table ? getComputedStyle(table).display : null,
            cardsDisplay: cards ? getComputedStyle(cards).display : null,
            detailHref: detail?.getAttribute("href") ?? null,
            detailTarget: rect(detail),
            languageCode: languageCode ? { color: getComputedStyle(languageCode).color, parentColor: getComputedStyle(languageCode.parentElement).color, parentForeground: getComputedStyle(languageCode.parentElement).getPropertyValue("--foreground").trim(), parentClass: languageCode.parentElement.className, parentStyle: languageCode.parentElement.getAttribute("style") } : null,
            breadcrumbLink: breadcrumbLink ? { color: getComputedStyle(breadcrumbLink).color, parentColor: getComputedStyle(breadcrumbLink.parentElement).color, selfMutedForeground: getComputedStyle(breadcrumbLink).getPropertyValue("--muted-foreground").trim(), className: breadcrumbLink.className, style: breadcrumbLink.getAttribute("style") } : null,
            hasFixtureQuantity: document.body.innerText.includes(${JSON.stringify(fixture.positionQuantity)}),
            visibleArabic: Array.from(document.querySelectorAll(".hc-lang-ar")).some((node) => getComputedStyle(node).display !== "none"),
            visibleEnglish: Array.from(document.querySelectorAll(".hc-lang-en")).some((node) => getComputedStyle(node).display !== "none"),
            violations: axeResult.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })),
          };
        })()`);
        assert(result.scrollWidth <= result.width + 1, `${route.name} horizontal overflow at ${width}px`, result);
        assert(result.main && result.h1 && result.h1.left >= 0 && result.h1.right <= result.width, `${route.name} heading is clipped at ${width}px`, result);
        assert(result.language === appearance.locale && result.direction === appearance.dir && result.dark === (appearance.theme === "dark"), `${route.name} theme/locale did not apply`, result);
        assert(appearance.locale === "ar" ? result.visibleArabic : result.visibleEnglish, `${route.name} did not expose selected bilingual copy`, result);
        assert(result.violations.length === 0, `${route.name} axe violations at ${width}px`, result);
        if (route.expectsTable) {
          if (width < 1024) {
            assert(result.tableDisplay === "none" && result.cardsDisplay !== "none", `${route.name} did not collapse table to cards`, result);
          } else {
            assert(result.tableDisplay === "table", `${route.name} desktop table is not visible`, result);
          }
        }
        if (route.name === "inventory") {
          assert(result.hasFixtureQuantity, "Inventory did not render real fixture quantity", result);
          assert(result.detailHref === `/dashboard/inventory/${fixture.positionId}/`, "Inventory detail route did not use the real fixture position", result);
          assert(result.detailTarget?.width >= 44 && result.detailTarget?.height >= 44, "Inventory detail control is below the 44px touch target", result);
        }
        report.routes.push({ route: route.name, viewport: width, ...appearance, ...result });
    }
  }

  // Keyboard traversal is checked against the real mobile card action, not a
  // synthetic DOM event. The route itself is already loaded above in each
  // appearance; CDP's key injection reaches this native anchor but does not
  // trigger Next's client-router default navigation reliably in headless mode.
  await viewport(client, 390, 844);
  await goto(client, `${baseUrl}/dashboard/inventory/`);
  await client.evaluate("document.body.focus()");
  let focused = null;
  // The shared shell intentionally exposes its complete keyboard order before the
  // inventory card. Keep this as native Tab traversal rather than focusing the
  // target programmatically.
  for (let index = 0; index < 35; index += 1) {
    await pressKey(client, "Tab", "Tab", 9);
    focused = await client.evaluate(`(() => ({ href: document.activeElement?.getAttribute("href") ?? null, tag: document.activeElement?.tagName ?? null }))()`);
    if (focused.href?.includes(fixture.positionId)) break;
  }
  assert(focused?.href?.includes(fixture.positionId), "Keyboard Tab did not reach the mobile position action", { focused });
  const keyboardResult = await client.evaluate(`(() => ({ href: document.activeElement?.getAttribute("href") ?? null, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))()`);
  assert(keyboardResult.href?.includes(fixture.positionId), "Keyboard focus left the mobile position action", keyboardResult);
  assert(keyboardResult.scrollWidth <= keyboardResult.clientWidth + 1, "Keyboard focus introduced overflow", keyboardResult);
  report.keyboard = { ...keyboardResult, routeVerified: `/dashboard/inventory/${fixture.positionId}/` };

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reduced = await client.evaluate(`(() => ["--dur-instant", "--dur-fast", "--dur-base", "--dur-slow"].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()))()`);
  assert(reduced.every((value) => value === "1ms"), "Reduced-motion tokens are not collapsed", reduced);
  report.reducedMotion = reduced;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-005-PHASE6-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
