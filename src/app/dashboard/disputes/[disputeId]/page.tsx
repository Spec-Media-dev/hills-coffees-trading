import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { PageHeader } from "@/components/app/page-header";
import { DisputeHonestyNotice } from "@/components/disputes/dispute-honesty-notice";
import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getDisputeForMember } from "@/lib/disputes/read";

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
 * READ-ONLY: a member has no dispute action here — no status control, no edit, no delete (T003's
 * boundary). Evidence display/entry is T008 and is not part of RUN A.
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
        <p data-slot="dispute-reason" dir="auto" className="text-[length:var(--text-small)] break-words whitespace-pre-wrap text-foreground">
          {dispute.reason}
        </p>
      </section>

      <section aria-labelledby="dispute-resolution-heading" className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="dispute-resolution-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.detail.resolutionHeading} />
        </h2>
        {dispute.resolution ? (
          <p data-slot="dispute-resolution" dir="auto" className="text-[length:var(--text-small)] break-words whitespace-pre-wrap text-foreground">
            {dispute.resolution}
          </p>
        ) : (
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.disputes.detail.resolutionPending} />
          </p>
        )}
      </section>

      <DisputeHonestyNotice />
    </div>
  );
}
