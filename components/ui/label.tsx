"use client"

import * as React from "react"
import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm font-semibold leading-[var(--lh-snug)] select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-[0.45] peer-disabled:cursor-not-allowed peer-disabled:opacity-[0.45]",
        className
      )}
      {...props}
    />
  )
}

export { Label }
