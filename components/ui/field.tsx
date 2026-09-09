import { cloneElement, useId, type ReactElement, type ReactNode } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "cn"

type FieldControlProps = {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

type FieldProps = {
  label: ReactNode
  control: ReactElement<FieldControlProps>
  hint?: ReactNode
  error?: ReactNode
  id?: string
  className?: string
}

function Field({ label, control, hint, error, id, className }: FieldProps) {
  const generatedId = useId()
  const controlId = id ?? `field-${generatedId}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <div data-slot="field" className={cn("group/field flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {hint ? <p id={hintId} className="hc-meta text-muted-foreground">{hint}</p> : null}
      {cloneElement(control, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error),
      })}
      {error ? <p id={errorId} role="alert" className="hc-meta text-destructive">{error}</p> : null}
    </div>
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("grid min-w-0 gap-5 md:grid-cols-2", className)} {...props} />
}

function FieldSection({ className, ...props }: React.ComponentProps<"fieldset">) {
  return <fieldset data-slot="field-section" className={cn("grid min-w-0 gap-5 rounded-[var(--radius-lg)] border border-border p-5", className)} {...props} />
}

function FormActionBar({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="form-action-bar" className={cn("sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 py-4 backdrop-blur-sm", className)} {...props} />
}

export { Field, FieldGroup, FieldSection, FormActionBar }
