import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex min-w-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap border bg-clip-padding text-sm font-semibold tracking-[0.005em] outline-none select-none after:absolute after:-inset-y-1 after:inset-x-0 transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] active:not-aria-[haspopup]:translate-y-px aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive aria-invalid:outline-destructive data-[state=loading]:cursor-progress data-[state=loading]:opacity-75 data-[state=success]:border-[var(--success)] data-[state=error]:border-destructive motion-reduce:transform-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "border-primary bg-primary text-primary-foreground hover:border-[var(--primary-hover)] hover:bg-[var(--primary-hover)] active:border-[var(--primary-active)] active:bg-[var(--primary-active)]",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),var(--forest-700)_8%)]",
        outline: "border-[var(--border-strong)] bg-transparent text-foreground hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)]",
        text: "border-transparent bg-transparent text-foreground underline-offset-4 hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_7%)] hover:underline",
        accent: "border-[var(--sand-100)] bg-[var(--sand-100)] text-[var(--forest-800)] hover:border-[var(--sand-200)] hover:bg-[var(--sand-200)]",
        destructive:
          "border-destructive bg-destructive text-white hover:bg-[color-mix(in_srgb,var(--destructive),black_12%)]",
      },
      size: {
        sm: "h-9 rounded-[var(--radius-sm)] px-3.5",
        default: "h-11 rounded-[var(--radius-sm)] px-5",
        lg: "h-[3.25rem] rounded-[var(--radius-md)] px-7",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
