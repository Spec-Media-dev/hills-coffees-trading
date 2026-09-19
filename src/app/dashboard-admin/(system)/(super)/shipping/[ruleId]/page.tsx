import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { shippingRuleFields } from "@/components/admin/system/fields";
import { ActiveBadge, NoDeleteNote, ShippingUnconsumedNotice } from "@/components/admin/system/notices";
import { EffectiveWindow, SystemNotFound, systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { formatMoney } from "@/lib/dashboard/format";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getShippingRule } from "@/lib/admin/pricing-rules";
import { saveShippingRule } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/** Feature 010 RUN F (T028) — edit one shipping rule (stored only; no consumer yet — stated). */
export default async function ShippingRulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  const access = await checkAreaAccess("shipping");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  const { ruleId } = await params;
  const rule = await getShippingRule(ruleId);
  const trail = systemTrail((c) => c.admin.system.shipping.breadcrumb, "/dashboard-admin/shipping", (c) => c.admin.system.forms.shippingRule.editTitle);
  if (!rule) return <SystemNotFound title={(c) => c.admin.system.forms.shippingRule.editTitle} trail={trail} backHref="/dashboard-admin/shipping" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${rule.deliveryMethod} · ${formatMoney(rule.flatFee, rule.currency)}`} description={<EffectiveWindow from={rule.effectiveFrom} until={rule.effectiveUntil} />} trail={trail} actions={<ActiveBadge isActive={rule.isActive} />} />
      <ShippingUnconsumedNotice />
      <RecordForm resource="system" copyKey="shippingRule" mode="edit" formKey="shipping-rule" fields={shippingRuleFields(rule)} hiddenFields={{ ruleId: rule.id }} action={saveShippingRule} />
      <NoDeleteNote />
    </div>
  );
}
