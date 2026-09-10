import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getEligibility } from "@/lib/auth/eligibility";
import type { RequestIdentity } from "@/lib/auth/types";

/**
 * Feature 003 T001 verification (`lib/auth/eligibility.ts` — spec FR-005, FR-006, SC-001).
 * `getEligibility` is a pure function; every case below is expressed by feeding it a
 * pre-resolved `RequestIdentity` shape rather than exercising the DAL again (already covered by
 * `tests/auth/acting-organization.test.ts` and Feature 001's `request-identity.test.ts`).
 */

function authenticated(overrides: Partial<Extract<RequestIdentity, { kind: "authenticated" }>>): RequestIdentity {
  return {
    kind: "authenticated",
    userId: "user-1",
    profile: { fullName: "Test User", companyName: null },
    organizations: [],
    organization: null,
    requiresOrganizationSelection: false,
    isAuthorizedMember: false,
    isEmailVerified: true,
    operationalRoles: [],
    ...overrides,
  };
}

describe("T001 — eligibility implements no hand-rolled authorization rule", () => {
  it("the module never re-derives status/KYB truth in TypeScript", () => {
    const source = readFileSync("lib/auth/eligibility.ts", "utf8");
    const codeLines = source.split("\n").filter((line) => !/^\s*\*|^\s*\/\//.test(line.trim()));
    const offending = codeLines.filter((line) => /status\s*===|kyb/i.test(line));
    expect(offending).toEqual([]);
  });

  it("every boolean answer traces to a RequestIdentity field already sourced from an approved DB function", () => {
    const source = readFileSync("lib/auth/eligibility.ts", "utf8");
    expect(source).toMatch(/identity\.isAuthorizedMember/);
    expect(source).toMatch(/identity\.organization\?\.canBuy/);
    expect(source).toMatch(/identity\.organization\?\.canSell/);
  });
});

describe("T001 — getEligibility branches", () => {
  it("anonymous → blocked, routed to sign-in", () => {
    const result = getEligibility({ kind: "anonymous" });
    expect(result).toEqual({
      canReachTrading: false,
      canBuy: false,
      canSell: false,
      blockingReason: "anonymous",
      nextAction: "sign-in",
    });
  });

  it("authenticated, no organization at all → unattached, await-onboarding", () => {
    const identity = authenticated({});
    const result = getEligibility(identity);
    expect(result.blockingReason).toBe("unattached");
    expect(result.nextAction).toBe("await-onboarding");
    expect(result.canBuy).toBe(false);
    expect(result.canSell).toBe(false);
  });

  it("authenticated, multiple organizations, no selection → organization-selection-required", () => {
    const identity = authenticated({
      organizations: [
        { organizationId: "a", displayName: "A", memberRole: "OWNER", canBuy: true, canSell: false },
        { organizationId: "b", displayName: "B", memberRole: "MEMBER", canBuy: true, canSell: true },
      ],
      organization: null,
      requiresOrganizationSelection: true,
    });
    const result = getEligibility(identity);
    expect(result.blockingReason).toBe("organization-selection-required");
    expect(result.nextAction).toBe("choose-organization");
  });

  it("authenticated, resolved organization, not authorized to trade → not-authorized", () => {
    const identity = authenticated({
      organizations: [{ organizationId: "a", displayName: "A", memberRole: "OWNER", canBuy: false, canSell: false }],
      organization: { organizationId: "a", displayName: "A", memberRole: "OWNER", canBuy: false, canSell: false },
      isAuthorizedMember: false,
    });
    const result = getEligibility(identity);
    expect(result.blockingReason).toBe("not-authorized");
    expect(result.nextAction).toBe("await-authorization");
    expect(result.canBuy).toBe(false);
  });

  it("authenticated, resolved organization, fully authorized → no blocking reason", () => {
    const identity = authenticated({
      organizations: [{ organizationId: "a", displayName: "A", memberRole: "OWNER", canBuy: true, canSell: true }],
      organization: { organizationId: "a", displayName: "A", memberRole: "OWNER", canBuy: true, canSell: true },
      isAuthorizedMember: true,
    });
    const result = getEligibility(identity);
    expect(result.blockingReason).toBeNull();
    expect(result.nextAction).toBe("none");
    expect(result.canBuy).toBe(true);
    expect(result.canSell).toBe(true);
    expect(result.canReachTrading).toBe(true);
  });

  it("canReachTrading is read from isAuthorizedMember, independent of the acting org's own canBuy", () => {
    // A user could be isAuthorizedMember via a DIFFERENT organization than the one currently acting
    // — canReachTrading and canBuy are deliberately distinct signals, never conflated.
    const identity = authenticated({
      organizations: [{ organizationId: "a", displayName: "A", memberRole: "MEMBER", canBuy: false, canSell: false }],
      organization: { organizationId: "a", displayName: "A", memberRole: "MEMBER", canBuy: false, canSell: false },
      isAuthorizedMember: true,
    });
    const result = getEligibility(identity);
    expect(result.canReachTrading).toBe(true);
    expect(result.canBuy).toBe(false);
  });
});
