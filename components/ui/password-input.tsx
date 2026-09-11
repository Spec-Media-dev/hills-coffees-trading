"use client"

import { forwardRef, useState } from "react"

import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { cn } from "cn"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** aria-label when the value is hidden and the button would reveal it. Defaults to English. */
  showLabel?: string
  /** aria-label when the value is visible and the button would hide it. Defaults to English. */
  hideLabel?: string
}

/**
 * A password field with a show/hide toggle (RUN A UX refinement). Wraps the existing `Input`
 * primitive rather than duplicating its styles — every existing password field in the product
 * (sign-in, sign-up, reset-password confirm) uses this instead of a bare `<Input type="password">`.
 *
 * - Visibility state is PURELY client-side presentation (`useState`) — never sent to the server,
 *   never persisted anywhere.
 * - The toggle is `type="button"` — it cannot submit the form it lives inside.
 * - Positioned with logical properties (`end-*`) so it lands on the correct side in both LTR and
 *   RTL without any direction-specific class.
 * - `autoComplete` is passed through by the caller (`current-password` on sign-in,
 *   `new-password` on sign-up/reset) — the toggle only changes `type`, never `autoComplete`, so
 *   browser password managers keep working normally.
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, showLabel = "Show password", hideLabel = "Hide password", ...props },
  ref
) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pe-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <Icon name={visible ? "eye-off" : "eye"} className="size-4" />
      </button>
    </div>
  )
})

export { PasswordInput }
