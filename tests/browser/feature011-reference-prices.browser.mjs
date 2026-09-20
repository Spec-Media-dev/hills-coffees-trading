// Feature 011 — real Chrome + axe proof of the reference-price surface (T019 accessibility / RTL / states).
//
// TWO PARTS
//   A. The real homepage (`/`, anonymous): the reference band renders through the licence-gated presentation contract.
//      HILLS_F011_EXPECT selects what the live database should produce:
//        "read_failed"  (default — BEFORE the DB-BLOCK-10 remainder migration is applied: the anonymous read is refused,
//                        and the band must degrade to the honest "temporarily unavailable" state, with no raw error text)
//        "seeded"       (AFTER the migration: disposable F011 fixtures are seeded first; the band must show the approved
//                        benchmark with full disclosure, the stale feed as stale, a basis marked explanatory, and NEVER a
//                        non-approved source's value)
//   B. The temporary harness route `/f011-proof?state=…` (present ONLY while the harness page exists — removed after the
//      proof) renders every state from static fixtures, so value / stale / basis / each unavailable reason are proven in a
//      real browser even before the migration exists. Skipped with HILLS_F011_HARNESS=0.
//
// Matrix: EN/AR × light/dark × 390/1366. Per surface: axe (colour-contrast ON) zero violations, lang/dir, theme, exactly
// one <main>, no horizontal overflow, no raw database/error text, disclosure elements complete on every current benchmark,
// numerals/currency/timestamps are isolated LTR runs, no interactive control inside the reference stage (never an offer),
// plus a keyboard traversal (no trap, visible focus) and zero console/page/request errors.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

function loadEnv() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnv();

const baseUrl = process.env.HILLS_UI_URL ?? "http://localhost:3231";
const EXPECT = process.env.HILLS_F011_EXPECT ?? "read_failed";
const HARNESS = process.env.HILLS_F011_HARNESS !== "0";
const runFixtureScript = (args) => execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/seed-test-fixtures.ts", ...args], { cwd: process.cwd(), env: process.env, encoding: "utf8" });

