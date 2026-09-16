import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { KybDecisionPanel } from "@/components/admin/compliance/kyb-decision-panel";
import { KybDocumentReviewPanel } from "@/components/admin/compliance/kyb-document-review-panel";
import { AdminStatusBadge, DOCUMENT_STATUS_TONE, KYB_STATUS_TONE, ORGANIZATION_STATUS_TONE } from "@/components/admin/compliance/status-badge";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { getKybApplicationDetail } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";
import { evaluateKybApprovalReadiness, KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES, type KybRequiredEvidenceState } from "@/lib/admin/kyb-readiness";
import { KYB_DOCUMENT_TYPES, type KybDocumentType } from "@/lib/validation/kyb-application";

/**
 * Feature 010 RUN B (T008/T009) — the reviewer-facing KYB application detail: identity, status,
 * timestamps, the two application fields, documents (with expiry flagged), outstanding items,
 * application-level and document-level review history, organization status history, and the
 * decision panel. Everything rendered is a persisted record read under the operator's own session;
 * unreadable data for this role is STATED (organization row, file metadata, status history — the
 * recorded policy gaps), never fabricated.
 *
 * RUN E (reviewer coherence): the page now derives the approval-readiness summary from the same pure
 * rule the server enforces (`lib/admin/kyb-readiness.ts`), shows each current document's version /
 * replacement lineage and review state, offers the document-outcome control only for a current
 * `PENDING` document of an application still under review, links "View document" only when the file
 * record that locates the bytes is readable by THIS role (a platform admin — a pure COMPLIANCE role
 * cannot read `file_assets`; recorded gap), and tells the reviewer what to do next.
 */

const DOCUMENT_TYPE_KEYS: readonly KybDocumentType[] = ["TRADE_LICENSE", "PROOF_OF_INCORPORATION", "AUTHORIZED_SIGNATORY_ID", "UBO_DECLARATION", "BANKING_EVIDENCE"];

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
      <dt className="text-[length:var(--text-small)] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[length:var(--text-small)] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Section({ heading, children, dataKey }: { heading: ReactNode; children: ReactNode; dataKey: string }) {
  return (
    <section data-kyb-section={dataKey} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
      <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}

const notRecorded: AppCopySelector = (c) => c.admin.compliance.common.notRecorded;

