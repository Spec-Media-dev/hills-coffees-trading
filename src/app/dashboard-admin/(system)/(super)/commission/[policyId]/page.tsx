import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { CommissionStatusPanel } from "@/components/admin/system/commission-status-panel";
import { TierCoveragePanel } from "@/components/admin/system/coverage-panel";
import { commissionPolicyFields, commissionTierFields } from "@/components/admin/system/fields";
import { CommissionPolicyStatusBadge, FutureOnlyNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { EffectiveWindow, SystemNotFound, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { getCommissionPolicy } from "@/lib/admin/commission";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveCommissionPolicy, saveCommissionTier } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/**
 * Feature 010 RUN F (T042/T044/T045) — one policy: editable name/window (status excluded), its named
 * status operations, its bands (edit in place / add), and the coverage panel. "Changes apply to
 * eligible future checkouts only" is stated on the policy form, the band forms and the status
 * confirmation; no control recalculates or restates anything historical.
 */
const kg = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 3 });

export default async function CommissionPolicyPage({ params }: { params: Promise<{ policyId: string }> }) {
  const access = await checkAreaAccess("commission");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const { policyId } = await params;
  const policy = await getCommissionPolicy(policyId);
  const trail = systemTrail((c) => c.admin.system.commission.breadcrumb, "/dashboard-admin/commission", (c) => c.admin.system.forms.commissionPolicy.editTitle);
  if (!policy) return <SystemNotFound title={(c) => c.admin.system.forms.commissionPolicy.editTitle} trail={trail} backHref="/dashboard-admin/commission" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={policy.name}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
              {policy.id}
            </span>
            <EffectiveWindow from={policy.effectiveFrom} until={policy.effectiveUntil} />
          </span>
        }
        trail={trail}
        actions={<CommissionPolicyStatusBadge status={policy.status} />}
      />
      <FutureOnlyNotice />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <RecordForm resource="system" copyKey="commissionPolicy" mode="edit" formKey="commission-policy" fields={commissionPolicyFields(policy)} hiddenFields={{ policyId: policy.id }} action={saveCommissionPolicy} />
          <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-policy-tiers={policy.tiers.length}>
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.system.commission.policy.tiersHeading} />
            </h2>
            {policy.tiers.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground" data-policy-no-tiers>
                <AppBilingual pick={(c) => c.admin.system.commission.policy.noTiers} />
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {policy.tiers.map((tier) => (
                  <li key={tier.id} data-tier={tier.id} className="flex flex-col gap-2 py-3">
                    <p className="text-[length:var(--text-small)] font-medium text-foreground" dir="ltr">
                      <AppBilingual pick={(c) => (tier.maxQuantityKg === null ? c.admin.system.commission.policy.bandOpen.replace("{min}", kg(tier.minQuantityKg)) : c.admin.system.commission.policy.band.replace("{min}", kg(tier.minQuantityKg)).replace("{max}", kg(tier.maxQuantityKg)))} /> · {kg(tier.percentage)}%
                    </p>
                    <RecordForm resource="system" copyKey="commissionTier" mode="edit" formKey={`tier-${tier.id}`} fields={commissionTierFields(tier)} hiddenFields={{ policyId: policy.id, tierId: tier.id }} action={saveCommissionTier} />
                  </li>
                ))}
              </ul>
            )}
            <RecordForm resource="system" copyKey="commissionTier" mode="create" formKey="tier-new" fields={commissionTierFields(null)} hiddenFields={{ policyId: policy.id }} action={saveCommissionTier} />
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <CommissionStatusPanel policyId={policy.id} status={policy.status} />
          <TierCoveragePanel tiers={policy.tiers} />
          <NoDeleteNote />
        </div>
      </div>
    </div>
  );
}
