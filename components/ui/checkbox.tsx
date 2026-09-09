"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { Icon } from "@/components/ui/icon"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-input bg-[var(--surface-card)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-[var(--dur-fast)] after:absolute after:-inset-3 hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive data-[state=loading]:cursor-progress data-[state=loading]:opacity-75 data-[state=success]:border-[var(--success)] data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground motion-reduce:transform-none dark:bg-input/30",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <Icon name="check" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
