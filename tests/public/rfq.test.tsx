import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { RfqForm } from "@/components/public/rfq-form";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { RFQ_UNAVAILABLE, RfqInput } from "@/lib/validation/rfq";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.42" }) }));

// jsdom does not implement matchMedia; ThemeProvider subscribes to it on mount.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
});

afterEach(cleanup);

function withProviders(children: React.ReactNode) {
  return (
    <ThemeProvider>
      <LocaleProvider>{children}</LocaleProvider>
    </ThemeProvider>
  );
}

const VALID: Record<string, string> = {
  companyName: "Acme Roasters",
  buyerType: "roaster",
  countryCode: "AE",
  estimatedVolumeKg: "500",
  contactName: "Jordan Buyer",
  contactEmail: "jordan@example.com",
  consent: "on",
};

/**
 * Phase 5.5 UIF/Phase 6 T019 verification — `lib/validation/rfq.ts` (`contracts/rfq-contract.md`
 * §2). Narrow, exact-Verify-condition proof rather than a full behavioural suite (T042 owns that,
 * Phase 11).
 */
describe("T019 — shared RFQ validation schema", () => {
  it("accepts a fully valid submission", () => {
    const parsed = RfqInput.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it("rejects missing consent", () => {
    const rest = Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== "consent"));
    expect(RfqInput.safeParse(rest).success).toBe(false);
    expect(RfqInput.safeParse({ ...rest, consent: "false" }).success).toBe(false);
    expect(RfqInput.safeParse({ ...rest, consent: "" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const parsed = RfqInput.safeParse({ ...VALID, contactEmail: "not-an-email" });
    expect(parsed.success).toBe(false);
  });

  it("rejects every over-length field", () => {
    expect(RfqInput.safeParse({ ...VALID, companyName: "x".repeat(201) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, contactName: "x".repeat(121) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, contactEmail: `${"x".repeat(250)}@example.com` }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, coffeePreference: "x".repeat(201) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, timing: "x".repeat(121) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, deliveryLocation: "x".repeat(201) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, incoterm: "x".repeat(21) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, contactPhone: "x".repeat(41) }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, message: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects every missing required field", () => {
    for (const field of ["companyName", "buyerType", "countryCode", "estimatedVolumeKg", "contactName", "contactEmail"]) {
      const rest = Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== field));
      expect(RfqInput.safeParse(rest).success, `expected ${field} to be required`).toBe(false);
    }
  });

  it("rejects a non-positive or absurd volume", () => {
    expect(RfqInput.safeParse({ ...VALID, estimatedVolumeKg: "0" }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, estimatedVolumeKg: "-5" }).success).toBe(false);
    expect(RfqInput.safeParse({ ...VALID, estimatedVolumeKg: "not-a-number" }).success).toBe(false);
  });

  it("implements no disposable-email/blocklist policy (contract §2)", () => {
    const source = readFileSync("lib/validation/rfq.ts", "utf8");
    expect(source).not.toMatch(/disposable|tempmail|blocklist/i);
  });
});

describe("T020/T021/T022 — static safety of the RFQ server action and its abuse guard", () => {
  it("the Server Action never persists, stores client-side, calls out, or uses a service role", () => {
    const source = readFileSync("src/app/(public)/contact/actions.ts", "utf8");
    expect(source).not.toMatch(/SERVICE_ROLE|localStorage|sessionStorage|fetch\(|webhook/i);
    expect(source).toMatch(/DB-BLOCK-02/);
    expect(source).toMatch(/CRM-DEST-01/);
  });

  it("the Server Action has no ok: true path", () => {
    const source = readFileSync("src/app/(public)/contact/actions.ts", "utf8");
    expect(source).not.toMatch(/ok:\s*true/);
  });

  it("the abuse guard uses no distributed rate-limit package and documents its own limitation", () => {
    const source = readFileSync("src/app/(public)/contact/abuse-guard.ts", "utf8");
    expect(source).not.toMatch(/from ["']@?(upstash|ioredis|redis)/i);
    expect(source).toMatch(/ABUSE-01/);
    expect(source).toMatch(/best-effort/i);
    expect(source).toMatch(/single-instance/i);
    expect(source).toMatch(/non-durable/i);
  });
});

describe("T022 — abuse guard behaviour", () => {
  it("allows submissions under the threshold and rejects once it is exceeded, without disclosing it", async () => {
    const { checkRfqAbuseGuard, __resetRfqAbuseGuard } = await import("../../src/app/(public)/contact/abuse-guard");
    __resetRfqAbuseGuard();
    const key = "203.0.113.7";
    const now = Date.now();

    const results = Array.from({ length: 6 }, (_, i) => checkRfqAbuseGuard(key, now + i));
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results[5]).toBe(false);

    // Normal traffic from a different key is unaffected by another key's throttle.
    expect(checkRfqAbuseGuard("198.51.100.9", now)).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const { checkRfqAbuseGuard, __resetRfqAbuseGuard } = await import("../../src/app/(public)/contact/abuse-guard");
    __resetRfqAbuseGuard();
    const key = "203.0.113.8";
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) checkRfqAbuseGuard(key, now);
    expect(checkRfqAbuseGuard(key, now)).toBe(false);
    expect(checkRfqAbuseGuard(key, now + 11 * 60 * 1000)).toBe(true);
  });
});

describe("T020 — RfqForm accessibility", () => {
  it("associates every field with a real accessible label and exposes an inline submit control", () => {
    render(withProviders(<RfqForm />));

    // Every field T019's schema names is reachable by its accessible label — Field
    // (components/ui/field.tsx) wires htmlFor/aria-describedby/aria-invalid, so this also proves the
    // form composes through that primitive rather than a hand-rolled label/input pair.
    expect(screen.getByLabelText("Company name")).toBeTruthy();
    expect(screen.getByLabelText("What best describes your business")).toBeTruthy();
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(screen.getByLabelText("Estimated volume (kg)")).toBeTruthy();
    expect(screen.getByLabelText("Your name")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "I agree to be contacted about this request." })).toBeTruthy();

    // A real <button type="submit"> inside the <form> — not a link, not an onClick-only <div> — so
    // the browser's native Enter-to-submit keyboard path works with no extra handler.
    const submit = screen.getByRole("button", { name: "Send request" });
    expect(submit.closest("form")).toBeTruthy();
    expect(submit.getAttribute("type")).toBe("submit");
  });
});

