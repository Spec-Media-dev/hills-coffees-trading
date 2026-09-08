import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { ProfileSettingsForm } from "./profile-settings-form";
import { SettingsFoundationShell } from "./settings-foundation-shell";

/**
 * Minimal Foundation settings surface — proves the FR-012/FR-018 Server Action + validation
 * contract end-to-end. Deliberately NOT a complete member settings feature (that is a later
 * feature's scope): one form, four fields, no avatar upload UI, no notification preferences, no
 * organization-level settings.
 *
 * WHY THIS PAGE RE-VERIFIES (FR-006, Constitution Principle VIII; same pattern as
 * src/app/dashboard/page.tsx): a parent layout returning `StateScreen` does not stop this page
 * from executing — every protected page independently re-authorizes with its surface's own
 * predicate before reading protected data. This page uses the Member Portal's predicate
 * (`organization !== null`), identical to `dashboard/layout.tsx`.
 */
export default async function SettingsPage() {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }

  // `getRequestIdentity()`'s profile DTO deliberately carries only fullName/companyName
  // (data-model.md `RequestProfile`). `phone`/`avatarPath` are read here, directly, via the same
  // request-scoped RLS-respecting client — RLS's `profiles_select_own` policy scopes this to the
  // caller's own row. Reading all four fields (rather than only the two the DAL already exposes)
  // is what lets the form submit the complete MyProfileInput shape without silently overwriting an
  // unseen phone/avatarPath value with NULL (update_my_profile is a full-column overwrite, not a
  // partial patch).
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, company_name, avatar_path")
    .eq("id", identity.userId)
    .maybeSingle();

  return (
    <SettingsFoundationShell
      title="Profile settings"
      description="This is the platform foundation's Server Action proof surface. Full member settings arrive with later features."
    >
      <ProfileSettingsForm
        initialValues={{
          fullName: profile?.full_name ?? "",
          phone: profile?.phone ?? "",
          companyName: profile?.company_name ?? "",
          avatarPath: profile?.avatar_path ?? "",
        }}
      />
    </SettingsFoundationShell>
  );
}
