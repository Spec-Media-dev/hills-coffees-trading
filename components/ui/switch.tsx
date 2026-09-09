"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent outline-none transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] after:absolute after:-inset-y-2.5 after:inset-x-0 hover:ring-1 hover:ring-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] active:translate-y-px aria-invalid:border-destructive data-[state=loading]:cursor-progress data-[state=loading]:opacity-75 data-[state=success]:ring-1 data-[state=success]:ring-[var(--success)] data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-[0.45] motion-reduce:transform-none",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none ms-0.5 block size-5 rounded-full bg-background ring-0 transition-transform duration-[var(--dur-fast)] group-data-checked/switch:translate-x-5 rtl:group-data-checked/switch:-translate-x-5 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