export default async function KybApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const access = await checkAreaAccess("kyb");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const { applicationId } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(applicationId) ? await getKybApplicationDetail(applicationId) : null;

  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.kyb.breadcrumb} />, href: "/dashboard-admin/kyb" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.breadcrumb} /> },
  ];

  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.title} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.description} />} />
      </div>
    );
  }

  const { application, organization, documents, outstanding, reviews, documentReviews, organizationStatusHistory } = detail;
  const readiness = evaluateKybApprovalReadiness(application, documents);
  const documentsReviewable = KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES.includes(application.status);
  const requiredTypes = new Set(KYB_DOCUMENT_TYPES.filter((type) => type.required).map((type) => type.type as string));
  const evidenceStateLabel: Record<KybRequiredEvidenceState, AppCopySelector> = {
    accepted: (c) => c.admin.compliance.kyb.detail.summary.accepted,
    awaiting: (c) => c.admin.compliance.kyb.detail.summary.awaiting,
    rejected: (c) => c.admin.compliance.kyb.detail.summary.rejected,
    expired: (c) => c.admin.compliance.kyb.detail.summary.expired,
    missing: (c) => c.admin.compliance.kyb.detail.summary.missing,
  };
  const nextAction: AppCopySelector =
    application.status === "DRAFT"
      ? (c) => c.admin.compliance.kyb.detail.summary.nextAction.notSubmitted
      : application.status === "SUBMITTED"
        ? (c) => c.admin.compliance.kyb.detail.summary.nextAction.startReview
        : !documentsReviewable
          ? (c) => c.admin.compliance.kyb.detail.summary.nextAction.decided
          : readiness.approvable
            ? (c) => c.admin.compliance.kyb.detail.summary.nextAction.readyToApprove
            : readiness.counts.awaiting > 0
              ? (c) => c.admin.compliance.kyb.detail.summary.nextAction.awaiting.replace("{count}", String(readiness.counts.awaiting))
              : (c) => c.admin.compliance.kyb.detail.summary.nextAction.fixBlockers;
  const viewerId = access.identity.userId;
  const reviewerLabel = (userId: string) =>
    userId === viewerId ? <AppBilingual pick={(c) => c.admin.compliance.common.you} /> : <span className="font-mono text-[length:var(--text-micro)]">{userId}</span>;
  const documentTypeLabel = (type: string) =>
    (DOCUMENT_TYPE_KEYS as readonly string[]).includes(type) ? <AppBilingual pick={(c) => c.kyb.documents.types[type as KybDocumentType]} /> : <span className="font-mono">{type}</span>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={organization?.displayName ?? <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.title} />}
        description={<span className="font-mono text-[length:var(--text-micro)]">{application.id}</span>}
        trail={trail}
        actions={<AdminStatusBadge status={application.status} tone={KYB_STATUS_TONE[application.status] ?? "draft"} pick={(c) => c.admin.compliance.statuses.kyb[application.status]} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section dataKey="application" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.application} />}>
            <dl className="divide-y divide-border">
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.submittedAt} />}>
                <AdminDateTime value={application.submittedAt} fallback={<AppBilingual pick={notRecorded} />} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.decidedAt} />}>
                <AdminDateTime value={application.decidedAt} fallback={<AppBilingual pick={notRecorded} />} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.common.createdAt} />}>
                <AdminDateTime value={application.createdAt} fallback={<AppBilingual pick={notRecorded} />} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.registeredAddress} />}>
                {application.registeredAddress ?? <AppBilingual pick={(c) => c.admin.compliance.common.notProvided} />}
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.businessActivity} />}>
                {application.businessActivity ?? <AppBilingual pick={(c) => c.admin.compliance.common.notProvided} />}
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.rejectionReason} />}>
                {application.rejectionReason ?? <AppBilingual pick={notRecorded} />}
              </Row>
            </dl>
          </Section>

          <Section dataKey="organization" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.organization} />}>
            {organization ? (
              <dl className="divide-y divide-border">
                <Row label={<AppBilingual pick={(c) => c.admin.compliance.organizations.detail.legalName} />}>{organization.legalName}</Row>
                <Row label={<AppBilingual pick={(c) => c.admin.compliance.organizations.detail.displayName} />}>{organization.displayName}</Row>
                <Row label={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.organizationStatus} />}>
                  <AdminStatusBadge status={organization.status} tone={ORGANIZATION_STATUS_TONE[organization.status] ?? "draft"} pick={(c) => c.admin.compliance.statuses.organization[organization.status as keyof typeof c.admin.compliance.statuses.organization] ?? organization.status} />
                </Row>
                <Row label={<AppBilingual pick={(c) => c.admin.compliance.organizations.detail.accountType} />}>{organization.accountType}</Row>
                <Row label={<AppBilingual pick={(c) => c.admin.compliance.organizations.detail.country} />}>{organization.countryCode}</Row>
                <Row label={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.capabilities} />}>
                  <span className="flex flex-wrap gap-3">
                    <span>
                      <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.canBuy} />: <AppBilingual pick={(c) => (organization.canBuy ? c.admin.compliance.common.yes : c.admin.compliance.common.no)} />
                    </span>
                    <span>
                      <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.canSell} />: <AppBilingual pick={(c) => (organization.canSell ? c.admin.compliance.common.yes : c.admin.compliance.common.no)} />
                    </span>
                  </span>
                </Row>
              </dl>
            ) : (
              <div data-organization-gap className="flex flex-col gap-2">
                <p className="font-mono text-[length:var(--text-micro)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.compliance.common.organizationId} />: {application.organizationId}
                </p>
                <p className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.compliance.common.organizationGapNote} />
                </p>
              </div>
            )}
          </Section>

          <Section dataKey="documents" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.heading} />}>
            {documents.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.none} />
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {documents.map((document) => (
                  <li key={document.id} data-document={document.id} data-document-expired={document.expired ? "true" : "false"} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-2" data-document-required={requiredTypes.has(document.documentType) ? "true" : "false"}>
                      <span className="font-medium text-foreground">{documentTypeLabel(document.documentType)}</span>
                      {requiredTypes.has(document.documentType) ? (
                        <span className="text-[length:var(--text-micro)] text-muted-foreground">
                          (<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.required} />)
                        </span>
                      ) : null}
                      <AdminStatusBadge status={document.status} tone={DOCUMENT_STATUS_TONE[document.status] ?? "draft"} pick={(c) => c.admin.compliance.statuses.document[document.status]} />
                      {document.expired ? (
                        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-danger-surface)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold text-[var(--status-danger)]">
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                          <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.expired} />
                        </span>
                      ) : null}
                    </div>
                    <dl className="grid gap-x-6 gap-y-1 text-[length:var(--text-micro)] text-muted-foreground sm:grid-cols-3">
                      <div>
                        <dt className="inline">
                          <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.version} />:{" "}
                        </dt>
                        <dd className="inline tabular-nums">{document.version}</dd>
                      </div>
                      <div>
                        <dt className="inline">
                          <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.expires} />:{" "}
                        </dt>
                        <dd className="inline">
                          <AdminDateTime value={document.expiresAt} dateOnly fallback={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.noExpiry} />} />
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">
                          <AppBilingual pick={(c) => c.admin.compliance.common.createdAt} />:{" "}
                        </dt>
                        <dd className="inline">
                          <AdminDateTime value={document.createdAt} fallback={<AppBilingual pick={notRecorded} />} />
                        </dd>
                      </div>
                    </dl>
                    <p className="text-[length:var(--text-micro)] text-muted-foreground" data-file-metadata={document.fileMetadataReadable ? "readable" : "unavailable"}>
                      {document.fileMetadataReadable ? (
                        <>
                          <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.file} />: {document.originalName ?? "—"} · {document.mimeType ?? "—"} · {document.sizeBytes != null ? `${Math.round(document.sizeBytes / 1024)} KB` : "—"}
                        </>
                      ) : (
                        <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.fileUnavailable} />
                      )}
                    </p>
                    {document.supersedesDocumentId ? (
                      <p className="text-[length:var(--text-micro)] text-muted-foreground" data-document-replaces={document.supersedesDocumentId}>
                        <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.replaces.replace("{version}", String(document.version - 1))} />
                      </p>
                    ) : null}
                    {document.status === "SUPERSEDED" ? (
                      <p className="text-[length:var(--text-micro)] text-muted-foreground" data-document-superseded>
                        <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.superseded} />
                      </p>
                    ) : document.fileMetadataReadable ? (
                      <p className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/dashboard-admin/kyb/${application.id}/documents/${document.id}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-document-view={document.id}
                          className="inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-3 text-[length:var(--text-small)] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.view} />
                        </a>
                        <span className="text-[length:var(--text-micro)] text-muted-foreground">
                          <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.viewHint} />
                        </span>
                      </p>
                    ) : (
                      <p className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-3 py-2 text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground" data-document-view-unavailable={document.id}>
                        <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.viewUnavailable} />
                      </p>
                    )}
                    {document.status === "PENDING" && documentsReviewable ? (
                      <KybDocumentReviewPanel applicationId={application.id} documentId={document.id} bytesOpenable={document.fileMetadataReadable} />
                    ) : document.status !== "SUPERSEDED" ? (
                      <p className="text-[length:var(--text-micro)] text-muted-foreground" data-document-not-reviewable={document.status}>
                        <AppBilingual pick={(c) => (document.status === "PENDING" ? c.admin.compliance.kyb.detail.documents.review.notReviewable.replace("{status}", c.admin.compliance.statuses.kyb[application.status]) : c.admin.compliance.kyb.detail.documents.review.decided.replace("{decision}", c.admin.compliance.statuses.document[document.status]))} />
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p data-document-bytes-note className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.bytesNote} />
            </p>
          </Section>

          <Section dataKey="outstanding" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.outstanding.heading} />}>
            {outstanding.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.outstanding.none} />
              </p>
            ) : (
              <ul className="list-disc ps-5 text-[length:var(--text-small)] text-foreground">
                {outstanding.map((item) => (
                  <li key={item.key}>{item.label}</li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section dataKey="summary" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.heading} />}>
            <p className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.lead} />
            </p>
            <dl
              className="grid grid-cols-2 gap-x-4 gap-y-1 text-[length:var(--text-small)] sm:grid-cols-3"
              data-readiness-required={readiness.counts.required}
              data-readiness-accepted={readiness.counts.accepted}
              data-readiness-awaiting={readiness.counts.awaiting}
              data-readiness-rejected={readiness.counts.rejected}
              data-readiness-expired={readiness.counts.expired}
              data-readiness-missing={readiness.counts.missing}
              data-readiness-fields-missing={readiness.fieldGaps.length}
            >
              {(["required", "accepted", "awaiting", "rejected", "expired", "missing"] as const).map((key) => (
                <div key={key} className="flex flex-col">
                  <dt className="text-[length:var(--text-micro)] text-muted-foreground">
                    <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary[key]} />
                  </dt>
                  <dd className="font-heading text-[length:var(--text-h4)] tabular-nums text-foreground">{readiness.counts[key]}</dd>
                </div>
              ))}
              <div className="flex flex-col">
                <dt className="text-[length:var(--text-micro)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.fieldsMissing} />
                </dt>
                <dd className="font-heading text-[length:var(--text-h4)] tabular-nums text-foreground">{readiness.fieldGaps.length}</dd>
              </div>
            </dl>
            <p
              data-approval-readiness={readiness.approvable ? "ready" : "blocked"}
              className={
                "rounded-[var(--radius-md)] border px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] " +
                (readiness.approvable ? "border-[var(--status-paid)] bg-[var(--status-paid-surface)] text-foreground" : "border-[var(--status-pending)] bg-[var(--status-pending-surface)] text-foreground")
              }
            >
              <AppBilingual pick={(c) => (readiness.approvable ? c.admin.compliance.kyb.detail.summary.approvalReady : c.admin.compliance.kyb.detail.summary.approvalBlocked.replace("{count}", String(readiness.blockers.length)))} />
            </p>
            {readiness.blockers.length > 0 ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">
                  <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.blockersHeading} />
                </h3>
                <ul className="list-disc ps-5 text-[length:var(--text-small)] text-foreground">
                  {readiness.blockers.map((blocker) => (
                    <li key={`${blocker.state}:${blocker.key}`} data-approval-blocker={`${blocker.state}:${blocker.key}`}>
                      {blocker.state === "field" ? (
                        outstanding.find((item) => item.key === blocker.key)?.label ?? blocker.key
                      ) : (
                        <>
                          {documentTypeLabel(blocker.key)} — <AppBilingual pick={evidenceStateLabel[blocker.state]} />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-col gap-1 border-t border-border pt-3" data-next-action>
              <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.nextAction.heading} />
              </h3>
              <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                <AppBilingual pick={nextAction} />
              </p>
              {documentsReviewable && readiness.counts.awaiting > 0 ? (
                <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.summary.nextAction.openDocuments} />
                </p>
              ) : null}
            </div>
          </Section>

          <KybDecisionPanel applicationId={application.id} status={application.status} readiness={{ approvable: readiness.approvable, blockerCount: readiness.blockers.length }} />

          <Section dataKey="reviews" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.reviews.heading} />}>
            {reviews.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.reviews.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {reviews.map((review) => (
                  <li key={review.id} data-review={review.id} className="flex flex-col gap-1 py-3 text-[length:var(--text-small)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminStatusBadge status={review.decision} tone={KYB_STATUS_TONE[review.decision] ?? "draft"} pick={(c) => c.admin.compliance.statuses.kyb[review.decision]} />
                      <span className="text-muted-foreground">
                        <AdminDateTime value={review.createdAt} fallback={<AppBilingual pick={notRecorded} />} />
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.admin.compliance.common.reviewer} />: {reviewerLabel(review.reviewerUserId)}
                    </p>
                    {review.reason ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">{review.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section dataKey="document-reviews" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documentReviews.heading} />}>
            {documentReviews.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documentReviews.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {documentReviews.map((review) => {
                  const document = documents.find((candidate) => candidate.id === review.documentId);
                  return (
                    <li key={review.id} className="flex flex-col gap-1 py-3 text-[length:var(--text-small)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminStatusBadge status={review.decision} tone={DOCUMENT_STATUS_TONE[review.decision] ?? "draft"} pick={(c) => c.admin.compliance.statuses.document[review.decision]} />
                        <span className="text-foreground">{document ? documentTypeLabel(document.documentType) : <span className="font-mono text-[length:var(--text-micro)]">{review.documentId}</span>}</span>
                        <span className="text-muted-foreground">
                          <AdminDateTime value={review.createdAt} fallback={<AppBilingual pick={notRecorded} />} />
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        <AppBilingual pick={(c) => c.admin.compliance.common.reviewer} />: {reviewerLabel(review.reviewerUserId)}
                        {document ? (
                          <>
                            {" · "}
                            <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.documents.version} /> {document.version}
                          </>
                        ) : null}
                      </p>
                      {review.reason ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">{review.reason}</p> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>

          <Section dataKey="history" heading={<AppBilingual pick={(c) => c.admin.compliance.kyb.detail.history.heading} />}>
            {organizationStatusHistory === null ? (
              <p data-history-unavailable className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.history.unavailable} />
              </p>
            ) : organizationStatusHistory.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.kyb.detail.history.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {organizationStatusHistory.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 py-2 text-[length:var(--text-small)]">
                    <span className="font-mono text-[length:var(--text-micro)]">{entry.oldStatus}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-mono text-[length:var(--text-micro)]">{entry.newStatus}</span>
                    <span className="text-muted-foreground">
                      <AdminDateTime value={entry.createdAt} fallback={<AppBilingual pick={notRecorded} />} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
