import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { __readCoffeeDetailCacheStamp, __readCoffeeIndexCacheStamp } from "@/lib/public/coffees";
import { __readOriginDetailCacheStamp, __readOriginIndexCacheStamp } from "@/lib/public/origins";
import { __readTaxonomyCacheStamp } from "@/lib/public/taxonomy";

/**
 * The cache-proof route (Feature 002 T031a — `contracts/public-cache-policy.md` §5.3, the "single
 * canonical path... verbatim everywhere"). Implemented literally from that specification; nothing
 * here is a reinterpretation.
 *
 * WHAT THIS IS: a guarded, disabled-by-default internal harness that lets T031 observe a real
 * `unstable_cache` hit/recompute cycle against the SAME running server and cache instance the public
 * pages use, without mutating catalogue data (§5.2's provenance-stamp mechanism) and without ever
 * becoming a publicly-reachable purge endpoint (§5.1's absolute prohibition — Feature 001's
 * `/foundation-status` public-button pattern is explicitly NOT copied here).
 *
 * GATING ORDER (never reorder): (1) `CACHE_PROOF_ENABLED === "true"` — checked FIRST, before any
 * header/body/tag is read; a deployed production environment simply never sets this, so the route is
 * absent there by default (§5.3.2). (2) `x-cache-proof-secret` must equal `CACHE_PROOF_SECRET`.
 * Either failing returns an EMPTY `404` — never `401`/`403`, so the route never discloses that a
 * guarded capability exists behind the wrong answer. Both env vars are server-only; neither is ever
 * `NEXT_PUBLIC_*`.
 *
 * This handler never constructs a privileged database client, never resolves a request identity,
 * and never touches session/organization context or any catalogue mutation. It reads/revalidates
 * public cache entries ONLY and returns ONLY the diagnostic stamp — never a DTO, never a database
 * row, never private data.
 */

const ENABLED_ENV = "CACHE_PROOF_ENABLED";
const SECRET_ENV = "CACHE_PROOF_SECRET";
const SECRET_HEADER = "x-cache-proof-secret";

/** Fixed allowlist — exact tags plus the two strictly-patterned parameterised forms (§5.3, "Tag allowlist"). */
const EXACT_TAGS = new Set(["public-coffees", "public-origins", "public-taxonomy"]);
const COFFEE_DETAIL_TAG = /^public-coffee:([a-z0-9-]{1,100})$/;
const ORIGIN_DETAIL_TAG = /^public-origin:([a-z0-9-]{1,100})$/;

const ROBOTS_HEADER = { "X-Robots-Tag": "noindex, nofollow" } as const;

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: ROBOTS_HEADER });
}

function badRequest(error: "tag_not_allowed" | "bad_request"): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400, headers: ROBOTS_HEADER });
}

/** Whether the caller may use this route at all — the flag, THEN the secret, in that order. */
function isAuthorized(request: NextRequest): boolean {
  if (process.env[ENABLED_ENV] !== "true") return false;
  const secret = process.env[SECRET_ENV];
  const supplied = request.headers.get(SECRET_HEADER);
  return Boolean(secret) && supplied === secret;
}

/** Validates a tag against the fixed allowlist. Never constructs a path/function/table from input. */
function isAllowedTag(tag: string): boolean {
  return EXACT_TAGS.has(tag) || COFFEE_DETAIL_TAG.test(tag) || ORIGIN_DETAIL_TAG.test(tag);
}

async function readStamp(tag: string) {
  if (tag === "public-coffees") return __readCoffeeIndexCacheStamp();
  if (tag === "public-origins") return __readOriginIndexCacheStamp();
  if (tag === "public-taxonomy") return __readTaxonomyCacheStamp();

  const coffeeMatch = COFFEE_DETAIL_TAG.exec(tag);
  if (coffeeMatch) return __readCoffeeDetailCacheStamp(coffeeMatch[1]);

  const originMatch = ORIGIN_DETAIL_TAG.exec(tag);
  if (originMatch) return __readOriginDetailCacheStamp(originMatch[1]);

  // Unreachable: isAllowedTag has already rejected anything else before this is called.
  throw new Error("unreachable");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Gate 1: the flag, checked before anything else is read.
  if (process.env[ENABLED_ENV] !== "true") return notFound();
  // Gate 2: the secret.
  if (!isAuthorized(request)) return notFound();

  const tag = new URL(request.url).searchParams.get("tag");
  if (!tag) return badRequest("bad_request");
  if (!isAllowedTag(tag)) return badRequest("tag_not_allowed");

  const stamp = await readStamp(tag);
  return NextResponse.json({ ok: true, tag, stamp }, { status: 200, headers: ROBOTS_HEADER });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env[ENABLED_ENV] !== "true") return notFound();
  if (!isAuthorized(request)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("bad_request");
  }

  const tag = typeof body === "object" && body !== null && "tag" in body ? (body as { tag: unknown }).tag : undefined;
  if (typeof tag !== "string" || tag.length === 0) return badRequest("bad_request");
  if (!isAllowedTag(tag)) return badRequest("tag_not_allowed");

  revalidateTag(tag, { expire: 0 });

  return NextResponse.json(
    { ok: true, tag, revalidatedAt: new Date().toISOString() },
    { status: 200, headers: ROBOTS_HEADER }
  );
}
