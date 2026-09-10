// T040 production proof for generated crawler-facing responses.
const baseUrl = process.env.HILLS_PHASE11_URL ?? "http://127.0.0.1:3231";
const forbidden = ["/dashboard", "/dashboard-admin", "/foundation-status", "/internal-test/", "/knowledge/", "/legal/"];
const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
const sitemapBody = await sitemap.text();
if (!sitemap.ok || !sitemap.headers.get("content-type")?.includes("xml")) throw new Error("sitemap.xml is not a successful XML response");
for (const path of forbidden) if (sitemapBody.includes(path)) throw new Error(`sitemap leaked non-public path: ${path}`);
for (const path of ["/", "/coffee/", "/origins/", "/sourcing/", "/contact/", "/portal-entry/"]) {
  if (!sitemapBody.includes(path)) throw new Error(`sitemap missing public canonical path: ${path}`);
}
const robots = await fetch(`${baseUrl}/robots.txt`);
const robotsBody = await robots.text();
for (const disallow of ["/dashboard", "/dashboard-admin", "/foundation-status", "/internal-test/"]) {
  if (!robotsBody.includes(`Disallow: ${disallow}`)) throw new Error(`robots.txt missing ${disallow}`);
}
const foundation = await fetch(`${baseUrl}/foundation-status/`);
const foundationBody = await foundation.text();
if (!foundationBody.includes('<meta name="robots" content="noindex, nofollow"')) throw new Error("foundation-status missing rendered noindex metadata");
const cacheProof = await fetch(`${baseUrl}/internal-test/cache-proof/`, { redirect: "manual" });
const cacheBody = await cacheProof.text();
if (cacheProof.status !== 404 || cacheBody !== "" || cacheProof.headers.get("x-robots-tag") !== "noindex, nofollow") {
  throw new Error(`disabled cache-proof boundary incorrect: ${cacheProof.status} ${cacheProof.headers.get("x-robots-tag")} ${cacheBody.length}`);
}
console.log("T040 production SEO boundary passed");
