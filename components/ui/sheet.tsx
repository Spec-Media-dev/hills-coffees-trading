"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { IconButton } from "@/components/ui/icon-button"
import { Icon } from "@/components/ui/icon"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] transition-opacity duration-[var(--dur-base)] data-ending-style:opacity-0 data-starting-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

const sideClasses: Record<"top" | "bottom" | "inline-start" | "inline-end", string> = {
  top: "inset-x-0 top-0 h-auto border-b data-ending-style:-translate-y-10 data-starting-style:-translate-y-10",
  bottom: "inset-x-0 bottom-0 h-auto border-t data-ending-style:translate-y-10 data-starting-style:translate-y-10",
  "inline-start": "inset-y-0 start-0 h-full w-3/4 sm:max-w-sm border-e data-ending-style:-translate-x-10 data-starting-style:-translate-x-10 rtl:data-ending-style:translate-x-10 rtl:data-starting-style:translate-x-10",
  "inline-end": "inset-y-0 end-0 h-full w-3/4 sm:max-w-sm border-s data-ending-style:translate-x-10 data-starting-style:translate-x-10 rtl:data-ending-style:-translate-x-10 rtl:data-starting-style:-translate-x-10",
}

function SheetContent({
  className,
  children,
  side = "inline-end",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "bottom" | "inline-start" | "inline-end"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 border-border bg-popover bg-clip-padding text-sm text-popover-foreground shadow-[var(--shadow-xl)] outline-none transition-[transform,opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)] data-ending-style:opacity-0 data-starting-style:opacity-0",
          sideClasses[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <IconButton variant="text" aria-label="Close" className="absolute end-3 top-3" />
            }
          >
            <Icon name="x" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
