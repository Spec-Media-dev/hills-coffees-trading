import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KybDocumentChecklist } from "@/components/account/kyb-document-checklist";
import { KybDraftForm } from "@/components/account/kyb-draft-form";
import { KybSubmitPanel } from "@/components/account/kyb-submit-panel";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { PageHeader } from "@/components/app/page-header";
import { getRequestIdentity } from "@/lib/auth/dal";
import { checkKybCompleteness } from "@/lib/kyb/completeness";
import { listKybDocumentReviews } from "@/lib/kyb/review-items";
import { currentDocuments, getKybWorkspace, KYB_EDITABLE_STATUSES } from "@/lib/kyb/status";

export const metadata: Metadata = {
  title: "KYB verification",
  robots: { index: false, follow: false },
};

/**
 * Feature 003 T016/T017/T018/T020 — the KYB draft/upload/submit workspace.
 *
 * INDEPENDENTLY RE-VERIFIES authorization (same rule `dashboard/page.tsx` already documents):
 * `dashboard/layout.tsx`'s `!isAuthorizedMember` branch now renders `{children}` for ANY non-business
 * content, not just this page, so this page cannot rely on the layout alone to have confirmed it is
 * reachable, editable, or even relevant right now. An already-authorized member, an organization with
 * no application yet, or an application in a non-editable state (SUBMITTED/UNDER_REVIEW/APPROVED/
 * REJECTED/SUSPENDED) are all redirected back to `/dashboard/` — the hub, not this workspace, is
 * where "start verification" and every read-only status live.
 */
export default async function KybWorkspacePage() {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") redirect("/sign-in/");
  if (!identity.isEmailVerified) redirect("/verify-email/");
  if (identity.organization === null || identity.requiresOrganizationSelection) redirect("/dashboard/");
  if (identity.isAuthorizedMember) redirect("/dashboard/");

  const workspace = await getKybWorkspace(identity.organization.organizationId);

  if (!workspace.application || !KYB_EDITABLE_STATUSES.includes(workspace.application.status)) {
    redirect("/dashboard/");
  }

  const documents = currentDocuments(workspace.documents);
  const reviewsResult = await listKybDocumentReviews(workspace.application.id);
  const reviews = reviewsResult.ok ? reviewsResult.reviews : [];
  const completeness = checkKybCompleteness(workspace.application, documents);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.kyb.form.title} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard/" }, { label: <AppBilingual pick={(c) => c.kyb.form.title} /> }]}
      />

      <div className="flex flex-col gap-8 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <KybDraftForm
          defaultValues={{
            registeredAddress: workspace.application.registeredAddress ?? "",
            businessActivity: workspace.application.businessActivity ?? "",
          }}
        />
        <hr className="border-border" />
        <KybDocumentChecklist currentDocuments={documents} reviews={reviews} />
        <hr className="border-border" />
        <KybSubmitPanel missing={completeness.missing} mode={workspace.application.status === "RESUBMISSION_REQUIRED" ? "resubmit" : "submit"} />
      </div>
    </div>
  );
}
