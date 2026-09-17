import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { ActiveBadge, AttributionGapNotice, NoDeleteNote, RoleBadge } from "@/components/admin/system/notices";
import { SystemLoadError, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { listPlatformAdmins, type PlatformAdminRow } from "@/lib/admin/roles";

/**
 * Feature 010 RUN F (T027) — every `platform_admins` row, read under the super admin's own session
 * (RLS `platform_admins_admin`), with the role vocabulary of the database. The page re-verifies
 * `is_super_admin()` itself; grants and changes live on the dedicated routes below.
 */
export default async function RolesPage() {
  const access = await checkAreaAccess("roles");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const rows = await listPlatformAdmins();
  const viewerId = access.identity.userId;

  const columns = [
    {
      key: "operator",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.system.roles.columns.operator} />,
      render: (row: PlatformAdminRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">
            {row.fullName ?? (
              <span className="text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.system.roles.profileUnavailable} />
              </span>
            )}
          </span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.userId}
          </span>
          {row.userId === viewerId ? (
            <span className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.system.common.you} />
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "role", header: <AppBilingual pick={(c) => c.admin.system.roles.columns.role} />, render: (row: PlatformAdminRow) => <RoleBadge role={row.role} /> },
    { key: "active", header: <AppBilingual pick={(c) => c.admin.system.roles.columns.active} />, render: (row: PlatformAdminRow) => <ActiveBadge isActive={row.isActive} /> },
    { key: "granted", header: <AppBilingual pick={(c) => c.admin.system.roles.columns.granted} />, render: (row: PlatformAdminRow) => <AdminDateTime value={row.createdAt} fallback="—" /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.system.roles.columns.actions} />,
      render: (row: PlatformAdminRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/roles/${row.userId}`} />}>
          <AppBilingual pick={(c) => c.admin.system.roles.change.label} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.system.roles.title} />}
        description={<AppBilingual pick={(c) => c.admin.system.roles.description} />}
        trail={systemTrail((c) => c.admin.system.roles.breadcrumb)}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/roles/new" />}>
            <AppBilingual pick={(c) => c.admin.system.roles.grant.heading} />
          </Button>
        }
      />
      {rows === null ? (
        <SystemLoadError />
      ) : (
        <TableCardList
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.userId}
          caption={appCopy.admin.system.roles.caption}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.system.roles.empty.title} />} description={<AppBilingual pick={(c) => c.admin.system.roles.empty.description} />} />}
        />
      )}
      <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-hierarchy-note>
        <AppBilingual pick={(c) => c.admin.system.roles.hierarchyNote} />
      </p>
      <AttributionGapNotice />
      <NoDeleteNote />
    </div>
  );
}
