import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { paymentAccountFields } from "@/components/admin/system/fields";
import { HighRiskNotice } from "@/components/admin/system/notices";
import { systemTrail } from "@/components/admin/system/page-parts";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { savePaymentAccount } from "@/src/app/dashboard-admin/(system)/payment-accounts/actions";

/** Feature 010 RUN F (T029) — create a payment account: super admin only (the database WITH CHECK), high-risk, single actor. */
export default async function NewPaymentAccountPage() {
  const access = await checkRoleFunctionAccess("is_super_admin");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_super_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.system.forms.paymentAccount.createTitle} />} trail={systemTrail((c) => c.admin.system.paymentAccounts.breadcrumb, "/dashboard-admin/payment-accounts", (c) => c.admin.system.forms.paymentAccount.createTitle)} />
      <HighRiskNotice />
      <RecordForm resource="system" copyKey="paymentAccount" mode="create" formKey="payment-account" fields={paymentAccountFields(null)} hiddenFields={{}} action={savePaymentAccount} successHrefTemplate="/dashboard-admin/payment-accounts/{id}" />
    </div>
  );
}
