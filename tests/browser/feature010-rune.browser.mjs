// Feature 010 RUN E (Phases 7–8) — real Chrome + axe proof over the Catalogue console (coffees list /
// detail / new, origins, regions, taxonomy, warehouses + detail, media), the Audit area (listings,
// custody, the DB-OPEN-06 log view) and the KYB reviewer detail (review-progress summary, document
// outcome controls, blocked-approval hint), across EN/AR × light/dark × 390/1366/1920; direct-URL
// refusal for FINANCE on catalogue and audit routes; the record form's inline validation; the
// publication panel's confirmation (cancelled — no write); the REAL public-cache round trip — the
// RUN E proof coffee is published through the console and the public route flips 404 → 200 → 404
// against this running server; keyboard reach with a visible focus ring; zero mutation controls on
// the audit pages; no raw error text; one <main>.
//
// Fixtures: the human-authorized disposable catalogue ADMIN, AUDITOR and COMPLIANCE identities are
// prepared by the seed script at the start and de-privileged at the end (finally); the standing
// FINANCE fixture is the refused role. Requires a dev server (HILLS_UI_URL, default :3230) and the
// CURRENT TEST_FIXTURE_PASSWORD in .env.local.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnv();
assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_FIXTURE_PASSWORD, "Missing fixture browser environment", {});

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3230";
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const FIXTURES = {
  admin: "catalogue-admin+t021-test@example.com",
  auditor: "auditor+t025-test@example.com",
  compliance: "compliance-reviewer+t010-test@example.com",
  finance: "finance-admin+foundation-test@example.com",
  proofCoffeeId: "f0000000-0000-4000-8000-000000000044",
  proofCoffeeSlug: "public-test-coffee-run-e-proof",
  completeDraftApplicationId: "f0000000-0000-4000-8000-000000000072",
};

function seed(...args) {
  return execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/seed-test-fixtures.ts"), ...args], { env: process.env, stdio: ["ignore", "pipe", "inherit"] }).toString();
}

async function signIn(email) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: process.env.TEST_FIXTURE_PASSWORD }),
  });
  const session = await response.json();
  assert(response.ok && session.access_token, `Fixture authentication failed for ${email}`, { status: response.status });
  return session;
}

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

const report = { surfaces: [], forbidden: null, validation: null, confirmation: null, publicCache: null, auditReadOnly: null, kyb: null, keyboard: null, fixtures: null };

