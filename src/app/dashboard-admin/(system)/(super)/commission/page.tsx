import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { CommissionPolicyStatusBadge, FutureOnlyNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { EffectiveWindow, SystemLoadError, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { evaluateTierCoverage, listCommissionPolicies, resolveInForce, type CommissionPolicyRow } from "@/lib/admin/commission";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN F (T042–T045) — commission policies exactly as stored, the six checkout semantics
 * stated up front, which policy is in force RIGHT NOW (latest `effective_from` wins), and each
 * policy's band coverage. Reads only `commission_policies`/`commission_tiers` through
 * `lib/admin/commission.ts` (`is_super_admin()` re-verified there and here).
 */
export default async function CommissionPage() {
  const access = await checkAreaAccess("commission");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const policies = await listCommissionPolicies();
  const inForce = policies ? resolveInForce(policies) : null;

  const columns = [
    {
      key: "policy",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.system.commission.columns.policy} />,
      render: (row: CommissionPolicyRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.id}
          </span>
        </span>
      ),
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.system.commission.columns.status} />, render: (row: CommissionPolicyRow) => <CommissionPolicyStatusBadge status={row.status} /> },
    { key: "window", header: <AppBilingual pick={(c) => c.admin.system.commission.columns.window} />, render: (row: CommissionPolicyRow) => <EffectiveWindow from={row.effectiveFrom} until={row.effectiveUntil} /> },
    { key: "tiers", header: <AppBilingual pick={(c) => c.admin.system.commission.columns.tiers} />, render: (row: CommissionPolicyRow) => <span className="tabular-nums">{row.tiers.length}</span> },
    {
      key: "coverage",
      header: <AppBilingual pick={(c) => c.admin.system.commission.columns.coverage} />,
      render: (row: CommissionPolicyRow) => {
        const coverage = evaluateTierCoverage(row.tiers);
        return (
          <span data-policy-coverage={coverage.covered ? "covered" : "gaps"} className={coverage.covered ? "text-foreground" : "font-semibold text-[var(--status-pending)]"}>
            <AppBilingual pick={(c) => (coverage.covered ? c.admin.system.commission.coverage.covered : c.admin.system.commission.coverage.heading)} />
            {coverage.covered ? null : ` (${coverage.gaps.length})`}
          </span>
        );
      },
    },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.system.commission.columns.open} />,
      render: (row: CommissionPolicyRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/commission/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.system.commission.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.system.commission.title} />}
        description={<AppBilingual pick={(c) => c.admin.system.commission.description} />}
        trail={systemTrail((c) => c.admin.system.commission.breadcrumb)}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/commission/new" />}>
            <AppBilingual pick={(c) => c.admin.system.commission.newPolicy} />
          </Button>
        }
      />

      <section data-commission-semantics className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.system.commission.semantics.heading} />
        </h2>
        <ol className="mt-2 flex list-decimal flex-col gap-1 ps-5 text-[length:var(--text-small)] leading-[var(--lh-body)] text-foreground">
          {(["totalQuantity", "minInclusive", "maxExclusive", "nullMax", "wholeBase", "overlap"] as const).map((key) => (
            <li key={key} data-semantic={key}>
              <AppBilingual pick={(c) => c.admin.system.commission.semantics[key]} />
            </li>
          ))}
        </ol>
      </section>

      {policies === null ? (
        <SystemLoadError />
      ) : (
        <>
          <section data-in-force={inForce?.winner ? inForce.winner.id : "none"} className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-5">
            <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.system.commission.inForce.heading} />
            </h2>
            {inForce?.winner ? (
              <ul className="mt-2 flex flex-col gap-1 text-[length:var(--text-small)] text-foreground">
                {inForce.inForce.map((policy, index) => (
                  <li key={policy.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{policy.name}</span>
                    <span className="text-[length:var(--text-micro)] text-muted-foreground">
                      <AppBilingual pick={(c) => (index === 0 ? c.admin.system.commission.inForce.winner : c.admin.system.commission.inForce.overlapping)} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[length:var(--text-small)] text-foreground">
                <AppBilingual pick={(c) => c.admin.system.commission.inForce.none} />
              </p>
            )}
          </section>
          <TableCardList
            columns={columns}
            rows={policies}
            getRowKey={(row) => row.id}
            caption={appCopy.admin.system.commission.caption}
            emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.system.commission.empty.title} />} description={<AppBilingual pick={(c) => c.admin.system.commission.empty.description} />} />}
          />
        </>
      )}
      <FutureOnlyNotice />
      <NoDeleteNote />
    </div>
  );
}
