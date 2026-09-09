import type { ComponentProps } from "react"

import { cn } from "cn"

function FileUpload({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="file"
      data-slot="file-upload"
      className={cn(
        "min-h-11 w-full rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-3 text-sm text-foreground file:me-3 file:min-h-9 file:rounded-[var(--radius-sm)] file:border-0 file:bg-primary file:px-3.5 file:font-semibold file:text-primary-foreground hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { FileUpload }