seed("--prepare-catalogue-admin-fixture");
seed("--prepare-auditor-fixture");
seed("--prepare-compliance-fixture");
seed("--reset-run-e-catalogue-fixture");
seed("--reset-complete-draft-application");

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
      mutationControls: document.querySelectorAll("main form, main button[type='submit'], main input, main textarea, main select, main [data-decision-form], main [data-record-form]").length,
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
    };
  })()`);
}
const click = async (box) => {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const boxOf = async (selector) => client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
// Streamed server pages may report load before the table paints — poll briefly for the first matching row link.
const firstHref = async (pattern) => {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const href = await client.evaluate(`(() => { const re = new RegExp(${JSON.stringify(pattern)}); const a = [...document.querySelectorAll("main a[href]")].find((el) => re.test(el.getAttribute("href"))); return a ? a.getAttribute("href") : null; })()`);
    if (href) return href;
    await pause(250);
  }
  return null;
};
const publicStatus = async () => {
  const response = await fetch(`${baseUrl}/coffee/${FIXTURES.proofCoffeeSlug}/`, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  const text = await response.text();
  return { status: response.status, containsName: /Run E Proof/.test(text) };
};
async function waitFor(expected, appearance) {
  let surface = await evaluateSurface();
  for (let attempt = 0; attempt < 24 && !(expected.test(surface.body) && surface.language === appearance.locale && surface.direction === appearance.dir); attempt += 1) {
    await pause(250);
    surface = await evaluateSurface();
  }
  return surface;
}

try {
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

  // ── FINANCE by direct URL into catalogue and audit routes: forbidden, names the role, leaks nothing. ──
  await setSession(await signIn(FIXTURES.finance));
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  {
    const refused = [];
    for (const path of ["/dashboard-admin/coffees/", `/dashboard-admin/coffees/${FIXTURES.proofCoffeeId}/`, "/dashboard-admin/origins/", "/dashboard-admin/warehouses/", "/dashboard-admin/media/", "/dashboard-admin/audit/", "/dashboard-admin/audit/?view=log"]) {
      await goto(client, `${baseUrl}${path}`);
      const body = await client.evaluate(`document.body.innerText`);
      assert(/Not permitted for your role/.test(body) && /Required role: (Admin|Auditor)/.test(body), `FINANCE was not refused from ${path}`, { body: body.slice(0, 300) });
      assert(!/Run E Proof|New coffee|Publication|Audit log/.test(body), `FINANCE saw console content on ${path}`, {});
      refused.push(path);
    }
    report.forbidden = { paths: refused, refused: true };
  }

  // ── Public cache round trip: DRAFT → 404; publish through the console → 200; unpublish → 404. ──
  const adminSession = await signIn(FIXTURES.admin);
  await setSession(adminSession);
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  {
    const before = await publicStatus();
    assert(before.status === 404, "Proof coffee was public before publishing", before);
    const detail = `${baseUrl}/dashboard-admin/coffees/${FIXTURES.proofCoffeeId}/`;
    const applyOperation = async (operation, confirmPattern) => {
      await goto(client, detail);
      await waitFor(/Publication/, scenarios[0]);
      const option = await boxOf(`[data-decision-form="publication"] [data-decision-option="${operation}"]`);
      assert(option, `Operation ${operation} is not offered`, {});
      await click(option);
      await pause(200);
      await click(await boxOf('[data-decision-form="publication"] button[type="submit"]'));
      await pause(400);
      const confirm = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "" }; })()`);
      assert(confirm.open && confirmPattern.test(confirm.text), `Confirmation for ${operation} did not open`, confirm);
      const confirmButton = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); const b = [...d.querySelectorAll("button")].find((el) => !/Cancel|إلغاء/.test(el.textContent ?? "")); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      assert(confirmButton, `No confirm button for ${operation}`, {});
      await click(confirmButton);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await pause(250);
        const toast = await client.evaluate(`document.body.innerText`);
        if (/applied — the coffee is now/.test(toast)) break;
      }
      const status = await client.evaluate(`document.querySelector('[data-coffee-status]')?.getAttribute("data-coffee-status") ?? document.body.innerText.match(/Published|Draft|Archived/)?.[0] ?? null`);
      return status;
    };
    await applyOperation("publish", /Apply this publication change\?/);
    let afterPublish = await publicStatus();
    for (let attempt = 0; attempt < 20 && afterPublish.status !== 200; attempt += 1) {
      await pause(500);
      afterPublish = await publicStatus();
    }
    assert(afterPublish.status === 200 && afterPublish.containsName, "Public route did not become visible after publishing", afterPublish);
    await applyOperation("unpublish", /Apply this publication change\?/);
    let afterUnpublish = await publicStatus();
    for (let attempt = 0; attempt < 20 && afterUnpublish.status !== 404; attempt += 1) {
      await pause(500);
      afterUnpublish = await publicStatus();
    }
    assert(afterUnpublish.status === 404, "Public route did not become 404 after unpublishing", afterUnpublish);
    report.publicCache = { before: before.status, afterPublish: afterPublish.status, afterUnpublish: afterUnpublish.status };
  }

  // ── Catalogue surfaces (ADMIN) ──
  await goto(client, `${baseUrl}/dashboard-admin/warehouses/`);
  const warehouseHref = await firstHref("^/dashboard-admin/warehouses/[0-9a-f-]{36}");
  await goto(client, `${baseUrl}/dashboard-admin/origins/`);
  const originHref = await firstHref("^/dashboard-admin/origins/[0-9a-f-]{36}");
  if (!warehouseHref) {
    await goto(client, `${baseUrl}/dashboard-admin/warehouses/`);
    await pause(1500);
    const debug = await client.evaluate(`({ text: document.querySelector("main")?.innerText.slice(0, 600) ?? null, links: [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")).slice(0, 12) })`);
    assert(false, "No warehouse row to open", debug);
  }
  assert(warehouseHref && originHref, "No warehouse/origin row to open", { warehouseHref, originHref });
  const adminPages = [
    { key: "coffees", path: "/dashboard-admin/coffees/", expectEn: /Coffees/, expectAr: /أنواع البن/ },
    { key: "coffee-detail", path: `/dashboard-admin/coffees/${FIXTURES.proofCoffeeId}/`, expectEn: /Publication/, expectAr: /النشر/ },
    { key: "coffee-new", path: "/dashboard-admin/coffees/new/", expectEn: /New coffee/, expectAr: /بن جديد/ },
    { key: "origins", path: "/dashboard-admin/origins/", expectEn: /Origins/, expectAr: /المناشئ/ },
    { key: "origin-detail", path: `${originHref}/`.replace(/\/\/$/, "/"), expectEn: /Origin details/, expectAr: /تفاصيل المنشأ/ },
    { key: "regions", path: "/dashboard-admin/regions/", expectEn: /Regions/, expectAr: /المناطق/ },
    { key: "taxonomy", path: "/dashboard-admin/taxonomy/?kind=varieties", expectEn: /Varieties/, expectAr: /الأصناف/ },
    { key: "warehouses", path: "/dashboard-admin/warehouses/", expectEn: /Warehouses/, expectAr: /المستودعات/ },
    { key: "warehouse-detail", path: `${warehouseHref}/`.replace(/\/\/$/, "/"), expectEn: /Locations/, expectAr: /المواقع/ },
    { key: "media", path: "/dashboard-admin/media/", expectEn: /Media/, expectAr: /الوسائط/ },
  ];
  const auditPages = [
    { key: "audit-listings", path: "/dashboard-admin/audit/", expectEn: /Read-only/, expectAr: /للقراءة فقط/ },
    { key: "audit-custody", path: "/dashboard-admin/audit/?view=custody", expectEn: /Storage allocations/, expectAr: /مخصَّصات التخزين/ },
    { key: "audit-log", path: "/dashboard-admin/audit/?view=log", expectEn: /DB-OPEN-06/, expectAr: /DB-OPEN-06/ },
  ];
  const kybPages = [{ key: "kyb-detail", path: `/dashboard-admin/kyb/${FIXTURES.completeDraftApplicationId}/`, expectEn: /Review progress/, expectAr: /تقدّم المراجعة/ }];

  const runSurfaces = async (pages, extra) => {
    for (const appearance of scenarios) {
      for (const page of pages) {
        await setAppearance(appearance);
        await goto(client, `${baseUrl}${page.path}`);
        const label = `${appearance.label} ${page.key}`;
        const expected = appearance.locale === "ar" ? page.expectAr : page.expectEn;
        const surface = await waitFor(expected, appearance);
        assert(surface.scrollWidth <= surface.width + 1, `${label} horizontal overflow`, { width: surface.width, scrollWidth: surface.scrollWidth });
        assert(surface.violations.length === 0, `${label} axe violations`, surface.violations);
        assert(surface.mains === 1, `${label} must have exactly one <main>`, { mains: surface.mains });
        assert(surface.hasHeading, `${label} has no h1`, {});
        assert(surface.language === appearance.locale && surface.direction === appearance.dir, `${label} wrong lang/dir`, { language: surface.language, direction: surface.direction });
        assert(surface.dark === (appearance.theme === "dark"), `${label} wrong theme`, {});
        assert(expected.test(surface.body), `${label} missing expected content`, { expected: String(expected) });
        assert(!/PGRST|permission denied|violates|SQLSTATE|supabase|row-level security|23505|23503|23514/i.test(surface.body), `${label} leaked a raw error`, {});
        const badgesWithoutText = await client.evaluate(`[...document.querySelectorAll('[data-slot$="status-badge"],[data-status-badge]')].filter((el) => !(el.textContent ?? "").trim()).length`);
        assert(badgesWithoutText === 0, `${label} has a text-less status badge`, {});
        if (extra) await extra(label, surface, page);
        report.surfaces.push({ label, url: surface.url, violations: surface.violations.length });
      }
    }
  };

  await runSurfaces(adminPages, async (label, _surface, page) => {
    if (page.key === "media" || page.key === "coffee-detail") {
      const upload = await client.evaluate(`document.querySelector('[data-media-upload]')?.getAttribute("data-media-upload") ?? null`);
      const fileInputs = await client.evaluate(`document.querySelectorAll('input[type="file"]').length`);
      if (page.key === "coffee-detail") assert(upload === "unavailable", `${label} media upload seam is not honest`, { upload });
      assert(fileInputs === 0, `${label} renders a file input`, {});
    }
  });

  // ── Record form: inline validation on the exact field (no submit), then the publication confirmation cancelled (no write). ──
  await setAppearance(scenarios[0]);
  await goto(client, `${baseUrl}/dashboard-admin/coffees/new/`);
  {
    await click(await boxOf('[data-record-form="coffee"] button[type="submit"]'));
    await pause(300);
    const validation = await client.evaluate(`(() => {
      const form = document.querySelector('[data-record-form="coffee"]');
      const name = form.querySelector('input[name="name"]');
      const alerts = [...form.querySelectorAll('[role="alert"]')].map((el) => el.textContent);
      return { nameInvalid: name?.getAttribute("aria-invalid"), alerts, url: location.pathname };
    })()`);
    assert(validation.nameInvalid === "true" && validation.alerts.some((text) => /name/i.test(text)), "Empty create did not mark the name field invalid inline", validation);
    assert(validation.url === "/dashboard-admin/coffees/new/", "Empty create navigated away", validation);
    report.validation = validation;

    await goto(client, `${baseUrl}/dashboard-admin/coffees/${FIXTURES.proofCoffeeId}/`);
    await waitFor(/Publication/, scenarios[0]);
    const statusBefore = await client.evaluate(`document.body.innerText.match(/\\bDraft\\b/) ? "DRAFT" : null`);
    await click(await boxOf('[data-decision-form="publication"] [data-decision-option="archive"]'));
    await pause(200);
    await click(await boxOf('[data-decision-form="publication"] button[type="submit"]'));
    await pause(400);
    const confirm = await client.evaluate(`(() => { const d = document.querySelector('[role="alertdialog"]'); return { open: Boolean(d), text: d?.textContent ?? "" }; })()`);
    assert(confirm.open && /Apply this publication change\?/.test(confirm.text), "Publication confirmation did not open", confirm);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await pause(400);
    await goto(client, `${baseUrl}/dashboard-admin/coffees/?status=DRAFT`);
    const stillDraft = await client.evaluate(`Boolean([...document.querySelectorAll("main a[href]")].find((a) => a.getAttribute("href").includes(${JSON.stringify(FIXTURES.proofCoffeeId)})))`);
    assert(statusBefore === "DRAFT" && stillDraft, "Cancelling the confirmation still changed the coffee", { statusBefore, stillDraft });
    report.confirmation = { operation: "archive", confirmOpened: true, cancelledNoWrite: true };
  }

  // ── Keyboard: Tab reaches a coffee row's Open link with a visible focus ring. ──
  await goto(client, `${baseUrl}/dashboard-admin/coffees/`);
  await client.evaluate(`document.body.focus()`);
  let focus = null;
  for (let step = 0; step < 120 && !focus; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    focus = await client.evaluate(`(() => {
      const el = document.activeElement;
      const href = el?.getAttribute?.("href") ?? "";
      if (!el || el.tagName !== "A" || !/^\\/dashboard-admin\\/coffees\\/[0-9a-f-]{36}\\/?$/.test(href)) return null;
      const cs = getComputedStyle(el);
      return { href, focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()`);
  }
  assert(focus && focus.focusVisible && ((focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) > 0) || focus.boxShadow !== "none"), "Keyboard focus never reached a coffee link with a visible ring", focus);
  report.keyboard = focus;

  // ── AUDITOR: read-only surfaces with ZERO mutation controls; the log view states DB-OPEN-06. ──
  await setSession(await signIn(FIXTURES.auditor));
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  {
    const refusedBody = await (async () => {
      await goto(client, `${baseUrl}/dashboard-admin/coffees/`);
      return client.evaluate(`document.body.innerText`);
    })();
    assert(/Not permitted for your role/.test(refusedBody), "AUDITOR was not refused from the catalogue", {});
  }
  await runSurfaces(auditPages, async (label, surface) => {
    assert(surface.mutationControls === 0, `${label} renders a mutation control for the AUDITOR`, { mutationControls: surface.mutationControls });
  });
  report.auditReadOnly = { mutationControls: 0, catalogueRefused: true };

  // ── COMPLIANCE: the KYB reviewer detail with the review-progress summary and the View gap statement. ──
  await setSession(await signIn(FIXTURES.compliance));
  await goto(client, `${baseUrl}/dashboard-admin/`);
  await setAppearance(scenarios[0]);
  await runSurfaces(kybPages, async (label) => {
    const kyb = await client.evaluate(`(() => ({
      readiness: document.querySelector('[data-approval-readiness]')?.getAttribute("data-approval-readiness") ?? null,
      accepted: document.querySelector('[data-readiness-accepted]')?.getAttribute("data-readiness-accepted") ?? null,
      viewLinks: document.querySelectorAll('[data-document-view]').length,
      viewUnavailable: document.querySelectorAll('[data-document-view-unavailable]').length,
      nextAction: Boolean(document.querySelector('[data-next-action]')),
    }))()`);
    assert(kyb.readiness && kyb.nextAction, `${label} lacks the readiness summary`, kyb);
    assert(kyb.viewLinks === 0 && kyb.viewUnavailable > 0, `${label} offered a View action to a pure COMPLIANCE role (bytes are unlocatable for it)`, kyb);
    report.kyb = kyb;
  });

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);

  console.log("FEATURE-010-RUNE-BROWSER-REPORT", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  seed("--reset-run-e-catalogue-fixture");
  seed("--reset-complete-draft-application");
  const fixtures = {};
  for (const [name, cleanupFlag, inspectFlag] of [
    ["catalogueAdmin", "--cleanup-catalogue-admin-fixture", "--inspect-catalogue-admin-fixture"],
    ["auditor", "--cleanup-auditor-fixture", "--inspect-auditor-fixture"],
    ["compliance", "--cleanup-compliance-fixture", "--inspect-compliance-fixture"],
  ]) {
    seed(cleanupFlag);
    fixtures[name] = JSON.parse(seed(inspectFlag).trim().split(/\r?\n/).find((line) => line.startsWith("{")) ?? "{}");
    assert(fixtures[name].activeCapability === false, `${name} fixture still privileged after cleanup`, fixtures[name]);
  }
  report.fixtures = fixtures;
  console.log("FEATURE-010-RUNE-FIXTURE-CLEANUP", JSON.stringify(fixtures));
}
