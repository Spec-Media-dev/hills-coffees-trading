/**
 * RFQ abuse safeguard (Feature 002 T022 — `contracts/rfq-contract.md` §4).
 *
 * **ABUSE-01 — PRE-PRODUCTION BLOCKER.** This is a per-instance, in-memory sliding-window throttle.
 * It is honestly **best-effort, single-instance and non-durable**: a Next.js deployment may run
 * several server instances, each with its own independent counter that resets on redeploy. It raises
 * the cost of casual abuse and nothing more — it is NOT distributed rate limiting, and this module
 * must never be described as one. No Redis, no Upstash, no external cache/rate-limit service
 * (Constitution Principle XI). Durable, multi-instance protection needs an approved edge/WAF
 * capability or an approved durable counter, neither of which exists yet.
 *
 * The rejection this guard causes discloses no threshold, no counter and no remaining-attempts
 * value to the caller (§4.4) — only a neutral, timing-irrelevant message.
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

/** Hard cap on tracked keys so a flood of distinct keys cannot itself grow memory unboundedly. */
const MAX_TRACKED_KEYS = 5000;

const submissionsByKey = new Map<string, number[]>();

/**
 * Returns `true` when the submission identified by `key` (typically a best-effort client IP; falls
 * back to a shared bucket when no IP header is present) is allowed to proceed, `false` when the
 * per-instance throttle rejects it. Records the attempt either way it is allowed.
 */
export function checkRfqAbuseGuard(key: string, now: number = Date.now()): boolean {
  const recent = (submissionsByKey.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    submissionsByKey.set(key, recent);
    return false;
  }

  recent.push(now);
  submissionsByKey.set(key, recent);

  if (submissionsByKey.size > MAX_TRACKED_KEYS) {
    const oldestKey = submissionsByKey.keys().next().value;
    if (oldestKey !== undefined) submissionsByKey.delete(oldestKey);
  }

  return true;
}

/** TEST-ONLY: clears all tracked state so tests do not leak state into one another. */
export function __resetRfqAbuseGuard(): void {
  submissionsByKey.clear();
}
