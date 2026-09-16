import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { cn } from "cn";

/**
 * Feature 010 RUN B — status badge for compliance surfaces: text label (bilingual) + a semantic dot,
 * never colour alone (FR-013/FR-015). Tone is presentational; the label is the meaning.
 */
export type AdminStatusTone = "draft" | "pending" | "review" | "paid" | "complete" | "danger" | "cancelled" | "transit";

const TONE: Record<AdminStatusTone, string> = {
  draft: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
  pending: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  review: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  paid: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  complete: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  danger: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  cancelled: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  transit: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
};

export const KYB_STATUS_TONE: Record<string, AdminStatusTone> = {
  DRAFT: "draft",
  SUBMITTED: "pending",
  UNDER_REVIEW: "review",
  APPROVED: "paid",
  REJECTED: "danger",
  RESUBMISSION_REQUIRED: "pending",
  SUSPENDED: "danger",
};

export const ORGANIZATION_STATUS_TONE: Record<string, AdminStatusTone> = {
  PENDING_KYB: "pending",
  UNDER_REVIEW: "review",
  ACTIVE: "paid",
  SUSPENDED: "danger",
  REJECTED: "danger",
  CLOSED: "cancelled",
};

export const DOCUMENT_STATUS_TONE: Record<string, AdminStatusTone> = {
  PENDING: "pending",
  ACCEPTED: "paid",
  REJECTED: "danger",
  SUPERSEDED: "cancelled",
};

export function AdminStatusBadge({ status, tone, pick, className }: { status: string; tone: AdminStatusTone; pick: AppCopySelector; className?: string }) {
  return (
    <span
      data-slot="admin-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", TONE[tone], className)}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={pick} />
      </span>
    </span>
  );
}
