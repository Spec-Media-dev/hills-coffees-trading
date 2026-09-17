import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { shippingRuleFields } from "@/components/admin/system/fields";
import { ShippingUnconsumedNotice } from "@/components/admin/system/notices";
import { systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveShippingRule } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/** Feature 010 RUN F (T028) — create a shipping rule (stored only; no consumer yet — stated). */
export default async function NewShippingRulePage() {
  const access = await checkAreaAccess("shipping");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.system.forms.shippingRule.createTitle} />} trail={systemTrail((c) => c.admin.system.shipping.breadcrumb, "/dashboard-admin/shipping", (c) => c.admin.system.forms.shippingRule.createTitle)} />
      <ShippingUnconsumedNotice />
      <RecordForm resource="system" copyKey="shippingRule" mode="create" formKey="shipping-rule" fields={shippingRuleFields(null)} hiddenFields={{}} action={saveShippingRule} successHrefTemplate="/dashboard-admin/shipping/{id}" />
    </div>
  );
}
