import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgreementList } from "@/components/account/agreements/agreement-list";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { CURRENT_AGREEMENTS } from "@/lib/auth/agreements";
import type { AgreementAcceptanceRow } from "@/lib/agreements/acceptance-records";

/**
 * Feature 003 T023 — `AgreementList`/`AgreementRow` presentation. The Server Action they submit to
 * (`acceptAgreement`) is exercised live in `tests/auth/agreement-acceptance.test.ts`; this file
 * proves only the rendering/state-distinction contract — every required agreement renders, the
 * current version is visible, each is individually acceptable, and a prior-version acceptance is
 * never presented as satisfying the current one.
 */

vi.mock("@/src/app/dashboard/actions", () => ({
  acceptAgreement: vi.fn(async () => ({ ok: true, data: undefined, code: "agreement_accepted" })),
}));

afterEach(cleanup);

function withLocale(children: React.ReactNode) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

describe("AgreementList — T023 presentation contract", () => {
  it("renders every current required agreement type from the approved registry, with its current version", () => {
    render(withLocale(<AgreementList acceptances={[]} />));

    expect(CURRENT_AGREEMENTS.length).toBeGreaterThan(0);
    for (const agreement of CURRENT_AGREEMENTS) {
      expect(screen.getAllByText(new RegExp(`Version ${agreement.version.replace(/[.]/g, "\\.")}`)).length).toBeGreaterThan(0);
    }
  });

  it("offers an individual accept action for every not-yet-current-accepted agreement", () => {
    render(withLocale(<AgreementList acceptances={[]} />));

    const acceptButtons = screen.getAllByRole("button", { name: /accept/i });
    expect(acceptButtons).toHaveLength(CURRENT_AGREEMENTS.length);
  });

  it("marks a current-version acceptance as accepted, with no accept action for that row", () => {
    const current = CURRENT_AGREEMENTS[0];
    const acceptances: AgreementAcceptanceRow[] = [
      { type: current.type, version: current.version, acceptedAt: "2026-03-01T00:00:00.000Z" },
    ];

    render(withLocale(<AgreementList acceptances={acceptances} />));

    const acceptButtons = screen.getAllByRole("button", { name: /accept/i });
    // Every OTHER current agreement is still unaccepted and offers its own action.
    expect(acceptButtons).toHaveLength(CURRENT_AGREEMENTS.length - 1);
  });

  it("does NOT treat an older accepted version as satisfying the current version — still offers acceptance and shows the stale version", () => {
    const current = CURRENT_AGREEMENTS[0];
    const staleVersion = "0.0.1-old-test-version";
    const acceptances: AgreementAcceptanceRow[] = [
      { type: current.type, version: staleVersion, acceptedAt: "2025-01-01T00:00:00.000Z" },
    ];

    render(withLocale(<AgreementList acceptances={acceptances} />));

    // The stale version is shown as historical evidence...
    expect(screen.getByText(new RegExp(staleVersion))).not.toBeNull();
    // ...but every agreement, including this one, still has an outstanding accept action —
    // an older version never counts as accepting the current one.
    const acceptButtons = screen.getAllByRole("button", { name: /accept/i });
    expect(acceptButtons).toHaveLength(CURRENT_AGREEMENTS.length);
  });
});
