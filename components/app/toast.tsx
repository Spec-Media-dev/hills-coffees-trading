"use client"

import { Toaster, toast } from "sonner"

function HillsToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-[var(--radius-lg)] !border-border !bg-[var(--surface-raised)] !text-foreground !shadow-[var(--shadow-lg)]",
          title: "!font-semibold",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
        },
      }}
    />
  )
}

export { HillsToaster, toast }
