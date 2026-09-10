// Feature 002 Phase 12 production proof — T045 through T050.
import { readFileSync } from "node:fs";
import { assert, goto, launchBrowser, viewport } from "./cdp-harness.mjs";

const baseUrl = process.env.HILLS_UI_URL ?? "http://127.0.0.1:3231";
const routes = ["/", "/coffee/", "/coffee/public-test-coffee-published/", "/origins/", "/origins/public-test-origin-active/", "/sourcing/", "/contact/", "/portal-entry/", "/about/"];
const canaries = ["HILLSCANARY-COFFEE-DRAFT-4F1A93C7", "HILLSCANARY-COFFEE-ARCHIVED-8B2E57D0", "HILLSCANARY-ORIGIN-INACTIVE-1C6D40AB", "HILLSCANARY-ORIGIN-ARCHIVED-5E9F82B4", "HILLSCANARY-CERTNUMBER-2A7C63EF", "Foundation Test — Buyer Only"];
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const delays = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pressKey(client, key, code = key, windowsVirtualKeyCode = 0) {
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
  if (key === "Enter") await client.send("Input.dispatchKeyEvent", { type: "char", key, text: "\r" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
}

const browser = await launchBrowser(`${baseUrl}/`);
const { client } = browser;
const report = { harness: {}, responsive: [], rtl: [], accessibility: [], vitals: [], noJs: [], errors: null };

try {
  // T045 — current production DOM is loaded through CDP with deterministic browser state.
  await viewport(client, 1440, 1000);
  await goto(client, `${baseUrl}/`);
  report.harness = await client.evaluate(`({ title: document.title, h1: document.querySelector('h1')?.textContent?.trim(), main: Boolean(document.querySelector('main')), width: innerWidth })`);
  assert(report.harness.main && report.harness.h1 && report.harness.width === 1440, "T045 harness did not read live production DOM", report.harness);

  // T046 — every owned route, three deliberate viewports; measures overflow, visible opener/CTA and CLS.
  for (const [label, width, height] of [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 1000]]) {
    await viewport(client, width, height);
    for (const route of routes) {
      await goto(client, `${baseUrl}${route}`);
      const layout = await client.evaluate(`(() => {
        const root = document.documentElement;
        const h1 = document.querySelector('h1')?.getBoundingClientRect();
        const visibleControls = Array.from(document.querySelectorAll('main a[href], main button')).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0);
        const cls = performance.getEntriesByType('layout-shift').filter((entry) => !entry.hadRecentInput).reduce((sum, entry) => sum + entry.value, 0);
        return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, h1: h1 && { left: h1.left, right: h1.right, width: h1.width }, visibleControls: visibleControls.map((r) => ({ left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height })), cls, media: Array.from(document.querySelectorAll('[data-media-placeholder]')).map((el) => getComputedStyle(el).aspectRatio) };
      })()`);
      assert(layout.scrollWidth <= layout.clientWidth + 1, `${label} ${route} has horizontal overflow`, layout);
      assert(layout.h1 && layout.h1.left >= -1 && layout.h1.right <= layout.clientWidth + 1, `${label} ${route} clips H1`, layout);
      assert(layout.visibleControls.every((r) => r.left >= -1 && r.right <= layout.clientWidth + 1 && r.height >= 40), `${label} ${route} has clipped/undersized visible control`, layout);
      assert(layout.cls <= 0.1, `${label} ${route} has unacceptable cumulative layout shift`, layout);
      if (layout.media.length) assert(layout.media.every(Boolean), `${label} ${route} placeholder lacks reserved dimensions`, layout);
      report.responsive.push({ label, route, ...layout });
    }
  }

  // T047 — actual Arabic preference plus a long RTL content injection exercises the rendered layout.
  for (const [label, width, height] of [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 1000]]) {
    await viewport(client, width, height);
    for (const route of routes) {
      await client.evaluate(`localStorage.setItem('hills-locale', 'ar')`);
      await goto(client, `${baseUrl}${route}`);
      const rtl = await client.evaluate(`(() => {
        const paragraph = document.querySelector('main p');
        if (paragraph) paragraph.textContent = 'هذا محتوى عربي طويل لاختبار التفاف النص داخل المساحة المتاحة دون قص أو تمرير أفقي. '.repeat(16);
        const root = document.documentElement;
        const breadcrumb = Array.from(document.querySelectorAll('nav a')).find((a) => a.textContent?.trim());
        const iconTransforms = Array.from(document.querySelectorAll('svg[data-directional-icon="true"]')).map((el) => getComputedStyle(el).transform);
        return { dir: root.dir, clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, paragraph: paragraph && { clientWidth: paragraph.clientWidth, scrollWidth: paragraph.scrollWidth, textAlign: getComputedStyle(paragraph).textAlign }, breadcrumb: breadcrumb && breadcrumb.getBoundingClientRect().toJSON(), iconTransforms };
      })()`);
      assert(rtl.dir === "rtl", `${label} ${route} did not enter RTL`, rtl);
      assert(rtl.scrollWidth <= rtl.clientWidth + 1, `${label} ${route} RTL overflow`, rtl);
      assert(!rtl.paragraph || rtl.paragraph.scrollWidth <= rtl.paragraph.clientWidth + 1, `${label} ${route} long RTL string clipped`, rtl);
      assert(!rtl.breadcrumb || (rtl.breadcrumb.left >= -1 && rtl.breadcrumb.right <= rtl.clientWidth + 1), `${label} ${route} RTL breadcrumb clipped`, rtl);
      report.rtl.push({ label, route, ...rtl });
    }
  }
  await client.evaluate(`localStorage.setItem('hills-locale', 'en')`);

  // T048 — axe stays dev-only; DOM semantic/keyboard/motion checks are performed in Chrome.
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });
  await viewport(client, 390, 844);
  for (const route of routes) {
    await goto(client, `${baseUrl}${route}`);
    const result = await client.evaluate(`(async () => {
      const axeResult = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } });
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]));
      const h1Count = headings.filter((level) => level === 1).length;
      const skips = headings.some((level, index) => index > 0 && level > headings[index - 1] + 1);
      return { violations: axeResult.violations.map((v) => ({ id:v.id, impact:v.impact, nodes:v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), h1Count, skips, landmarks: { main:Boolean(document.querySelector('main')), nav:Boolean(document.querySelector('nav')), footer:Boolean(document.querySelector('footer')) } };
    })()`);
    assert(result.violations.length === 0, `axe WCAG violation on ${route}`, result);
    assert(result.h1Count === 1 && !result.skips && result.landmarks.main && result.landmarks.nav && result.landmarks.footer, `semantic/heading failure on ${route}`, result);
    report.accessibility.push({ route, ...result });
  }
  await goto(client, `${baseUrl}/contact/`);
  const formA11y = await client.evaluate(`(() => { const consent = document.querySelector('input[type="checkbox"]'); return { labels: ['Company name','What best describes your business','Country','Estimated volume (kg)','Your name','Email'].every((name) => Boolean(Array.from(document.querySelectorAll('label')).find((label) => label.textContent.trim() === name))), consent: Boolean(consent && (consent.labels?.length || consent.closest('label')?.textContent?.trim())), submit: Boolean(document.querySelector('button[type="submit"]')) }; })()`);
  assert(formA11y.labels && formA11y.consent && formA11y.submit, "RFQ labels or consent control are inaccessible", formA11y);

  // Use CDP key events, rather than synthetic focus only, for the public controls' real keyboard path.
  await viewport(client, 1440, 1000);
  await goto(client, `${baseUrl}/`);
  await client.evaluate(`document.querySelector('#hc-search-trigger')?.focus()`);
  await pressKey(client, "Enter", "Enter", 13);
  await delays(100);
  const searchKeyboard = await client.evaluate(`({ dialog: Boolean(document.querySelector('[role="dialog"]')), fieldFocused: document.activeElement?.matches('input[type="search"]') })`);
  assert(searchKeyboard.dialog && searchKeyboard.fieldFocused, "keyboard could not open and focus Search", searchKeyboard);
  await pressKey(client, "Escape", "Escape", 27);
  await delays(400);
  assert(await client.evaluate(`document.activeElement?.id === 'hc-search-trigger'`), "Search did not restore keyboard focus to its trigger");

  await viewport(client, 390, 844);
  await goto(client, `${baseUrl}/`);
  await client.evaluate(`document.querySelector('#hc-menu-trigger')?.focus()`);
  await pressKey(client, "Enter", "Enter", 13);
  await delays(100);
  const drawerKeyboard = await client.evaluate(`({ dialog: Boolean(document.querySelector('[role="dialog"]')), focusInside: Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)) })`);
  assert(drawerKeyboard.dialog && drawerKeyboard.focusInside, "keyboard could not open or focus the mobile drawer", drawerKeyboard);
  await pressKey(client, "Tab", "Tab", 9);
  assert(await client.evaluate(`Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement))`), "mobile drawer failed to retain keyboard focus");
  await pressKey(client, "Escape", "Escape", 27);
  await delays(400);
  assert(await client.evaluate(`document.activeElement?.id === 'hc-menu-trigger'`), "mobile drawer did not restore keyboard focus to its trigger");

  await goto(client, `${baseUrl}/contact/`);
  await client.evaluate(`document.body.tabIndex = -1; document.body.focus()`);
  let companyFieldReached = false;
  for (let index = 0; index < 80; index += 1) {
    await pressKey(client, "Tab", "Tab", 9);
    if (await client.evaluate(`document.activeElement?.matches('input[name="companyName"]')`)) {
      companyFieldReached = true;
      break;
    }
  }
  assert(companyFieldReached, "keyboard traversal could not reach the RFQ company field");
  await pressKey(client, "Tab", "Tab", 9);
  const formKeyboard = await client.evaluate(`(() => { const active = document.activeElement; const style = active ? getComputedStyle(active) : null; return { tag: active?.tagName, focusVisible: Boolean(active?.matches(':focus-visible') && style && (style.outlineStyle !== 'none' || style.outlineWidth !== '0px' || style.boxShadow !== 'none')), outline: style && { style: style.outlineStyle, width: style.outlineWidth, boxShadow: style.boxShadow } }; })()`);
  assert(["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(formKeyboard.tag) && formKeyboard.focusVisible, "RFQ form keyboard traversal or focus indication failed", formKeyboard);
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reducedMotion = await client.evaluate(`(() => { const s=getComputedStyle(document.documentElement); return ['--dur-instant','--dur-fast','--dur-base','--dur-slow','--dur-slowest'].map((name) => s.getPropertyValue(name).trim()); })()`);
  assert(reducedMotion.every((duration) => duration === "1ms"), "reduced motion tokens were not collapsed", { reducedMotion });
  await client.send("Emulation.setEmulatedMedia", { features: [] });

  // T049 — lab CWV under a fixed throttled mobile profile, using browser PerformanceObserver values.
  await client.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024, connectionType: "cellular4g" });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { window.__hillsVitals={lcp:0,cls:0,inp:0}; new PerformanceObserver((list)=>{ for(const entry of list.getEntries()) window.__hillsVitals.lcp=Math.max(window.__hillsVitals.lcp, entry.startTime); }).observe({type:'largest-contentful-paint', buffered:true}); new PerformanceObserver((list)=>{ for(const entry of list.getEntries()) if(!entry.hadRecentInput) window.__hillsVitals.cls+=entry.value; }).observe({type:'layout-shift', buffered:true}); new PerformanceObserver((list)=>{ for(const entry of list.getEntries()) window.__hillsVitals.inp=Math.max(window.__hillsVitals.inp, entry.duration); }).observe({type:'event', buffered:true, durationThreshold:0}); })();` });
  await viewport(client, 390, 844);
  for (const route of routes) {
    await goto(client, `${baseUrl}${route}`);
    await delays(700);
    await client.evaluate(`document.querySelector('main a[href], main button')?.focus()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await delays(150);
    const vitals = await client.evaluate(`window.__hillsVitals`);
    assert(vitals.lcp > 0 && vitals.lcp <= 2500 && vitals.cls <= 0.1 && vitals.inp <= 200, `CWV threshold failed on ${route}`, vitals);
    report.vitals.push({ route, ...vitals });
  }
  await client.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  // T050 — JavaScript-disabled server HTML remains meaningful and contains followable priority anchors.
  for (const route of routes) {
    await viewport(client, 390, 844);
    await goto(client, `${baseUrl}${route}`, { scripts: false });
    const noJs = await client.evaluate(`(() => ({ h1: document.querySelector('h1')?.textContent?.trim(), mainText: document.querySelector('main')?.textContent?.trim().length ?? 0, anchors: Array.from(document.querySelectorAll('a[href]')).filter((a) => a.textContent.trim() && a.getAttribute('href')).length, forms: document.querySelectorAll('form').length }))()`);
    assert(noJs.h1 && noJs.mainText > 40 && noJs.anchors > 0, `JS-disabled page is not meaningful/crawlable: ${route}`, noJs);
    report.noJs.push({ route, ...noJs });
  }
  await client.send("Emulation.setScriptExecutionDisabled", { value: false });

  const serialized = JSON.stringify(report);
  for (const canary of canaries) assert(!serialized.includes(canary), `browser report leaked private canary ${canary}`);
  report.errors = { consoleErrors: client.consoleErrors, pageErrors: client.pageErrors, requestFailures: client.requestFailures };
  assert(client.consoleErrors.length === 0 && client.pageErrors.length === 0 && client.requestFailures.length === 0, "browser error gate failed", report.errors);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
