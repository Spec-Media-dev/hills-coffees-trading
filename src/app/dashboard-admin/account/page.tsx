import Link from "next/link";

import { AdminRoleBadges } from "@/components/admin/role-badges";
import { AdminSignOutButton } from "@/components/admin/sign-out-button";
import { UserAvatar } from "@/components/account/user-avatar";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ProfileSettingsForm } from "@/src/app/dashboard/settings/profile-settings-form";

/**
 * Feature 010 RUN A (T046) — the operator's SELF-account surface, composed ONLY from authority the
 * repository already has (Feature 003). Nothing here is a new auth flow, a new profile table or a
 * new mutation path:
 *
 * - Profile (name / phone / company): the SAME `ProfileSettingsForm` + `updateMyProfile` Server
 *   Action (`update_my_profile()` RPC) the Member Portal uses. That action requires only an
 *   authenticated, step-up-complete session — an operator with no organization membership may use
 *   it, which is why this page exists: `/dashboard/settings` is membership-gated.
 * - Sign-in email: DISPLAYED from the server-verified `auth.getUser()`; CHANGING it has no approved
 *   flow yet and is stated as a recorded capability gap (T047), never simulated.
 * - Password: the EXISTING reset flow (`/reset-password/` → emailed link → `/reset-password/confirm`),
 *   linked, not re-implemented. No password value is ever accepted here.
 * - Two-factor: real enrolment status from `auth.mfa.listFactors()`, linking to the EXISTING
 *   `/mfa/` enrol/verify page.
 * - Profile image: no approved upload path exists (`avatar_path` has no bucket) — initials only.
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
  const [{ data: profile }, { data: user }, factors] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, company_name, avatar_path").eq("id", identity.userId).maybeSingle(),
    supabase.auth.getUser(),
    supabase.auth.mfa.listFactors(),
  ]);

  const email = user.user?.email ?? null;
  const totpEnrolled: boolean | null = factors.error || !factors.data ? null : factors.data.totp.length > 0;
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
        <UserAvatar displayName={displayName ?? "?"} />
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
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.account.avatar.note} />
        </p>
      </section>

      <hr className="border-border" />

      <section className="flex flex-col gap-3" data-account-section="email">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.email.title} />
        </h2>
        <p className="text-[length:var(--text-small)] text-foreground">
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.account.email.current} />
          </span>
          {": "}
          <span className="font-mono">{email ?? "—"}</span>
        </p>
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3">
          <p className="text-[length:var(--text-small)] font-medium text-foreground">
            <AppBilingual pick={(c) => c.admin.account.email.unavailableTitle} />
          </p>
          <p className="mt-1 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.account.email.unavailableDescription} />
          </p>
        </div>
      </section>

      <hr className="border-border" />

      <section className="flex flex-col gap-3" data-account-section="password">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.password.title} />
        </h2>
        <p className="max-w-[62ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.account.password.description} />
        </p>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/reset-password/" />}>
            <Icon name="key-round" />
            <AppBilingual pick={(c) => c.admin.account.password.action} />
          </Button>
        </div>
      </section>

      <hr className="border-border" />

      <section className="flex flex-col gap-3" data-account-section="security" data-totp-enrolled={totpEnrolled === null ? "unknown" : String(totpEnrolled)}>
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.account.security.title} />
        </h2>
        <p className="flex items-center gap-2 text-[length:var(--text-small)] text-foreground">
          <Icon name={totpEnrolled ? "check" : "alert-circle"} className="size-4 shrink-0" aria-hidden="true" />
          <AppBilingual
            pick={(c) =>
              totpEnrolled === null ? c.admin.account.security.unknown : totpEnrolled ? c.admin.account.security.enrolled : c.admin.account.security.notEnrolled
            }
          />
        </p>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/mfa/" />}>
            <Icon name="shield" />
            <AppBilingual pick={(c) => c.admin.account.security.action} />
          </Button>
        </div>
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
