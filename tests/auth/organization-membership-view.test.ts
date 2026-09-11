import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationMembersPanel, type OrganizationMemberRow } from "@/src/app/dashboard/settings/organization-members-panel";

import { FOUNDATION_FIXTURES, signInAsFixture } from "./fixture-session";

/**
 * Feature 003 T028 — organization membership view + acting-organization switcher.
 *
 * The RLS boundary tests below query `organization_members` directly through a signed-in fixture's
 * own request-scoped client — the SAME boundary `settings/page.tsx` relies on — rather than
 * re-implementing own-org/cross-org logic in application code (there is none to re-implement: the
 * page trusts RLS entirely, per `organization-members-panel.tsx`'s own doc comment).
 */

describe.sequential("organization_members RLS — own-org visible, cross-org denied", () => {
  it("a member can read every row for their own acting organization", async () => {
    const fixture = FOUNDATION_FIXTURES.buyerOnly;
    const client = await signInAsFixture(fixture.email);

    const { data, error } = await client
      .from("organization_members")
      .select("user_id, member_role, created_at")
      .eq("organization_id", fixture.organizationId);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("a member reads no rows at all for an organization they do not belong to", async () => {
    const fixture = FOUNDATION_FIXTURES.buyerOnly;
    const otherOrganizationId = FOUNDATION_FIXTURES.buyerAndSeller.organizationId;
    const client = await signInAsFixture(fixture.email);

    const { data, error } = await client
      .from("organization_members")
      .select("user_id, member_role, created_at")
      .eq("organization_id", otherOrganizationId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("OrganizationMembersPanel — honest identity presentation", () => {
  it("shows the caller's own row with the real 'you' label, and every co-member with a truthful generic label — never a fabricated name", () => {
    const members: OrganizationMemberRow[] = [
      { userId: "self", memberRole: "OWNER", createdAt: "2026-01-01T00:00:00.000Z", isCurrentUser: true },
      { userId: "colleague", memberRole: "MEMBER", createdAt: "2026-02-01T00:00:00.000Z", isCurrentUser: false },
    ];

    const html = renderToStaticMarkup(OrganizationMembersPanel({ members }));

    expect(html).toContain("You");
    expect(html).toContain("Team member");
    expect(html).toContain("Owner");
    expect(html).toContain("Member");
    // No name ever appears for a co-member row — this component receives no name field for them at
    // all (`OrganizationMemberRow` carries no name), so there is nothing to fabricate.
  });

  it("renders zero members without throwing (empty acting organization membership list)", () => {
    expect(() => renderToStaticMarkup(OrganizationMembersPanel({ members: [] }))).not.toThrow();
  });
});

describe("Acting-organization switcher — no silent first-organization fallback", () => {
  it("never selects organizations[0] as an implicit fallback outside the single-membership case in the DAL", () => {
    const switcherSource = readFileSync("src/app/dashboard/settings/acting-organization-switcher.tsx", "utf8");
    const pageSource = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
    expect(switcherSource).not.toContain("organizations[0]");
    expect(pageSource).not.toContain("organizations[0]");
  });

  it("only renders when there is more than one organization membership", () => {
    const pageSource = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
    expect(pageSource).toMatch(/identity\.organizations\.length > 1/);
  });

  it("switch selection is bound server-side to a specific, already-resolved organization id — never a client-chosen value", () => {
    const switcherSource = readFileSync("src/app/dashboard/settings/acting-organization-switcher.tsx", "utf8");
    expect(switcherSource).toMatch(/setActingOrganization\.bind\(null, organization\.organizationId,/);
  });
});
