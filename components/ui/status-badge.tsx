import type { ComponentProps } from "react"

import { cn } from "cn"

export const STATUS_VALUES = [
  "Draft",
  "Quoted / Awaiting confirmation",
  "Payment pending",
  "Paid",
  "Processing / Allocated",
  "In transit",
  "Completed",
  "Cancelled",
  "Refunded",
  "Disputed",
  "Requested",
  "Confirmed",
  "Reserved",
  "Picking",
  "Dispatched",
  "Delivered",
  "Failed",
  "Submitted",
  "Under review",
  "More info",
  "Approved",
  "Rejected",
  "Suspended / Expired",
] as const

export type StatusValue = (typeof STATUS_VALUES)[number]

const statusTone: Record<StatusValue, string> = {
  Draft: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
  "Quoted / Awaiting confirmation": "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  "Payment pending": "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  Paid: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  "Processing / Allocated": "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  "In transit": "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  Completed: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  Cancelled: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  Refunded: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  Disputed: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  Requested: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  Confirmed: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  Reserved: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  Picking: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  Dispatched: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  Delivered: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  Failed: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  Submitted: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  "Under review": "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  "More info": "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  Approved: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  Rejected: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  "Suspended / Expired": "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
}

type StatusBadgeProps = Omit<ComponentProps<"span">, "children"> & { status: StatusValue }

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  return (
    <span data-slot="status-badge" data-status={status} className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", statusTone[status], className)} {...props}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>{status}</span>
    </span>
  )
}

export { StatusBadge }
