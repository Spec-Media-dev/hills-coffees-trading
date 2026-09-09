import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[var(--radius-sm)] bg-[var(--sand-300)] dark:bg-[var(--surface-raised)] motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
