"use client"

import { Toaster, toast } from "sonner"

import { useLocale } from "@/components/locale/locale-provider"

/**
 * App-wide toast host for action/server feedback. Mounted once at the root
 * layout. `dir` follows the same `useLocale()` direction every other client surface reads from, so
 * a toast fired while the viewer is in Arabic/RTL lays out and anchors correctly without a second
 * direction system.
 */
function HillsToaster() {
  const { direction } = useLocale()
  return (
    <Toaster
      position={direction === "rtl" ? "bottom-left" : "bottom-right"}
      dir={direction}
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
