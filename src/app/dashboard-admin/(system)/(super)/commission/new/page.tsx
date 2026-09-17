import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { commissionPolicyFields } from "@/components/admin/system/fields";
import { FutureOnlyNotice } from "@/components/admin/system/notices";
import { systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveCommissionPolicy } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/** Feature 010 RUN F (T042) — create a commission policy (always DRAFT; activation is a separate confirmed operation). */
export default async function NewCommissionPolicyPage() {
  const access = await checkAreaAccess("commission");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.system.forms.commissionPolicy.createTitle} />} trail={systemTrail((c) => c.admin.system.commission.breadcrumb, "/dashboard-admin/commission", (c) => c.admin.system.forms.commissionPolicy.createTitle)} />
      <FutureOnlyNotice />
      <RecordForm resource="system" copyKey="commissionPolicy" mode="create" formKey="commission-policy" fields={commissionPolicyFields(null)} hiddenFields={{}} action={saveCommissionPolicy} successHrefTemplate="/dashboard-admin/commission/{id}" />
    </div>
  );
}
