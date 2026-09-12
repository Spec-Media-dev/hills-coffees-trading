"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/locale-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

/**
 * EN ⇄ العربية control (Phase 5.5, UIF-017 — contract §12).
 *
 * IT SHOWS THE LANGUAGE YOU WILL GET, NOT THE ONE YOU ARE IN — the design system's explicit rule for
 * this control. In English it reads "AR"; in Arabic it reads "EN".
 *
 * The name comes from the provider's snapshot, so the server and the first client render agree and
 * the true name arrives as soon as React reads the applied locale off the document. The control is
 * never unnamed and never mismatches on hydration.
 *
 * The short label is `dir="ltr"` because "AR"/"EN" are Latin language codes: like numbers, currency
 * and reference codes, they stay LTR inside an RTL layout (contract §12).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, toggleLocale, t } = useLocale();
  const { resolvedTheme } = useTheme();
  const labels = t.controls;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggleLocale}
      aria-label={labels.languageSwitcher}
      title={labels.languageSwitcher}
      lang={locale === "ar" ? "en" : "ar"}
      style={{ color: resolvedTheme === "dark" ? "var(--sidebar-foreground)" : "var(--foreground)" }}
      className={cn(
        "hc-language-switcher rounded-[var(--radius-pill)] px-4 text-[length:var(--text-meta)] tracking-[0.06em]",
        className,
      )}
    >
      <span dir="ltr">{labels.languageSwitcherShort}</span>
    </Button>
  );
}
