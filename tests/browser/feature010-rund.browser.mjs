// Feature 010 RUN D (Phase 6) — real Chrome + axe proof over the Warehouse console: shipment queues,
// a shipment detail (operations panel + delivered-quantity state), custody/inventory positions,
// storage allocations and a position detail, across EN/AR × light/dark × 390/1366/1920; direct-URL
// refusal for FINANCE; the operations form's inline validation + confirmation (cancelled — no write);
// keyboard reach with a visible focus ring; no raw error text, no colour-only status, one <main>.
// Uses the standing WAREHOUSE and FINANCE fixtures only. No mocked data.
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const FIXTURES = {
  warehouse: "warehouse-admin+foundation-test@example.com",
  finance: "finance-admin+foundation-test@example.com",
  positionOrgA: "05000000-0000-4000-8000-000000000009",
};

async function signIn(email) {
  loadEnv();
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: process.env.TEST_FIXTURE_PASSWORD }),
  });
  const session = await response.json();
  assert(response.ok && session.access_token, `Fixture authentication failed for ${email}`, { status: response.status });
  return session;
}

loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = (session) => `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const scenarios = [
  { theme: "light", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-light-1366" },
  { theme: "dark", locale: "en", dir: "ltr", width: 1366, height: 900, label: "en-dark-1366" },
  { theme: "light", locale: "ar", dir: "rtl", width: 1366, height: 900, label: "ar-light-1366" },
  { theme: "dark", locale: "ar", dir: "rtl", width: 390, height: 844, label: "ar-dark-390" },
  { theme: "light", locale: "en", dir: "ltr", width: 1920, height: 1080, label: "en-light-1920" },
];

const report = { surfaces: [], forbidden: null, validation: null, keyboard: null, shipmentDetail: null };
const browser = await launchBrowser("about:blank");
const { client } = browser;

async function setAppearance(appearance) {
  await viewport(client, appearance.width, appearance.height);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(appearance.theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(appearance.locale)}); })()`);
}

async function setSession(session) {
  await client.send("Network.clearBrowserCookies");
  if (session) await client.send("Network.setCookie", { url: baseUrl, name: cookieName, value: cookieValue(session), path: "/", sameSite: "Lax" });
}

