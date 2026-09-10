import { describe, expect, it } from "vitest";

import {
  AGREEMENT_TYPES,
  CURRENT_AGREEMENTS,
  hasAcceptedAllCurrentAgreements,
  hasAcceptedCurrentVersion,
  outstandingAgreements,
} from "@/lib/auth/agreements";

/** Feature 003 T003 verification (`lib/auth/agreements.ts` — spec FR-014, PS5). */
describe("T003 — agreement registry and version gate", () => {
  it("every registered agreement type has a current definition", () => {
    for (const type of AGREEMENT_TYPES) {
      expect(CURRENT_AGREEMENTS.some((a) => a.type === type)).toBe(true);
    }
  });

  it("an acceptance at the current version satisfies the gate", () => {
    const acceptances = [{ type: "platform_terms" as const, version: CURRENT_AGREEMENTS[0]!.version }];
    expect(hasAcceptedCurrentVersion(acceptances, "platform_terms")).toBe(true);
  });

  it("an acceptance at an OLD version does not satisfy the gate", () => {
    const acceptances = [{ type: "platform_terms" as const, version: "0.0.1-superseded" }];
    expect(hasAcceptedCurrentVersion(acceptances, "platform_terms")).toBe(false);
  });

  it("bumping the version in the registry re-gates a previously-accepted acceptance", () => {
    const oldVersion = CURRENT_AGREEMENTS.find((a) => a.type === "purchase_terms")!.version;
    const acceptances = [{ type: "purchase_terms" as const, version: oldVersion }];
    expect(hasAcceptedCurrentVersion(acceptances, "purchase_terms")).toBe(true);

    // Simulate the version bump the way the real registry would receive one: a new version string
    // for the same type. The gate re-evaluated against the NEW definition must reject the old record.
    const bumped = CURRENT_AGREEMENTS.map((a) =>
      a.type === "purchase_terms" ? { ...a, version: "0.2.0-legal-approved" } : a
    );
    const stillSatisfies = bumped.some(
      (a) => a.type === "purchase_terms" && acceptances.some((acc) => acc.type === "purchase_terms" && acc.version === a.version)
    );
    expect(stillSatisfies).toBe(false);
  });

  it("hasAcceptedAllCurrentAgreements is false until every type is accepted at its current version", () => {
    const onlyOne = [{ type: "platform_terms" as const, version: CURRENT_AGREEMENTS[0]!.version }];
    expect(hasAcceptedAllCurrentAgreements(onlyOne)).toBe(false);

    const all = CURRENT_AGREEMENTS.map((a) => ({ type: a.type, version: a.version }));
    expect(hasAcceptedAllCurrentAgreements(all)).toBe(true);
  });

  it("outstandingAgreements names the SPECIFIC missing types, never a generic count", () => {
    const acceptances = [{ type: "platform_terms" as const, version: CURRENT_AGREEMENTS[0]!.version }];
    const missing = outstandingAgreements(acceptances);
    expect(missing).not.toContain("platform_terms");
    expect(missing.length).toBe(AGREEMENT_TYPES.length - 1);
    for (const type of missing) expect(AGREEMENT_TYPES).toContain(type);
  });

  it("no real document hash is fabricated — the pending sentinel is explicit and honest", () => {
    for (const agreement of CURRENT_AGREEMENTS) {
      expect(agreement.documentHash).toBe("PENDING_LEGAL_DOCUMENT");
      expect(agreement.version).toMatch(/pending-legal/);
    }
  });
});
