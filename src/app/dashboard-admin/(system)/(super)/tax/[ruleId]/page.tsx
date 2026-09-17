import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { taxRuleFields } from "@/components/admin/system/fields";
import { ActiveBadge, AttributionGapNotice, FutureOnlyNotice, NoDeleteNote } from "@/components/admin/system/notices";
import { EffectiveWindow, SystemNotFound, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getTaxRule, listTaxRules, resolveInForceTaxRule } from "@/lib/admin/pricing-rules";
import { saveTaxRule } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/** Feature 010 RUN F (T028) — edit one tax rule; states whether checkout would select it right now. */
export default async function TaxRulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  const access = await checkAreaAccess("tax");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const { ruleId } = await params;
  const rule = await getTaxRule(ruleId);
  const trail = systemTrail((c) => c.admin.system.tax.breadcrumb, "/dashboard-admin/tax", (c) => c.admin.system.forms.taxRule.editTitle);
  if (!rule) return <SystemNotFound title={(c) => c.admin.system.forms.taxRule.editTitle} trail={trail} backHref="/dashboard-admin/tax" />;
  const inForce = resolveInForceTaxRule((await listTaxRules()) ?? [], rule.countryCode);
  const selected = inForce?.id === rule.id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${rule.countryCode} · ${rule.taxName} ${rule.ratePercentage}%`}
        description={<EffectiveWindow from={rule.effectiveFrom} until={rule.effectiveUntil} />}
        trail={trail}
        actions={<ActiveBadge isActive={rule.isActive} />}
      />
      <FutureOnlyNotice />
      <p data-tax-selected={selected ? "true" : "false"} className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] text-foreground">
        <AppBilingual
          pick={(c) =>
            selected
              ? c.admin.system.tax.inForce.replace("{country}", rule.countryCode).replace("{name}", rule.taxName).replace("{rate}", String(rule.ratePercentage)).replace("{base}", c.admin.system.tax.taxableBases[rule.taxableBase] ?? rule.taxableBase)
              : c.admin.system.tax.notInForce.replace("{country}", rule.countryCode)
          }
        />
      </p>
      <RecordForm resource="system" copyKey="taxRule" mode="edit" formKey="tax-rule" fields={taxRuleFields(rule)} hiddenFields={{ ruleId: rule.id }} action={saveTaxRule} />
      <AttributionGapNotice />
      <NoDeleteNote />
    </div>
  );
}
