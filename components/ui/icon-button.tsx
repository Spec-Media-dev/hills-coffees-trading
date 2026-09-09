import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "cn"

type IconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  "aria-label": string
  children?: React.ReactNode
  size?: "sm" | "default" | "lg"
}

const iconButtonSizes = {
  sm: "size-9 p-0",
  default: "size-11 p-0",
  lg: "size-[3.25rem] p-0",
} as const

function IconButton({ className, size = "default", ...props }: IconButtonProps) {
  return (
    <Button
      data-slot="icon-button"
      size={size}
      className={cn(iconButtonSizes[size], className)}
      {...props}
    />
  )
}

export { IconButton }
