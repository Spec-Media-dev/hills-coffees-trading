"use client";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { useLocale } from "@/components/locale/locale-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Light/Dark control (Phase 5.5, UIF-016 — contract §11).
 *
 * Placement follows the design system: public header, and later both application topbars.
 *
 * TWO ICONS, ONE BUTTON, ZERO HYDRATION RISK. The glyph is chosen by the `dark:` CSS variant rather
 * than by JavaScript state, so it is already correct at first paint — the pre-paint script has
 * placed `.dark` on `<html>` before the body renders — and the server and client produce identical
 * markup. Rendering the glyph from state instead would either flash the wrong icon or mismatch on
 * hydration.
 *
 * The accessible NAME cannot be swapped by CSS, so it comes from the provider's snapshot: the server
 * and the first client render both name the light-mode action, and React re-renders with the true
 * name the moment it reads the real theme off the document. The control is never unnamed, and no
 * render disagrees with the server.
 *
 * Built on the UIF-A `IconButton` at its default size, so the 44x44 touch target, focus-visible ring,
 * hover and active treatments all come from the converged Hills button — this file adds no control
 * styling of its own. The design system's own ThemeToggle is `--control-h` (44px) for the same
 * reason: the contract's touch minimum applies to header chrome, not only to form controls.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useLocale();

  const label =
    resolvedTheme === "dark" ? t.controls.switchToLight : t.controls.switchToDark;

  return (
    <IconButton
      type="button"
      variant="outline"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn("rounded-[var(--radius-pill)]", className)}
    >
      {/* Moon on light (the theme you would move to); sun on dark. Both ship; CSS picks one. */}
      <Icon name="moon" className="block size-[1.125rem] dark:hidden" />
      <Icon name="sun" className="hidden size-[1.125rem] dark:block" />
    </IconButton>
  );
}
