import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { taxRuleFields } from "@/components/admin/system/fields";
import { FutureOnlyNotice } from "@/components/admin/system/notices";
import { systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveTaxRule } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/** Feature 010 RUN F (T028) — create a tax rule (future snapshots only). */
export default async function NewTaxRulePage() {
  const access = await checkAreaAccess("tax");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.system.forms.taxRule.createTitle} />} trail={systemTrail((c) => c.admin.system.tax.breadcrumb, "/dashboard-admin/tax", (c) => c.admin.system.forms.taxRule.createTitle)} />
      <FutureOnlyNotice />
      <RecordForm resource="system" copyKey="taxRule" mode="create" formKey="tax-rule" fields={taxRuleFields(null)} hiddenFields={{}} action={saveTaxRule} successHrefTemplate="/dashboard-admin/tax/{id}" />
    </div>
  );
}
