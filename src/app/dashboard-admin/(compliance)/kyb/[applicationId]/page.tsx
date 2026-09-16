import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { KybDecisionPanel } from "@/components/admin/compliance/kyb-decision-panel";
import { AdminStatusBadge, DOCUMENT_STATUS_TONE, KYB_STATUS_TONE, ORGANIZATION_STATUS_TONE } from "@/components/admin/compliance/status-badge";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { getKybApplicationDetail } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";
import type { KybDocumentType } from "@/lib/validation/kyb-application";

/**
 * Feature 010 RUN B (T008/T009) — the reviewer-facing KYB application detail: identity, status,
 * timestamps, the two application fields, documents (with expiry flagged), outstanding items,
 * application-level and document-level review history, organization status history, and the
 * decision panel. Everything rendered is a persisted record read under the operator's own session;
 * unreadable data for this role is STATED (organization row, file metadata, status history — the
 * recorded policy gaps), never fabricated. No download control is rendered because document bytes
 * cannot be opened from this console today (see `lib/admin/compliance.ts`).
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{documentTypeLabel(document.documentType)}</span>
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
          <KybDecisionPanel applicationId={application.id} status={application.status} />

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
