import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { ActiveBadge, RoleBadge } from "@/components/admin/system/notices";
import { SystemNotFound, systemTrail } from "@/components/admin/system/page-parts";
import { RoleActivityPanel, RoleChangePanel } from "@/components/admin/system/role-panels";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { listPlatformAdmins } from "@/lib/admin/roles";

/**
 * Feature 010 RUN F (T027) — one operator: role and activity, each changed only through a confirmed
 * compare-and-set operation. The super admin's OWN row shows no controls (self-change is refused on
 * the server too). The UPDATE-attribution gap is stated on the page.
 */
export default async function OperatorPage({ params }: { params: Promise<{ userId: string }> }) {
  const access = await checkAreaAccess("roles");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const { userId } = await params;
  const rows = /^[0-9a-f-]{36}$/i.test(userId) ? await listPlatformAdmins() : null;
  const row = rows?.find((candidate) => candidate.userId === userId) ?? null;
  const trail = systemTrail((c) => c.admin.system.roles.breadcrumb, "/dashboard-admin/roles", (c) => c.admin.system.forms.roleGrant.editTitle);
  if (!row) return <SystemNotFound title={(c) => c.admin.system.forms.roleGrant.editTitle} trail={trail} backHref="/dashboard-admin/roles" />;
  const isSelf = row.userId === access.identity.userId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={row.fullName ?? <AppBilingual pick={(c) => c.admin.system.roles.profileUnavailable} />}
        description={
          <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
            {row.userId}
          </span>
        }
        trail={trail}
        actions={
          <span className="flex flex-wrap gap-2">
            <RoleBadge role={row.role} />
            <ActiveBadge isActive={row.isActive} />
          </span>
        }
      />
      <section className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 text-[length:var(--text-small)]" data-operator={row.userId} data-operator-role={row.role} data-operator-active={row.isActive ? "true" : "false"}>
        <dl className="divide-y divide-border">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.system.roles.columns.granted} />
            </dt>
            <dd>
              <AdminDateTime value={row.createdAt} fallback="—" />
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.system.common.createdBy} />
            </dt>
            <dd className="font-mono text-[length:var(--text-micro)]" dir="ltr">
              {row.createdBy ?? <AppBilingual pick={(c) => c.admin.system.common.notSet} />}
            </dd>
          </div>
        </dl>
      </section>
      {isSelf ? (
        <p data-operator-self className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.system.roles.self} />
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <RoleChangePanel userId={row.userId} currentRole={row.role} />
          <RoleActivityPanel userId={row.userId} currentRole={row.role} isActive={row.isActive} />
        </div>
      )}
    </div>
  );
}