async function evaluateSurface() {
  return client.evaluate(`(async () => {
    const axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    const root = document.documentElement;
    return {
      url: location.pathname + location.search,
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      language: root.lang,
      direction: root.dir,
      dark: root.classList.contains("dark"),
      mains: document.querySelectorAll("main").length,
      hasHeading: Boolean(document.querySelector("h1")),
      body: document.body.innerText,
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}

const click = async (box) => {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── FINANCE by direct URL into the warehouse queue and the inventory area: forbidden, names the role, leaks nothing. ──
  const financeSession = await signIn(FIXTURES.finance);
  await setSession(financeSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  {
    const refused = [];
    for (const path of ["/dashboard-admin/shipments/", "/dashboard-admin/inventory/", `/dashboard-admin/inventory/${FIXTURES.positionOrgA}/`]) {
      await goto(client, `${baseUrl}${path}`);
      const body = await client.evaluate(`document.body.innerText`);
      assert(/Not permitted for your role/.test(body) && /Required role: Warehouse/.test(body), `FINANCE was not refused from ${path}`, {});
      assert(!/743\.271|Requested\s*\n|Shipment\s+Order/.test(body), `FINANCE saw warehouse content on ${path}`, {});
      refused.push(path);
    }
    report.forbidden = { paths: refused, refused: true };
  }

  // ── WAREHOUSE: locate one real shipment for the detail surface (a queue row's own Open link). ──
  const warehouseSession = await signIn(FIXTURES.warehouse);
  await setSession(warehouseSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  let detailPath = null;
  for (const queue of ["requested", "inProgress", "dispatched", "closed", "held"]) {
    await goto(client, `${baseUrl}/dashboard-admin/shipments/?queue=${queue}`);
    detailPath = await client.evaluate(`(() => { const a = [...document.querySelectorAll('main a[href^="/dashboard-admin/shipments/"]')].find((el) => /\\/dashboard-admin\\/shipments\\/[0-9a-f-]{36}/.test(el.getAttribute("href"))); return a ? a.getAttribute("href") : null; })()`);
    if (detailPath) break;
  }
  assert(detailPath, "No shipment row was available in any warehouse queue", {});
  report.shipmentDetail = { path: detailPath };

  const pages = [
    { key: "queue-requested", path: "/dashboard-admin/shipments/", expectEn: /Shipments/, expectAr: /الشحنات/ },
    { key: "queue-closed", path: "/dashboard-admin/shipments/?queue=closed", expectEn: /Closed/, expectAr: /مغلقة/ },
    { key: "shipment-detail", path: `${detailPath}/`.replace(/\/\/$/, "/"), expectEn: /Warehouse operations/, expectAr: /عمليات المستودع/ },
    { key: "inventory-positions", path: "/dashboard-admin/inventory/", expectEn: /On hand \(gross\)/, expectAr: /الموجود \(الإجمالي\)/ },
    { key: "inventory-allocations", path: "/dashboard-admin/inventory/?view=allocations", expectEn: /Storage allocations/, expectAr: /مخصَّصات التخزين/ },
    { key: "position-detail", path: `/dashboard-admin/inventory/${FIXTURES.positionOrgA}/`, expectEn: /743\.271 kg/, expectAr: /743\.271 kg/ },
  ];

  for (const appearance of scenarios) {
    for (const page of pages) {
      await setAppearance(appearance);
      await goto(client, `${baseUrl}${page.path}`);
      const label = `${appearance.label} ${page.key}`;
      const expected = appearance.locale === "ar" ? page.expectAr : page.expectEn;
      // Dynamic (streamed) server pages can report readyState=complete before the last RSC chunk paints
      // and before the locale attribute flips — poll briefly for the page's own content + lang/dir.
      let surface = await evaluateSurface();
      for (let attempt = 0; attempt < 20 && !(expected.test(surface.body) && surface.language === appearance.locale && surface.direction === appearance.dir); attempt += 1) {
        await pause(250);
        surface = await evaluateSurface();
      }
      assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth });
      assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
      assert(surface.mains === 1, `${label} must have exactly one <main>`, { mains: surface.mains });
      assert(surface.hasHeading, `${label} has no h1`, {});
      assert(surface.language === appearance.locale && surface.direction === appearance.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
      assert(surface.dark === (appearance.theme === "dark"), `${label} wrong theme`, {});
      assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected) });
      const badgesWithoutText = await client.evaluate(`[...document.querySelectorAll('[data-slot="shipment-status-badge"],[data-slot="storage-status-badge"]')].filter((el) => !(el.textContent ?? "").trim()).length`);
      assert(badgesWithoutText === 0, `${label} has a text-less status badge`, {});
      assert(!/PGRST|permission denied|violates|SQLSTATE|supabase|delivery_reservation_|invalid_shipment_transition/i.test(surface.body), `${label} leaked a raw error`, {});
      // Quantities always carry their unit on the inventory surfaces.
      if (page.key.startsWith("inventory") || page.key === "position-detail") {
        const bareQuantities = await client.evaluate(`[...document.querySelectorAll('[data-on-hand],[data-reserved]')].filter((el) => !/kg$/.test((el.textContent ?? "").trim())).length`);
        assert(bareQuantities === 0, `${label} renders a quantity without its unit`, {});
      }
      report.surfaces.push({ label, url: surface.url, violations: surface.violations.length });
    }
  }

  // ── Operations form: irreversible operation → inline missing-reason error; with a reason → confirmation (cancelled, NO write). ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}${detailPath}/`);
  {
    const statusBefore = await client.evaluate(`document.querySelector('[data-slot="shipment-status-badge"]')?.dataset.status ?? null`);
    const options = await client.evaluate(`[...document.querySelectorAll('[data-decision-option]')].map((el) => el.dataset.decisionOption)`);
    const destructive = await client.evaluate(`(() => { const el = document.querySelector('[data-decision-option][data-destructive="true"]'); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { key: el.dataset.decisionOption, x: r.x + 20, y: r.y + r.height / 2 }; })()`);
    if (destructive) {
      await click(destructive);
      await pause(200);
      // The panel sits in the right-hand column below the fold at 1366×900 — bring the button into view before clicking.
      const submitBox = async () => client.evaluate(`(() => { const el = document.querySelector('[data-decision-form="operation"] button[type="submit"]'); if (!el || el.disabled) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      const firstSubmit = await submitBox();
      assert(firstSubmit, "Submit button not enabled after choosing an operation", {});
      await click(firstSubmit);
      await pause(300);
      const validation = await client.evaluate(`(() => {
        const error = document.querySelector('[data-decision-form="operation"] [role="alert"]');
        const textarea = document.querySelector('[data-decision-form="operation"] textarea');
        const dialog = document.querySelector('[role="alertdialog"]');
        return { errorText: error?.textContent ?? null, ariaInvalid: textarea?.getAttribute("aria-invalid"), dialogOpen: Boolean(dialog) };
      })()`);
      assert(validation.errorText && /reason/i.test(validation.errorText), "Missing-reason inline error not shown on the reason field", validation);
      assert(validation.ariaInvalid === "true", "Reason field not marked aria-invalid", validation);
      assert(!validation.dialogOpen, "Confirmation dialog opened despite a validation error", validation);
      await client.evaluate(`(() => { const t = document.querySelector('[data-decision-form="operation"] textarea'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; setter.call(t, "Browser proof — confirmation only, cancelled."); t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await pause(100);
      await click(await submitBox());
      await pause(400);
      const confirm = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "" }; })()`);
      assert(confirm.open && /Apply this operation\?/.test(confirm.text), "Confirmation dialog did not open for an irreversible operation", confirm);
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
      await pause(300);
      const statusAfter = await client.evaluate(`document.querySelector('[data-slot="shipment-status-badge"]')?.dataset.status ?? null`);
      assert(statusAfter === statusBefore, "Cancelling the confirmation still changed the shipment", { statusBefore, statusAfter });
      report.validation = { status: statusBefore, options, destructiveTried: destructive.key, inlineError: validation.errorText, confirmOpened: true, cancelledNoWrite: true };
    } else {
      // A terminal/held shipment: the honest "nothing applies" statement, no control at all.
      const notOperable = await client.evaluate(`Boolean(document.querySelector('[data-decision-state="not-operable"]'))`);
      assert(notOperable && options.length === 0, "A shipment with no valid operation still rendered controls", { status: statusBefore, options });
      report.validation = { status: statusBefore, options, notOperable: true };
    }
  }

  // ── Keyboard: Tab reaches a queue row's Open link with a visible focus ring. ──
  await goto(client, `${baseUrl}/dashboard-admin/shipments/?queue=closed`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 100 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => {
      const el = document.activeElement;
      const href = el?.getAttribute?.("href") ?? "";
      if (!el || el.tagName !== "A" || !/^\\/dashboard-admin\\/shipments\\/[0-9a-f-]{36}\\/?$/.test(href)) return null;
      const cs = getComputedStyle(el);
      return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached a shipment link with a visible ring", focus);
  report.keyboard = focus;

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-010-RUND-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
