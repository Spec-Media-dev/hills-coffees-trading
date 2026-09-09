import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-4 py-2 text-base outline-none transition-[border-color,box-shadow,background-color] duration-[var(--dur-fast)] placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive aria-invalid:outline-destructive data-[state=loading]:cursor-progress data-[state=success]:border-[var(--success)] md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
