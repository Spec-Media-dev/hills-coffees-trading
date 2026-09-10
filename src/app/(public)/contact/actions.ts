"use server";

import { headers } from "next/headers";

import type { ServerActionResult } from "@/lib/types/server-action";
import { RFQ_UNAVAILABLE, RfqInput } from "@/lib/validation/rfq";

import { checkRfqAbuseGuard } from "./abuse-guard";

/**
 * The RFQ Server Action (Feature 002 T021 — `contracts/rfq-contract.md`).
 *
 * Anonymous RFQ is NOT an authenticated member Server Action, so 001's `getRequestIdentity()` step
 * does not apply (contract §5 step 2) — this action never calls it and never reads or writes member
 * data. Every other Server Action discipline step still applies, in this order:
 *
 * 1. EARLY SHAPE/SIZE CONTROL — reject an oversized field before any parsing (§2, §4.1).
 * 2. VALIDATE — the SAME Zod schema (`RfqInput`) the client form uses; this call is the enforced
 *    gate regardless of what client-side validation did.
 * 3. ABUSE SAFEGUARD — a per-instance, best-effort, non-durable throttle (§4, ABUSE-01); see
 *    `./abuse-guard.ts`. The rejection message discloses no threshold or counter.
 * 4. CONTROLLED DATA ACCESS — currently none. **DB-BLOCK-02** (no approved anonymous-RFQ
 *    persistence destination) and **CRM-DEST-01** (no approved CRM hand-off destination) mean this
 *    action stops here: no shadow table, no browser-storage write, no outbound call of any kind,
 *    no privileged database client.
 * 5. SAFE ERROR MAPPING / HONEST RESULT — a genuinely valid submission returns the documented
 *    *unavailable* outcome (§1 "the honesty rule", §3). This action has **no successful-result
 *    path**; claiming success while nothing was delivered would be a commercial-honesty failure,
 *    not a missing feature.
 * 6. REVALIDATE — none. Nothing about a submission is cached, and this action must never revalidate
 *    a public cache tag (§5 step 6).
 *
 * Untrusted input (SEC-004) is validated and then discarded — never echoed into HTML, logs, or any
 * error string beyond its own field's validation message.
 */

const MAX_RAW_FIELD_LENGTH = 2000; // the largest field bound in the schema (`message`, §2)

export async function submitRfq(
  _prevState: ServerActionResult<never> | undefined,
  formData: FormData
): Promise<ServerActionResult<never>> {
  // 1. EARLY SHAPE/SIZE CONTROL
  for (const value of formData.values()) {
    if (typeof value === "string" && value.length > MAX_RAW_FIELD_LENGTH) {
      return { ok: false, error: "One of the fields is too long." };
    }
  }

  // 2. VALIDATE
  const parsed = RfqInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 3. ABUSE SAFEGUARD
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwardedFor || headerList.get("x-real-ip") || "anonymous";
  if (!checkRfqAbuseGuard(key)) {
    return { ok: false, error: "Please try again shortly." };
  }

  // 4. CONTROLLED DATA ACCESS — none; see file header.

  // 5. SAFE ERROR MAPPING / HONEST RESULT
  return { ok: false, error: RFQ_UNAVAILABLE };
}
