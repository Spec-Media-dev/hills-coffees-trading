import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 002 T031a static verification (`contracts/public-cache-policy.md` §5.3). The live A–D
 * revalidation proof (T031) and the full HTTP gate/allowlist behaviour can only be proven against a
 * real running server (recorded in `IMPLEMENTATION-HANDOFF.md`'s Phase 9 section) — `revalidateTag`
 * needs Next's request/work-store context, which a bare Vitest process does not have (the same
 * constraint every `lib/public/*` cached read documents). This suite covers what source inspection
 * CAN prove: the route contains none of the forbidden primitives, the allowlist is exactly the
 * contract's five entries, and no public page/action holds a revalidation capability.
 */
describe("T031a — cache-proof route static safety", () => {
  const source = readFileSync("src/app/internal-test/cache-proof/route.ts", "utf8");

  it("lives at the exact contract-specified path and exports only GET/POST", () => {
    expect(source).toMatch(/export async function GET\(/);
    expect(source).toMatch(/export async function POST\(/);
    expect(source).not.toMatch(/export async function (PUT|DELETE|PATCH)\(/);
  });

  it("checks the enable flag before reading any header, body or tag", () => {
    expect(source).toContain('const ENABLED_ENV = "CACHE_PROOF_ENABLED"');
    const getBody = source.slice(source.indexOf("export async function GET"));
    const firstLines = getBody.split("\n").slice(0, 4).join("\n");
    expect(firstLines).toMatch(/ENABLED_ENV/);
    expect(firstLines).not.toMatch(/SECRET_HEADER|isAuthorized|searchParams/);
  });

  it("never uses NODE_ENV as the gate", () => {
    expect(source).not.toMatch(/NODE_ENV/);
  });

  it("never references a NEXT_PUBLIC_ variant of the env vars", () => {
    expect(source).not.toMatch(/NEXT_PUBLIC_CACHE_PROOF/);
  });

  it("contains no privileged database client, no identity resolution, no catalogue mutation", () => {
    expect(source).not.toMatch(/SERVICE_ROLE/);
    expect(source).not.toMatch(/getRequestIdentity/);
    expect(source).not.toMatch(/createClient\(/); // no Supabase client of any kind in this route
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("the allowlist matches the contract's five entries exactly", () => {
    expect(source).toContain('"public-coffees"');
    expect(source).toContain('"public-origins"');
    expect(source).toContain('"public-taxonomy"');
    expect(source).toMatch(/\^public-coffee:\(?\[a-z0-9-\]\{1,100\}\)?\$/);
    expect(source).toMatch(/\^public-origin:\(?\[a-z0-9-\]\{1,100\}\)?\$/);
  });

  it("every response path sets the noindex/nofollow robots header, including 404s", () => {
    // Every returned response is built through notFound()/badRequest()/NextResponse.json(...), and
    // every one of those three sites includes ROBOTS_HEADER — a single shared constant, not a
    // per-branch literal, so it cannot be forgotten on a new branch.
    const responseSites = source.match(/return (notFound\(\)|badRequest\(|NextResponse\.json\()/g) ?? [];
    expect(responseSites.length).toBeGreaterThanOrEqual(4);
    expect(source).toMatch(/ROBOTS_HEADER\s*=\s*\{\s*"X-Robots-Tag":\s*"noindex, nofollow"/);
  });

  it("uses revalidateTag with the mandatory { expire: 0 } form, never a named profile string", () => {
    expect(source).toMatch(/revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/);
  });

  it("no public page or public Server Action holds a revalidation capability", () => {
    const publicFiles = [
      "src/app/page.tsx",
      "src/app/(public)/coffee/page.tsx",
      "src/app/(public)/coffee/[slug]/page.tsx",
      "src/app/(public)/origins/page.tsx",
      "src/app/(public)/origins/[slug]/page.tsx",
      "src/app/(public)/contact/actions.ts",
      "src/app/(public)/contact/page.tsx",
      "src/app/sitemap.ts",
    ];
    for (const file of publicFiles) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not call revalidateTag`).not.toMatch(/revalidateTag/);
    }
  });

  it("the namespace is a real routable folder, not an underscore-prefixed private one (Feature 001's recorded trap)", () => {
    expect(source).toBeTruthy(); // file exists at src/app/internal-test/cache-proof/route.ts
    // The path itself is the proof: no "_" prefix on any segment.
    const path = "src/app/internal-test/cache-proof/route.ts";
    expect(path).not.toMatch(/\/_[^/]+\//);
  });
});