describe("regression — a \"use server\" file may export ONLY async functions", () => {
  it("actions.ts exports nothing but async functions (a stray constant/type export crashes every request at runtime, not at build time)", async () => {
    const actionsModule = await import("../../src/app/(public)/contact/actions");
    for (const [name, value] of Object.entries(actionsModule)) {
      expect(typeof value, `export "${name}" must be a function`).toBe("function");
      expect(
        value.constructor.name === "AsyncFunction",
        `export "${name}" must be an async function`
      ).toBe(true);
    }
  });
});

describe("T042 — RFQ boundary closure", () => {
  const formData = (values: Record<string, string> = VALID) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };

  it("returns honest unavailable only for valid input and never echoes submitted script text", async () => {
    const { submitRfq } = await import("../../src/app/(public)/contact/actions");
    const { __resetRfqAbuseGuard } = await import("../../src/app/(public)/contact/abuse-guard");
    __resetRfqAbuseGuard();
    const payload = '<script>alert("rfq")</script>';
    const result = await submitRfq(undefined, formData({ ...VALID, message: payload }));
    expect(result).toEqual({ ok: false, error: RFQ_UNAVAILABLE });
    expect(JSON.stringify(result)).not.toContain(payload);
    expect(JSON.stringify(result)).not.toMatch(/success|submitted/i);
  });

  it("rejects invalid consent and raw overlength input before an unavailable result", async () => {
    const { submitRfq } = await import("../../src/app/(public)/contact/actions");
    const missingConsent = await submitRfq(undefined, formData(Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== "consent"))));
    if (missingConsent.ok) throw new Error("Invalid RFQ unexpectedly succeeded");
    expect(missingConsent.error).toBe("Check the highlighted fields.");
    expect(missingConsent.fieldErrors?.consent).toBeTruthy();

    const overlength = await submitRfq(undefined, formData({ ...VALID, message: "x".repeat(2001) }));
    expect(overlength).toEqual({ ok: false, error: "One of the fields is too long." });
  });

  it("applies the abuse safeguard without converting any submission into success or persistence", async () => {
    const { submitRfq } = await import("../../src/app/(public)/contact/actions");
    const { __resetRfqAbuseGuard } = await import("../../src/app/(public)/contact/abuse-guard");
    __resetRfqAbuseGuard();
    const results = await Promise.all(Array.from({ length: 6 }, () => submitRfq(undefined, formData())));
    expect(results.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => ({ ok: false, error: RFQ_UNAVAILABLE })));
    expect(results[5]).toEqual({ ok: false, error: "Please try again shortly." });
    for (const result of results) expect(result.ok).toBe(false);
  });
});
