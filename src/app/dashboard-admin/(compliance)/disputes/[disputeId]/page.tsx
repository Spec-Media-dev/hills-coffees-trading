import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { DisputeDecisionPanel } from "@/components/admin/compliance/dispute-decision-panel";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { DISPUTE_TRANSITIONS } from "@/lib/disputes/compliance";
import { getDisputeEvidenceForOperator, getDisputeForCompliance, getDisputeStatusHistoryForOperator } from "@/lib/disputes/read";

/**
 * Feature 010 T012 — one dispute under compliance review, composed ONLY from Feature 012's layer:
 * `getDisputeForCompliance` (the record), `getDisputeEvidenceForOperator("compliance")` (text notes —
 * files cannot be stored, DB-BLOCK-01) and `getDisputeStatusHistoryForOperator("compliance")` (the
 * append-only `dispute_status_history` the database writes on every transition: actor, from/to,
 * reason, time). The panel's next statuses come from Feature 012's `DISPUTE_TRANSITIONS`; the change
 * itself runs through Feature 012's named operation and the database's `transition_dispute()`.
 * Member and operator free text renders only through `UntrustedText` (a React text node).
 * FROZEN is a record label only — nothing on this page implies an order/payment hold (DB-OPEN-09).
 */

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
      <dt className="text-[length:var(--text-small)] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[length:var(--text-small)] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function DisputeReviewPage({ params }: { params: Promise<{ disputeId: string }> }) {
  const access = await checkAreaAccess("disputes");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const { disputeId } = await params;
  const dispute = /^[0-9a-f-]{36}$/i.test(disputeId) ? await getDisputeForCompliance(disputeId) : null;
  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.disputes.breadcrumb} />, href: "/dashboard-admin/disputes" },
    { label: <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.title} /> },
  ];

  if (!dispute) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.title} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.notFound.description} />} />
      </div>
    );
  }

  const [evidence, history] = await Promise.all([getDisputeEvidenceForOperator("compliance", dispute.id), getDisputeStatusHistoryForOperator("compliance", dispute.id)]);
  const viewerId = access.identity.userId;
  const notRecorded = <AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />;
  const person = (userId: string | null) => (userId === viewerId ? <AppBilingual pick={(c) => c.admin.compliance.common.you} /> : userId ? <span className="font-mono text-[length:var(--text-micro)]">{userId}</span> : notRecorded);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.title} />}
        description={<span className="font-mono text-[length:var(--text-micro)] [overflow-wrap:anywhere]">{dispute.id}</span>}
        trail={trail}
        actions={<DisputeStatusBadge status={dispute.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section data-dispute-section="identity" className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <dl className="divide-y divide-border">
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.order} />}>
                {dispute.orderContextReadable && dispute.orderCode ? <span className="font-mono">{dispute.orderCode}</span> : null}
                <span className="block font-mono text-[length:var(--text-micro)] text-muted-foreground">{dispute.orderId}</span>
                {dispute.orderContextReadable ? null : (
                  <span data-dispute-order-unreadable className="mt-1 block text-[length:var(--text-micro)] text-muted-foreground">
                    <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.orderUnreadable} />
                  </span>
                )}
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.openedBy} />}>{person(dispute.openedByUserId)}</Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.openedByOrganization} />}>
                {dispute.openedByOrganizationId ? <span className="font-mono text-[length:var(--text-micro)]">{dispute.openedByOrganizationId}</span> : notRecorded}
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.openedAt} />}>
                <AdminDateTime value={dispute.openedAt} fallback={notRecorded} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.updatedAt} />}>
                <AdminDateTime value={dispute.updatedAt} fallback={notRecorded} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.resolvedAt} />}>
                <AdminDateTime value={dispute.resolvedAt} fallback={notRecorded} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.resolvedBy} />}>{person(dispute.resolvedBy)}</Row>
              <Row label={<AppBilingual pick={(c) => c.admin.compliance.disputes.detail.correlation} />}>
                <span className="font-mono text-[length:var(--text-micro)]">{dispute.correlationId}</span>
              </Row>
            </dl>
          </section>

          <section data-dispute-section="reason" className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.reasonHeading} />
            </h2>
            <UntrustedText value={dispute.reason} slot="dispute-reason" />
            <h3 className="mt-3 text-[length:var(--text-small)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.resolutionHeading} />
            </h3>
            {dispute.resolution ? (
              <UntrustedText value={dispute.resolution} slot="dispute-resolution" />
            ) : (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.resolutionPending} />
              </p>
            )}
          </section>

          <section data-dispute-section="history" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.history.heading} />
              </h2>
              <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.history.lead} />
              </p>
            </div>
            {!history || history.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.history.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {history.map((entry) => (
                  <li key={entry.id} data-dispute-history-entry={entry.id} className="flex flex-col gap-1.5 py-3 text-[length:var(--text-small)]">
                    <span className="flex flex-wrap items-center gap-2">
                      <DisputeStatusBadge status={entry.fromStatus} />
                      <span aria-hidden="true" className="rtl:rotate-180">
                        →
                      </span>
                      <DisputeStatusBadge status={entry.toStatus} />
                      <span className="text-muted-foreground">
                        <AdminDateTime value={entry.createdAt} fallback={notRecorded} />
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.history.actor} />: {person(entry.actorUserId)}
                    </span>
                    <UntrustedText value={entry.reason} slot="dispute-history-reason" />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section data-dispute-section="evidence" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.evidence.heading} />
            </h2>
            <p className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.evidence.filesUnavailable} />
            </p>
            {!evidence || evidence.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.evidence.none} />
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {evidence.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1 py-3 text-[length:var(--text-small)]">
                    <span className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.admin.compliance.disputes.detail.evidence.addedBy} />: {person(item.uploadedBy)} · <AdminDateTime value={item.createdAt} fallback={notRecorded} />
                    </span>
                    {item.note ? <UntrustedText value={item.note} slot="dispute-evidence-note" /> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <DisputeDecisionPanel disputeId={dispute.id} status={dispute.status} targets={DISPUTE_TRANSITIONS[dispute.status]} />
          <section data-dispute-freeze-note className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-4">
            <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.freezeNote.heading} />
            </h2>
            <p className="mt-1 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.freezeNote.body} />
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
