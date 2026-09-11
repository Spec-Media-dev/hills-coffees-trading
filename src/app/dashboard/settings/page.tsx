import { StateScreen } from "@/components/layout/state-screen";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ActingOrganizationSwitcher } from "./acting-organization-switcher";
import { OrganizationContactForm } from "./organization-contact-form";
import { OrganizationMembersPanel, type OrganizationMemberRow } from "./organization-members-panel";
import { ProfileSettingsForm } from "./profile-settings-form";
import { SettingsFoundationShell } from "./settings-foundation-shell";

/**
 * Member Settings — Feature 003 Phase 7 (T026–T028), built on top of the original Foundation
 * proof surface (FR-012/FR-018 Server Action + validation contract), which stays exactly as it
 * was: `ProfileSettingsForm` + `updateMyProfile` are unmodified in behaviour, only relocated under
 * a "Personal profile" heading now that the page holds more than one section.
 *
 * WHY THIS PAGE RE-VERIFIES (FR-006, Constitution Principle VIII; same pattern as
 * src/app/dashboard/page.tsx): a parent layout returning `StateScreen` does not stop this page
 * from executing — every protected page independently re-authorizes with its surface's own
 * predicate before reading protected data. This page uses the Member Portal's predicate
 * (`organization !== null`), identical to `dashboard/layout.tsx`.
 *
 * FOUR CLEARLY SEPARATE SECTIONS (run directive: "Clearly separate PERSONAL PROFILE from BUSINESS /
 * ORGANIZATION"): Personal profile (own `profiles` row), Organization (acting org's contact
 * columns, via `update_organization_contact` only), Team members (`organization_members`, own-org
 * scoped — see `organization-members-panel.tsx`'s own doc comment for the honest co-member-name
 * visibility gap), and — only for a multi-org member — Acting organization (T028 switcher).
 */
export default async function SettingsPage() {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }

  const organizationId = identity.organization.organizationId;

  // `getRequestIdentity()`'s profile DTO deliberately carries only fullName/companyName
  // (data-model.md `RequestProfile`). `phone`/`avatarPath` are read here, directly, via the same
  // request-scoped RLS-respecting client — RLS's `profiles_select_own` policy scopes this to the
  // caller's own row. Reading all four fields (rather than only the two the DAL already exposes)
  // is what lets the form submit the complete MyProfileInput shape without silently overwriting an
  // unseen phone/avatarPath value with NULL (update_my_profile is a full-column overwrite, not a
  // partial patch). Same full-replace reasoning applies to `organizations.display_name/email/phone`
  // below, read fresh for `update_organization_contact`.
  const supabase = await createClient();
  const [{ data: profile }, { data: organization }, { data: memberRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, company_name, avatar_path").eq("id", identity.userId).maybeSingle(),
    supabase.from("organizations").select("display_name, email, phone").eq("id", organizationId).maybeSingle(),
    supabase
      .from("organization_members")
      .select("user_id, member_role, created_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  const members: OrganizationMemberRow[] = (memberRows ?? []).map((row) => ({
    userId: row.user_id,
    memberRole: row.member_role,
    createdAt: row.created_at,
    isCurrentUser: row.user_id === identity.userId,
  }));

  return (
    <SettingsFoundationShell
      title={<AppBilingual pick={(c) => c.settings} />}
      description={<AppBilingual pick={(c) => c.settingsPage.description} />}
    >
      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.profile.title} />
            </h2>
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.profile.lead} />
            </p>
          </div>
          <ProfileSettingsForm
            initialValues={{
              fullName: profile?.full_name ?? "",
              phone: profile?.phone ?? "",
              companyName: profile?.company_name ?? "",
              avatarPath: profile?.avatar_path ?? "",
            }}
          />
        </section>

        <hr className="border-border" />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.organization.title} />
            </h2>
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.organization.lead} />
            </p>
          </div>
          <OrganizationContactForm
            initialValues={{
              displayName: organization?.display_name ?? "",
              email: organization?.email ?? "",
              phone: organization?.phone ?? "",
            }}
          />
        </section>

        <hr className="border-border" />

        <section>
          <OrganizationMembersPanel members={members} />
        </section>

        {identity.organizations.length > 1 ? (
          <>
            <hr className="border-border" />
            <section>
              <ActingOrganizationSwitcher organizations={identity.organizations} currentOrganizationId={organizationId} />
            </section>
          </>
        ) : null}
      </div>
    </SettingsFoundationShell>
  );
}
