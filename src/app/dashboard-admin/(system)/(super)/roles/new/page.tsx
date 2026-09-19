import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { roleGrantFields } from "@/components/admin/system/fields";
import { systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { findGrantTarget } from "@/lib/admin/roles";
import { grantRole } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/**
 * Feature 010 RUN F (T027) — grant an operational role to an EXISTING profile, looked up by its
 * exact id (auth identities/emails are not readable by product code — stated on the page). The
 * grant is recorded under the super admin's identity (`created_by`).
 */
export default async function GrantRolePage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const access = await checkAreaAccess("roles");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const { userId } = await searchParams;
  const target = userId ? await findGrantTarget(userId) : null;
  const trail = systemTrail((c) => c.admin.system.roles.breadcrumb, "/dashboard-admin/roles", (c) => c.admin.system.roles.grant.heading);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.system.roles.grant.heading} />} trail={trail} />
      <form method="get" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 sm:flex-row sm:items-end" data-grant-lookup>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[length:var(--text-small)] text-foreground">
          <span className="font-medium">
            <AppBilingual pick={(c) => c.admin.system.fields.userId} />
          </span>
          <Input name="userId" defaultValue={userId ?? ""} dir="ltr" className="font-mono" maxLength={36} aria-describedby="grant-lookup-hint" />
          <span id="grant-lookup-hint" className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.system.fields.userIdHint} />
          </span>
        </label>
        <Button type="submit" variant="outline">
          {appCopy.admin.system.roles.grant.lookup}
        </Button>
      </form>
      {userId && !target ? (
        <p data-grant-target="not-found" className="rounded-[var(--radius-md)] border border-[var(--status-danger)] bg-[var(--status-danger-surface)] px-4 py-3 text-[length:var(--text-small)] text-foreground">
          <AppBilingual pick={(c) => c.admin.system.roles.grant.notFound} />
        </p>
      ) : null}
      {target?.alreadyAdmin ? (
        <p data-grant-target="already-admin" className="rounded-[var(--radius-md)] border border-[var(--status-pending)] bg-[var(--status-pending-surface)] px-4 py-3 text-[length:var(--text-small)] text-foreground">
          <AppBilingual pick={(c) => c.admin.system.roles.grant.alreadyAdmin} />
        </p>
      ) : null}
      {target && !target.alreadyAdmin ? (
        <>
          <p data-grant-target={target.id} className="text-[length:var(--text-small)] text-foreground">
            <AppBilingual pick={(c) => c.admin.system.roles.grant.target} />:{" "}
            <span className="font-medium">{target.fullName ?? <AppBilingual pick={(c) => c.admin.system.roles.profileUnavailable} />}</span>{" "}
            <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
              {target.id}
            </span>
          </p>
          <RecordForm resource="system" copyKey="roleGrant" mode="create" formKey="role-grant" fields={roleGrantFields(target)} hiddenFields={{}} action={grantRole} successHrefTemplate="/dashboard-admin/roles/{id}" />
        </>
      ) : null}
    </div>
  );
}
