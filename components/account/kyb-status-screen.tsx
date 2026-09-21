import Link from "next/link";

import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { OnboardingProgress } from "@/components/account/onboarding-progress";
import { StartKybVerificationButton } from "@/components/account/start-kyb-verification-button";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { KybApplicationSummary, KybDocumentSummary } from "@/lib/kyb/status";
import { isDocumentExpired } from "@/lib/kyb/status";
import type { KybDocumentReview } from "@/lib/kyb/review-items";

/**
 * Feature 003 T019/T021/T022 — the truthful KYB status hub, rendered by `/dashboard/page.tsx` for
 * every non-approved organization. Covers all seven `kyb_applications.status` values plus the
 * implicit eighth "no application started yet" state (`PENDING_KYB`, `application === null`).
 *
 * Every branch shows: a clear title, an honest explanation, the one allowed next action (if any),
 * and nothing else — no fake ETA, no fake reviewer identity (`reviewerLabel` is always the DB's own
 * fixed `"Hills Compliance"` constant), and no implication of approval before
 * `identity.isAuthorizedMember` genuinely says so. `REJECTED`/`SUSPENDED` render NO trading entry
 * point at all — this is presentation only; the actual denial is the server/DB authorization layer
 * this component never touches.
 */
export function KybStatusScreen({
  application,
  currentDocuments,
  reviews,
}: {
  application: KybApplicationSummary | null;
  currentDocuments: KybDocumentSummary[];
  reviews: KybDocumentReview[];
}) {
  return (
    // A plain `<div>`: this renders only as `{children}` inside `dashboard/layout.tsx`'s
    // `!isAuthorizedMember` branch, which already supplies the page's `<main>` landmark.
    <div className="hc-container flex min-h-[60vh] flex-1 items-center py-12">
      <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <OnboardingProgress currentStep="kyb" />
        <div className="relative flex flex-col gap-6 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-[var(--shadow-md)] sm:p-9">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <span className="hc-eyebrow pt-1 text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <AppBilingual pick={(c) => c.kyb.hub.eyebrow} />
          </span>
          <ExpiredDocumentWarning currentDocuments={currentDocuments} />
          <KybStatusBody application={application} currentDocuments={currentDocuments} reviews={reviews} />
        </div>
      </div>
    </div>
  );
}

function KybStatusBody({
  application,
  currentDocuments,
  reviews,
}: {
  application: KybApplicationSummary | null;
  currentDocuments: KybDocumentSummary[];
  reviews: KybDocumentReview[];
}) {
  if (!application) {
    return (
    <StatusBlock pickTitle={(c) => c.kyb.hub.noApplication.title} pickDescription={(c) => c.kyb.hub.noApplication.description}>
        <StartKybVerificationButton />
      </StatusBlock>
    );
  }

  switch (application.status) {
    case "DRAFT":
      return (
        <StatusBlock pickTitle={(c) => c.kyb.hub.draft.title} pickDescription={(c) => c.kyb.hub.draft.description}>
          <Button render={<Link href="/dashboard/kyb/" />}>
            <AppBilingual pick={(c) => c.kyb.hub.draft.continue} />
          </Button>
        </StatusBlock>
      );

    case "SUBMITTED":
      return <StatusBlock pickTitle={(c) => c.kyb.hub.submitted.title} pickDescription={(c) => c.kyb.hub.submitted.description} />;

    case "UNDER_REVIEW":
      return <StatusBlock pickTitle={(c) => c.kyb.hub.underReview.title} pickDescription={(c) => c.kyb.hub.underReview.description} />;

    case "RESUBMISSION_REQUIRED": {
      const rejected = currentDocuments.filter((document) => document.status === "REJECTED");
      return (
        <StatusBlock pickTitle={(c) => c.kyb.hub.resubmissionRequired.title} pickDescription={(c) => c.kyb.hub.resubmissionRequired.description}>
          {rejected.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {rejected.map((document) => {
                const review = reviews.find((entry) => entry.documentId === document.id);
                return (
                  <li key={document.id} className="text-[length:var(--text-small)] text-destructive">
                    <AppBilingual pick={(c) => c.kyb.documents.types[document.documentType as keyof typeof c.kyb.documents.types] ?? document.documentType} />
                    {review?.reason ? ` — ${review.reason}` : ""}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Button render={<Link href="/dashboard/kyb/" />}>
            <AppBilingual pick={(c) => c.kyb.hub.resubmissionRequired.fix} />
          </Button>
        </StatusBlock>
      );
    }

    case "REJECTED":
      return (
        <StatusBlock pickTitle={(c) => c.kyb.hub.rejected.title} pickDescription={(c) => c.kyb.hub.rejected.description}>
          <p className="hc-meta text-muted-foreground">
            <AppBilingual pick={(c) => c.kyb.hub.rejected.reasonLabel} />: {application.rejectionReason ?? <AppBilingual pick={(c) => c.kyb.hub.rejected.noReason} />}
          </p>
        </StatusBlock>
      );

    case "SUSPENDED":
      return <StatusBlock pickTitle={(c) => c.kyb.hub.suspended.title} pickDescription={(c) => c.kyb.hub.suspended.description} />;

    case "APPROVED":
      // Transient: `kyb_applications.status = APPROVED` can briefly precede `organizations.status`
      // flipping to `ACTIVE` (two separate, Compliance-owned writes) — this branch is reachable only
      // in that narrow window, since `identity.isAuthorizedMember` is what actually gates the
      // ordinary AppShell, not this screen.
      return <StatusBlock pickTitle={(c) => c.kyb.hub.approved.title} pickDescription={(c) => c.kyb.hub.approved.description} />;

    default:
      return <StatusBlock pickTitle={(c) => c.kyb.hub.underReview.title} pickDescription={(c) => c.kyb.hub.underReview.description} />;
  }
}

function StatusBlock({ pickTitle, pickDescription, children }: { pickTitle: AppCopySelector; pickDescription: AppCopySelector; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-[length:var(--text-h3)] font-semibold tracking-[-0.015em] text-foreground text-balance"><AppBilingual pick={pickTitle} /></h1>
      <p className="max-w-[62ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty"><AppBilingual pick={pickDescription} /></p>
      {children ? <div className="mt-2 flex flex-col gap-3">{children}</div> : null}
    </div>
  );
}

/** T022 — a currently-expired required document is surfaced here regardless of application status. */
function ExpiredDocumentWarning({ currentDocuments }: { currentDocuments: KybDocumentSummary[] }) {
  const expired = currentDocuments.filter((document) => isDocumentExpired(document));
  if (expired.length === 0) return null;

  return (
    <InlineAlert tone="warning" title={<AppBilingual pick={(c) => c.kyb.completeness.title} />}>
      <ul className="flex flex-col gap-1">
        {expired.map((document) => (
          <li key={document.id}>
            <AppBilingual pick={(c) => c.kyb.documents.types[document.documentType as keyof typeof c.kyb.documents.types] ?? document.documentType} />
          </li>
        ))}
      </ul>
    </InlineAlert>
  );
}
