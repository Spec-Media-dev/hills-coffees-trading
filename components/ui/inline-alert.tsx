import type { ComponentProps } from "react"

import { Icon, type IconName } from "@/components/ui/icon"
import { cn } from "cn"

type AlertTone = "info" | "success" | "warning" | "danger"

const tones: Record<AlertTone, { classes: string; icon: IconName }> = {
  info: { classes: "border-[var(--info)] bg-[var(--info-surface)] text-[var(--info)]", icon: "alert-circle" },
  success: { classes: "border-[var(--success)] bg-[var(--success-surface)] text-[var(--success)]", icon: "check" },
  warning: { classes: "border-[var(--warning)] bg-[var(--warning-surface)] text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]", icon: "warning" },
  danger: { classes: "border-[var(--danger)] bg-[var(--danger-surface)] text-[var(--danger)]", icon: "circle-x" },
}

type InlineAlertProps = ComponentProps<"div"> & { tone?: AlertTone; title: string }

function InlineAlert({ tone = "info", title, children, className, ...props }: InlineAlertProps) {
  const treatment = tones[tone]
  return (
    <div role="alert" data-slot="inline-alert" data-tone={tone} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[var(--radius-sm)] border p-4 text-sm", treatment.classes, className)} {...props}>
      <Icon name={treatment.icon} className="mt-0.5 size-5" />
      <div className="min-w-0"><p className="font-semibold">{title}</p>{children ? <div className="mt-1 text-current/85">{children}</div> : null}</div>
    </div>
  )
}

export { InlineAlert }
