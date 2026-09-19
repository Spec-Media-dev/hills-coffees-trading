import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { OrganizationStatusPanel } from "@/components/admin/compliance/organization-status-panel";
import { AdminStatusBadge, KYB_STATUS_TONE, ORGANIZATION_STATUS_TONE } from "@/components/admin/compliance/status-badge";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { listOrganizations } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 RUN B (T010) — one organization's status, its latest KYB application, and the
 * suspend/reinstate panel. Reads go through the operator's own session; an unreadable organization
 * (pure COMPLIANCE — recorded gap) renders the gap card, never a fabricated row.
 */
export default async function OrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const access = await checkAreaAccess("organizations");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const { organizationId } = await params;
  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.organizations.breadcrumb} />, href: "/dashboard-admin/organizations" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.organizations.detail.title} /> },
  ];

  const supabase = await createClient();
  const valid = /^[0-9a-f-]{36}$/i.test(organizationId);
  const [{ data: organization }, { data: application }] = valid
    ? await Promise.all([
        supabase.from("organizations").select("id, legal_name, display_name, status, account_type, country_code, can_buy, can_sell, created_at").eq("id", organizationId).maybeSingle(),
        supabase.from("kyb_applications").select("id, status, submitted_at, decided_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  if (!organization) {
    // Either nonexistent or unreadable for this role — the recorded gap is stated when the role has no read path at all.
    const readable = (await listOrganizations({ pageSize: 1 })).rows.length > 0;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.compliance.organizations.detail.title} />} trail={trail} />
        {readable ? (
          <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.description} />} />
        ) : (
          <AdminStateCard kind="capability-gap" icon="shield" title={<AppBilingual pick={(c) => c.admin.compliance.organizations.gap.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.organizations.gap.description} />} />
        )}
      </div>
    );
  }

  const statusPick =
    (status: string): AppCopySelector =>
    (c) =>
      c.admin.compliance.statuses.organization[status as keyof typeof c.admin.compliance.statuses.organization] ?? status;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={organization.display_name ?? organization.legal_name}
        description={<span className="font-mono text-[length:var(--text-micro)]">{organization.id}</span>}
        trail={trail}
        actions={<AdminStatusBadge status={organization.status} tone={ORGANIZATION_STATUS_TONE[organization.status] ?? "draft"} pick={statusPick(organization.status)} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-organization-section="identity">
          <dl className="divide-y divide-border">
            {[
              ["legalName", organization.legal_name],
              ["displayName", organization.display_name],
              ["accountType", organization.account_type],
              ["country", organization.country_code],
            ].map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
                <dt className="text-[length:var(--text-small)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.compliance.organizations.detail[key as "legalName" | "displayName" | "accountType" | "country"]} />
                </dt>
                <dd className="text-[length:var(--text-small)] text-foreground">{value ?? <AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
              <dt className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.capabilities} />
              </dt>
              <dd className="text-[length:var(--text-small)] text-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.canBuy} />: <AppBilingual pick={(c) => (organization.can_buy ? c.admin.compliance.common.yes : c.admin.compliance.common.no)} /> · <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.canSell} />: <AppBilingual pick={(c) => (organization.can_sell ? c.admin.compliance.common.yes : c.admin.compliance.common.no)} />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
              <dt className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.organizations.detail.latestApplication} />
              </dt>
              <dd className="text-[length:var(--text-small)] text-foreground">
                {application ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge status={application.status} tone={KYB_STATUS_TONE[application.status] ?? "draft"} pick={(c) => c.admin.compliance.statuses.kyb[application.status as keyof typeof c.admin.compliance.statuses.kyb]} />
                    <AdminDateTime value={application.submitted_at} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/kyb/${application.id}`} />}>
                      <AppBilingual pick={(c) => c.admin.compliance.kyb.open} />
                    </Button>
                  </span>
                ) : (
                  <AppBilingual pick={(c) => c.admin.compliance.organizations.detail.noApplication} />
                )}
              </dd>
            </div>
          </dl>
        </section>

        <OrganizationStatusPanel organizationId={organization.id} status={organization.status} />
      </div>
    </div>
  );
}
