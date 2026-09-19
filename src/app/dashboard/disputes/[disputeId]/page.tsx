import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { PageHeader } from "@/components/app/page-header";
import { DisputeHonestyNotice } from "@/components/disputes/dispute-honesty-notice";
import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { EvidenceFilesNotice } from "@/components/disputes/evidence-files-notice";
import { EvidenceList } from "@/components/disputes/evidence-list";
import { EvidenceNoteForm } from "@/components/disputes/evidence-note-form";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getDisputeEvidenceForMember, getDisputeForMember } from "@/lib/disputes/read";

export const metadata: Metadata = {
  title: "Dispute",
};

/**
 * Feature 012 RUN A (T006) — one dispute's tracking view for the member who can see it.
 *
 * PRIVACY: `getDisputeForMember` returns `null` for a malformed id, a nonexistent id, and another
 * organization's dispute alike → the same `notFound()`; nothing about another organization's dispute
 * (not even its existence) is observable.
 *
 * UNTRUSTED TEXT: `reason` and `resolution` are free text written by a member and an operator. They
 * render ONLY as React text nodes (escaped by construction, `whitespace-pre-wrap` for line breaks) —
 * never `dangerouslySetInnerHTML`, never markdown.
 *
 * READ-ONLY STATUS: a member has no status control, no edit, no delete here (T003's
 * boundary). RUN B (T008): the ONLY write is appending a text evidence note; no file control exists
 * (DB-BLOCK-01). RUN B (T007): the affected order's OWN status is shown as it is — never inferred.
 */
export default async function DisputeDetailPage({ params }: { params: Promise<{ disputeId: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { disputeId } = await params;
  const dispute = await getDisputeForMember({ organizationId: identity.organization.organizationId, userId: identity.userId, disputeId });
  if (!dispute) notFound();

  // RUN B (T008): evidence on THIS dispute only, through the same acting-organization scope; the
  // uploader is reduced to "you / someone else" — no profile id is rendered.
  const evidence = (await getDisputeEvidenceForMember({ organizationId: identity.organization.organizationId, userId: identity.userId, disputeId: dispute.id })) ?? [];
  const evidenceItems = evidence.map((row) => ({ id: row.id, note: row.note, hasFileReference: row.hasFileReference, byViewer: row.uploadedBy === identity.userId, createdAt: row.createdAt }));

  const decided = dispute.status === "RESOLVED" || dispute.status === "REJECTED" || dispute.status === "CLOSED";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <>
            <AppBilingual pick={(c) => c.disputes.detail.titlePrefix} />{" "}
            <span className="font-mono break-all" dir="ltr">
              {dispute.orderCode}
            </span>
          </>
        }
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.disputes.list.title} />, href: "/dashboard/disputes" },
          { label: <AppBilingual pick={(c) => c.disputes.detail.breadcrumb} /> },
        ]}
      />

      <section aria-labelledby="dispute-status-heading" className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dispute-status-heading" className="text-base font-semibold text-foreground">
            <AppBilingual pick={(c) => c.disputes.detail.statusHeading} />
          </h2>
          <DisputeStatusBadge status={dispute.status} />
        </div>
        <p data-slot="dispute-status-description" className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.statusDescription[dispute.status]} />
        </p>
      </section>

      <section aria-labelledby="dispute-details-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="dispute-details-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.detailsHeading} />
        </h2>
        <dl className="grid grid-cols-1 gap-4 text-[length:var(--text-small)] sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.detail.orderLabel} />
            </dt>
            <dd>
              <Link
                href={`/dashboard/orders/${dispute.orderId}`}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <span className="font-mono break-all" dir="ltr">
                  {dispute.orderCode}
                </span>
                <span className="sr-only">
                  {" "}
                  <AppBilingual pick={(c) => c.disputes.detail.viewOrder} />
                </span>
              </Link>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.detail.raisedByLabel} />
            </dt>
            <dd className="text-foreground">
              <AppBilingual pick={(c) => (dispute.raisedByYou ? c.disputes.list.raisedByYou : c.disputes.list.raisedByColleague)} />
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.detail.openedLabel} />
            </dt>
            <dd className="text-foreground">
              <AdminDateTime value={dispute.openedAt} fallback="—" />
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.detail.updatedLabel} />
            </dt>
            <dd className="text-foreground">
              <AdminDateTime value={dispute.updatedAt} fallback="—" />
            </dd>
          </div>
          {decided ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">
                <AppBilingual pick={(c) => c.disputes.detail.resolvedLabel} />
              </dt>
              <dd className="text-foreground">
                <AdminDateTime value={dispute.resolvedAt} fallback="—" />
              </dd>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.detail.correlationLabel} />
            </dt>
            <dd data-slot="correlation-id" className="font-mono text-[length:var(--text-micro)] break-all text-foreground" dir="ltr">
              {dispute.correlationId}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="dispute-reason-heading" className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="dispute-reason-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.reasonHeading} />
        </h2>
        <UntrustedText value={dispute.reason} slot="dispute-reason" />
      </section>

      <section aria-labelledby="dispute-resolution-heading" className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="dispute-resolution-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.resolutionHeading} />
        </h2>
        {dispute.resolution ? (
          <UntrustedText value={dispute.resolution} slot="dispute-resolution" />
        ) : (
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.disputes.detail.resolutionPending} />
          </p>
        )}
      </section>

      <section aria-labelledby="dispute-affected-heading" data-slot="dispute-affected-order" className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="dispute-affected-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.affectedHeading} />
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[length:var(--text-small)]">
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.disputes.detail.orderStatusLabel} />
          </span>
          <OrderStatusBadge status={dispute.orderStatus} />
        </div>
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.orderStatusNote} />
        </p>
      </section>

      <section aria-labelledby="dispute-evidence-heading" data-slot="dispute-evidence" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="dispute-evidence-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.evidence.heading} />
        </h2>
        <p className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.disputes.evidence.description} />
        </p>
        <EvidenceList items={evidenceItems} />
        <EvidenceFilesNotice />
        <EvidenceNoteForm disputeId={dispute.id} />
      </section>

      <DisputeHonestyNotice />
    </div>
  );
}
