import { AdminRoleBadges } from "@/components/admin/role-badges";
import { AdminSignOutButton } from "@/components/admin/sign-out-button";
import { TwoFactorPanel } from "@/components/account/two-factor-panel";
import { UserAvatar } from "@/components/account/user-avatar";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";
import { readMfaAccountState } from "@/lib/auth/mfa-status";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "@/src/app/dashboard/settings/change-password-form";
import { ProfileSettingsForm } from "@/src/app/dashboard/settings/profile-settings-form";

import { ChangeEmailForm } from "./change-email-form";

/**
 * Feature 010 RUN A (T046) — the operator's SELF-account surface, composed ONLY from authority the
 * repository already has (Feature 003). Nothing here is a new auth flow, a new profile table or a
 * new mutation path:
 *
 * - Profile (name / phone / company): the SAME `ProfileSettingsForm` + `updateMyProfile` Server
 *   Action (`update_my_profile()` RPC) the Member Portal uses. That action requires only an
 *   authenticated, step-up-complete session — an operator with no organization membership may use
 *   it, which is why this page exists: `/dashboard/settings` is membership-gated.
 * - Sign-in email: DISPLAYED from the server-verified `auth.getUser()`. Feature 010 T048 (RUN
 *   F010-ACCOUNT-MEDIA, 2026-09-22, approved product decision): CHANGING it now uses the approved
 *   Supabase Auth double-confirmation flow (`ChangeEmailForm` → `changeMyEmail`, ADMIN/SUPER_ADMIN
 *   only) — a pending change (Supabase's own `new_email`/`email_change_sent_at` fields) is shown
 *   honestly if one exists.
 * - Password: an in-session `ChangePasswordForm` (`auth.updateUser({ password })`, the SAME
 *   primitive the emailed reset-link flow already used, now reachable directly). No password value
 *   is ever accepted, logged, or echoed here.
 * - Two-factor: the shared `TwoFactorPanel` — real Enabled / Disabled / Enrollment-pending status
 *   from `auth.mfa.listFactors()`, the verified-factor list, removal re-verified by a fresh code
 *   (`removeMyMfaFactor`), and enrolment on the EXISTING `/mfa/` page.
 * - Profile image: the shared `UserAvatar` (the real `profiles.avatar_path` object, initials fallback),
 *   uploaded/replaced/removed through `ProfileSettingsForm`'s avatar field.
 * - Sign out: the real `signOut` Server Action via the shared confirm dialog.
 *
 * Guarded by the root console layout (any attested operational role) and re-verified here with
 * the same predicate; it never inspects `identity.organization`.
 */
export default async function AdminAccountPage() {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated" || identity.operationalRoles.length === 0) {
    return <StateScreen kind="unauthorized" />;
  }

  const supabase = await createClient();
  const [{ data: profile }, { data: user }, mfa] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, company_name, avatar_path").eq("id", identity.userId).maybeSingle(),
    supabase.auth.getUser(),
    readMfaAccountState(supabase),
  ]);

  const email = user.user?.email ?? null;
  const pendingEmail = user.user?.new_email ?? null;
  const displayName = identity.profile.fullName;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.account.title} />}
        description={<AppBilingual pick={(c) => c.admin.account.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.account.title} /> },
        ]}
      />

      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <UserAvatar displayName={displayName ?? "?"} avatarPath={profile?.avatar_path ?? null} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-[length:var(--text-body)] font-semibold text-foreground">{displayName ?? email ?? ""}</span>
          <AdminRoleBadges roles={identity.operationalRoles} />
        </div>
      </div>

      <section className="flex flex-col gap-4" data-account-section="profile">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.admin.account.profile.title} />
          </h2>
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.account.profile.lead} />
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

      <section className="flex flex-col gap-3" data-account-section="email" data-pending-email={pendingEmail ? "true" : "false"}>
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.email.title} />
        </h2>
        <p className="text-[length:var(--text-small)] text-foreground">
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.account.email.current} />
          </span>
          {": "}
          <span className="font-mono" dir="ltr">
            {email ?? "—"}
          </span>
        </p>
        {pendingEmail ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3">
            <p className="text-[length:var(--text-small)] font-medium text-foreground">
              <AppBilingual pick={(c) => c.accountSecurity.email.pendingTitle} />
            </p>
            <p className="mt-1 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.accountSecurity.email.pendingDescription} />
              {" "}
              <span className="font-mono" dir="ltr">
                {pendingEmail}
              </span>
            </p>
          </div>
        ) : null}
        <ChangeEmailForm />
      </section>

      <hr className="border-border" />

      <section className="flex flex-col gap-4" data-account-section="password">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.password.title} />
        </h2>
        <p className="max-w-[62ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.accountSecurity.password.lead} />
        </p>
        <ChangePasswordForm />
      </section>

      <hr className="border-border" />

      <section className="flex flex-col gap-3" data-account-section="security" data-totp-enrolled={mfa.status === "unknown" ? "unknown" : String(mfa.status === "enabled")}>
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.security.title} />
        </h2>
        <TwoFactorPanel state={mfa} />
      </section>

      <hr className="border-border" />

      <section className="flex flex-col gap-3" data-account-section="sign-out">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.signOut.title} />
        </h2>
        <p className="max-w-[62ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.account.signOut.description} />
        </p>
        <div>
          <AdminSignOutButton />
        </div>
      </section>
    </div>
  );
}
