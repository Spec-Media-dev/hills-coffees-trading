import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-28 w-full rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-4 py-3 text-base outline-none transition-[border-color,box-shadow,background-color] duration-[var(--dur-fast)] placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive aria-invalid:outline-destructive data-[state=loading]:cursor-progress data-[state=success]:border-[var(--success)] md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