const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const RAW_ERROR = /violates|row-level security|PGRST|42501|SQLSTATE|permission denied|is_platform_admin|TypeError|undefined|NaN|\[object/i;
const APPEARANCES = [];
for (const locale of ["en", "ar"]) for (const theme of ["light", "dark"]) for (const width of [390, 1366]) APPEARANCES.push({ locale, theme, width, height: width === 390 ? 844 : 900 });

const report = { home: [], harness: [], keyboard: [] };
if (EXPECT === "seeded") runFixtureScript(["--seed-pricing-fixtures"]);

const browser = await launchBrowser("about:blank");
const { client } = browser;
await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

async function waitFor(expression, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await client.evaluate(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}
async function visit(url) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await client.evaluate(`window.__f011Stale = true`).catch(() => undefined);
  await goto(client, url);
  assert(await waitFor(`!window.__f011Stale && document.readyState === "complete"`, 200), `Navigation to ${url} never produced a fresh document`, {});
  await new Promise((resolve) => setTimeout(resolve, 250));
}
async function setAppearance({ theme, locale, width, height }) {
  await viewport(client, width, height);
  await visit(`${baseUrl}/robots.txt`);
  await client.evaluate(`(() => { localStorage.setItem("hills-theme", ${JSON.stringify(theme)}); localStorage.setItem("hills-locale", ${JSON.stringify(locale)}); })()`);
}

async function surface() {
  return client.evaluate(`(async () => {
    const root = document.documentElement;
    // A hero CTA on the homepage animates its background; a contrast reading taken mid-transition is not a real
    // violation. A persistent one survives the re-check after the animation has settled.
    let axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    if (axeResult.violations.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      axeResult = await axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
    }
    const stage = document.querySelector("[data-reference-price-stage]");
    const unavailable = document.querySelector('[data-reference-price="unavailable"]');
    const current = [...document.querySelectorAll('[data-reference-price="current"]')];
    const stale = [...document.querySelectorAll('[data-reference-price="stale"]')];
    const isLtrRun = (el) => getComputedStyle(el).direction === "ltr" && (el.getAttribute("dir") === "ltr" || el.closest("[dir=ltr]") !== null);
    const region = stage ?? unavailable ?? document.querySelector("[data-reference-price]");
    const scope = document.querySelector("[data-reference-price]")?.closest("section")?.parentElement ?? document.body;
    return {
      path: location.pathname + location.search, lang: root.lang, dir: root.dir, dark: root.classList.contains("dark"),
      overflow: root.scrollWidth - root.clientWidth, mains: document.querySelectorAll("main").length,
      body: document.body.innerText,
      unavailableReason: unavailable?.getAttribute("data-unavailable-reason") ?? null,
      currentCount: current.length, staleCount: stale.length,
      staleValueLeak: stale.some((el) => el.querySelector("data, [data-reference-value]") !== null),
      disclosure: current.map((el) => Object.fromEntries(["source", "unit", "currency", "observed", "time-zone", "delay-type", "reference-only"].map((k) => [k, Boolean(el.querySelector('[data-disclosure="' + k + '"]')?.textContent?.trim())]))),
      valueDescribed: current.map((el) => { const v = el.querySelector("[data-reference-value]"); const id = v?.getAttribute("aria-describedby"); return Boolean(id && document.getElementById(id)?.textContent?.trim()); }),
      ltrRuns: current.flatMap((el) => [...el.querySelectorAll("[data-reference-value] bdi, [data-disclosure=observed] time, [data-disclosure=unit] bdi, [data-disclosure=currency] bdi, [data-disclosure=time-zone] bdi")].map((n) => isLtrRun(n))),
      referenceOnlyEverywhere: [...document.querySelectorAll("[data-reference-price]")].every((el) => Boolean(el.querySelector('[data-disclosure="reference-only"]'))),
      interactiveInStage: region ? [...region.querySelectorAll("a, button, input, select, textarea, form, [tabindex]")].length : 0,
      basis: Boolean(document.querySelector("[data-basis-breakdown]")),
      basisExplanatory: document.querySelector("[data-basis-breakdown]")?.getAttribute("data-explanatory-only") ?? null,
      notSummed: Boolean(document.querySelector("[data-not-summed]")?.textContent?.trim()),
      basisComponents: document.querySelectorAll("[data-basis-component]").length,
      violations: axeResult.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
      stageText: (stage ?? unavailable)?.innerText ?? "",
    };
  })()`);
}

function baseChecks(label, appearance, s) {
  const diag = { path: s.path, body: s.body.slice(0, 300) };
  assert(s.lang === appearance.locale && s.dir === (appearance.locale === "ar" ? "rtl" : "ltr"), `${label}: wrong lang/dir`, diag);
  assert(s.dark === (appearance.theme === "dark"), `${label}: theme not applied`, diag);
  assert(s.overflow <= 1, `${label}: horizontal overflow`, { overflow: s.overflow });
  assert(s.mains === 1, `${label}: expected exactly one <main>`, { mains: s.mains, ...diag });
  assert(!RAW_ERROR.test(s.stageText), `${label}: raw error/undefined text in the reference stage`, { stage: s.stageText.slice(0, 400) });
  assert(s.interactiveInStage === 0, `${label}: an interactive control inside the reference stage (must never be an offer)`, { n: s.interactiveInStage });
  assert(s.referenceOnlyEverywhere, `${label}: a reference block lacks the reference-only statement`, diag);
  assert(s.violations.length === 0, `${label}: axe violations`, s.violations);
}

async function keyboardPass(url, label) {
  await visit(url);
  await client.evaluate(`document.body.focus()`);
  const stops = [];
  for (let step = 0; step < 60; step += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const stop = await client.evaluate(`(() => { const el = document.activeElement; if (!el || el === document.body) return null; const repeat = el.hasAttribute("data-f011-visited"); el.setAttribute("data-f011-visited", ""); const cs = getComputedStyle(el); return { repeat, same: el === window.__f011Last, inStage: Boolean(el.closest("[data-reference-price]")), visible: el.matches(":focus-visible") && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"), _set: (window.__f011Last = el, true) }; })()`);
    if (!stop) break;
    assert(!stop.same, `${label}: focus did not move (keyboard trap)`, stop);
    if (stop.repeat) break;
    stops.push(stop);
  }
  assert(stops.length > 0, `${label}: keyboard never reached anything`, {});
  assert(stops.every((s) => !s.inStage), `${label}: keyboard focus landed INSIDE the reference stage (it must contain no controls)`, stops.filter((s) => s.inStage));
  const invisible = stops.filter((s) => !s.visible);
  assert(invisible.length === 0, `${label}: focused elements without a visible focus indicator`, invisible);
  return stops.length;
}

try {
  // ── A. the real homepage ──────────────────────────────────────────────────────────────────────────────────────
  for (const appearance of APPEARANCES) {
    await setAppearance(appearance);
    await visit(`${baseUrl}/`);
    assert(await waitFor(`Boolean(document.querySelector("[data-reference-price]"))`), "the homepage has no reference-price block", {});
    const s = await surface();
    const label = `home ${appearance.locale}-${appearance.theme}-${appearance.width}`;
    baseChecks(label, appearance, s);
    if (EXPECT === "read_failed") {
      assert(s.unavailableReason === "read_failed", `${label}: expected the honest read_failed state, got ${s.unavailableReason ?? "a value state"}`, { stage: s.stageText.slice(0, 300) });
      assert(!/\d/.test(s.stageText.replace(/\s/g, "")), `${label}: a number appears in the unavailable state`, { stage: s.stageText.slice(0, 300) });
    } else {
      assert(s.currentCount >= 1 && s.disclosure.every((d) => Object.values(d).every(Boolean)), `${label}: a current benchmark lacks a disclosure element`, s.disclosure);
      assert(s.valueDescribed.every(Boolean), `${label}: a value is not associated with its disclosure`, {});
      assert(s.ltrRuns.length > 0 && s.ltrRuns.every(Boolean), `${label}: a numeral/currency/timestamp is not an isolated LTR run`, {});
      assert(s.staleCount >= 1 && !s.staleValueLeak, `${label}: the stale feed must be shown as stale with NO value`, { staleCount: s.staleCount });
      assert(s.basis && s.basisExplanatory === "true" && s.notSummed && s.basisComponents >= 2, `${label}: the basis breakdown is missing / not explanatory`, {});
      for (const leaked of ["111.111", "222.222", "333.333", "444.444", "F011 Pending", "F011 Restricted", "F011 Disabled", "F011 Inactive", "1.0812", "EURUSD", "F011 internal note", "5.55", "9.99", "7.77"]) assert(!s.body.includes(leaked), `${label}: non-public data leaked: ${leaked}`, {});
      assert(!s.body.includes("13.25"), `${label}: a summed differential appears`, {});
      // EXACT stored amount / currency / unit (the columns' fixed scale pads the stored text, e.g. 250.125000), and no conversion.
      const exact = await client.evaluate(`(() => { const card = [...document.querySelectorAll('[data-reference-price="current"]')].find((el) => el.textContent.includes("F011 Approved Source")); const stale = [...document.querySelectorAll('[data-reference-price="stale"]')].map((el) => el.textContent); return { value: card?.querySelector("[data-reference-value] data")?.textContent ?? null, attr: card?.querySelector("[data-reference-value] data")?.getAttribute("value") ?? null, unit: card?.querySelector('[data-disclosure="unit"]')?.textContent ?? null, currency: card?.querySelector('[data-disclosure="currency"]')?.textContent ?? null, observed: card?.querySelector('[data-disclosure="observed"]')?.textContent ?? null, delay: card?.querySelector('[data-disclosure="delay-type"]')?.getAttribute("data-delay-type") ?? null, amounts: [...document.querySelectorAll("[data-differential-amount]")].map((el) => el.textContent), units: [...document.querySelectorAll("[data-differential-unit]")].map((el) => el.textContent), staleText: stale.join(" ") }; })()`);
      assert(/^250\.1250*$/.test(exact.value ?? "") && exact.attr === exact.value, `${label}: stored value not shown exactly`, exact);
      assert(exact.unit === "cents/lb" && exact.currency === "USD" && exact.observed === "2026-09-01 12:00 UTC" && exact.delay === "DELAYED", `${label}: unit/currency/timestamp/delay not exactly as stored`, exact);
      assert(exact.amounts.length === 2 && /^12\.50*$/.test(exact.amounts[0]) && /^0\.750*$/.test(exact.amounts[1]) && exact.units.every((u) => u === "USD · KG"), `${label}: differential amounts/units not exactly as stored`, exact);
      assert(!/4100/.test(exact.staleText), `${label}: the stale figure is not withheld`, exact);
      assert(!/(converted|per kg|per lb|USD\/kg|USD\/MT)/i.test(s.stageText.replace(/not added together, netted or converted\.?/gi, "").replace(/No currency or unit conversion is applied\.?/gi, "")), `${label}: conversion language/figures appear`, { stage: s.stageText.slice(0, 500) });
    }
    report.home.push({ label, state: EXPECT, current: s.currentCount, stale: s.staleCount, basis: s.basis, overflow: s.overflow, violations: 0 });
  }
  await setAppearance({ locale: "en", theme: "light", width: 1366, height: 900 });
  report.keyboard.push({ surface: "home", stops: await keyboardPass(`${baseUrl}/`, "home en") });
  await setAppearance({ locale: "ar", theme: "dark", width: 390, height: 844 });
  report.keyboard.push({ surface: "home", stops: await keyboardPass(`${baseUrl}/`, "home ar/390") });

  // ── B. the temporary harness route: every state from static fixtures ───────────────────────────────────────────
  if (HARNESS) {
    const probe = await fetch(`${baseUrl}/f011-proof?state=ready`);
    assert(probe.ok, "the temporary /f011-proof harness route is not available (set HILLS_F011_HARNESS=0 to skip part B)", { status: probe.status });
    const STATES = [
      { state: "ready", current: 2, stale: 1, basis: true },
      { state: "stale", current: 0, stale: 1, basis: false },
      { state: "no_approved_source", reason: "no_approved_source" },
      { state: "no_observation", reason: "no_observation" },
      { state: "incomplete_disclosure", reason: "incomplete_disclosure" },
      { state: "read_failed", reason: "read_failed" },
    ];
    for (const appearance of APPEARANCES) {
      for (const spec of STATES) {
        await setAppearance(appearance);
        await visit(`${baseUrl}/f011-proof?state=${spec.state}`);
        assert(await waitFor(`Boolean(document.querySelector("[data-reference-price]"))`), `harness ${spec.state}: no reference block`, {});
        const s = await surface();
        const label = `harness ${spec.state} ${appearance.locale}-${appearance.theme}-${appearance.width}`;
        baseChecks(label, appearance, s);
        if (spec.reason) {
          assert(s.unavailableReason === spec.reason, `${label}: wrong unavailable reason`, { got: s.unavailableReason });
          assert(s.currentCount === 0 && s.staleCount === 0, `${label}: a value block renders inside an unavailable state`, { current: s.currentCount, stale: s.staleCount });
          // the only digits allowed are the last-success timestamp (no_observation) — never a price-like figure
          const withoutTimestamp = s.stageText.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/g, "");
          assert(!/\d/.test(withoutTimestamp), `${label}: a number appears in the unavailable state`, { stage: s.stageText.slice(0, 300) });
        } else {
          assert(s.currentCount === spec.current && s.staleCount === spec.stale, `${label}: wrong entry counts`, { current: s.currentCount, stale: s.staleCount });
          assert(s.disclosure.every((d) => Object.values(d).every(Boolean)), `${label}: a current benchmark lacks a disclosure element`, s.disclosure);
          assert(s.valueDescribed.every(Boolean), `${label}: a value is not programmatically associated with its disclosure`, {});
          assert(s.ltrRuns.every(Boolean), `${label}: a numeral/currency/timestamp is not an isolated LTR run`, {});
          assert(!s.staleValueLeak, `${label}: the stale state shows a value`, {});
          assert(s.basis === spec.basis, `${label}: basis presence mismatch`, { basis: s.basis });
          if (spec.basis) {
            assert(s.basisExplanatory === "true" && s.notSummed && s.basisComponents === 3, `${label}: basis not explanatory / components missing`, {});
            assert(!s.body.includes("16.25") && !s.body.includes("13.25"), `${label}: a summed differential appears`, {});
          }
          if (spec.state === "ready") assert(s.stageText.includes("250.125000") && s.stageText.includes("4100.100000"), `${label}: stored values not shown exactly`, { stage: s.stageText.slice(0, 500) });
        }
        report.harness.push({ label, violations: 0, overflow: s.overflow, current: s.currentCount, stale: s.staleCount });
      }
    }
    await setAppearance({ locale: "en", theme: "light", width: 1366, height: 900 });
    report.keyboard.push({ surface: "harness ready en", stops: await keyboardPass(`${baseUrl}/f011-proof?state=ready`, "harness en") });
    await setAppearance({ locale: "ar", theme: "dark", width: 390, height: 844 });
    report.keyboard.push({ surface: "harness ready ar/390", stops: await keyboardPass(`${baseUrl}/f011-proof?state=ready`, "harness ar/390") });
  }

  assert(client.consoleErrors.length === 0, "Browser console errors", client.consoleErrors);
  assert(client.pageErrors.length === 0, "Browser page errors", client.pageErrors);
  assert(client.requestFailures.length === 0, "Browser request failures", client.requestFailures);
  console.log("FEATURE-011-BROWSER-REPORT", JSON.stringify({ mode: EXPECT, harness: HARNESS, homeSurfaces: report.home.length, harnessSurfaces: report.harness.length, keyboard: report.keyboard, sample: report.home[0] }, null, 2));
} finally {
  // Chrome's crash-metrics file can stay locked on Windows for a moment after kill; that must never mask the proof's own result.
  try {
    await browser.close();
  } catch (error) {
    console.log("FEATURE-011-BROWSER-CLOSE-WARNING", String(error?.code ?? error));
  }
  if (EXPECT === "seeded") {
    try {
      console.log("FEATURE-011-BROWSER-CLEANUP", runFixtureScript(["--cleanup-pricing-fixtures"]).split(/\r?\n/).find((l) => l.startsWith("{")));
    } catch (error) {
      console.log("FEATURE-011-BROWSER-CLEANUP-FAILED", String(error?.stderr ?? error).split(/\r?\n/).pop());
      process.exitCode = 1;
    }
  }
}
