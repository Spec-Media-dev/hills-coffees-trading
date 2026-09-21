import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionIntroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  tone?: "dark" | "light";
  align?: "start" | "center" | "split";
  className?: string;
};

/**
 * SectionIntro — Standardized section intro header across public routes (HILLS_DESIGN_PLAN.md §10).
 * Server Component: semantic eyebrow, H2 title, body lead, and optional contextual action.
 */
export function SectionIntro({
  eyebrow,
  title,
  lead,
  action,
  tone = "light",
  align = "start",
  className,
}: SectionIntroProps) {
  const isDark = tone === "dark";

  if (align === "split") {
    return (
      <div
        className={cn(
          "flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between",
          className
        )}
      >
        <div className="flex max-w-[48rem] flex-col gap-3">
          {eyebrow && (
            <span
              className={cn(
                "hc-type-label",
                isDark ? "text-[var(--hc-accent)]" : "text-[var(--hc-sage)]"
              )}
            >
              {eyebrow}
            </span>
          )}
          <h2 className="hc-type-h2 text-balance">{title}</h2>
          {lead && (
            <p
              className={cn(
                "hc-type-body-lg max-w-[56ch] text-pretty",
                isDark
                  ? "text-[color-mix(in_srgb,var(--hc-bone)_80%,transparent)]"
                  : "text-[var(--hc-sage)]"
              )}
            >
              {lead}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "items-center text-center mx-auto max-w-[48rem]" : "max-w-[46rem]",
        className
      )}
    >
      {eyebrow && (
        <span
          className={cn(
            "hc-type-label",
            isDark ? "text-[var(--hc-accent)]" : "text-[var(--hc-sage)]"
          )}
        >
          {eyebrow}
        </span>
      )}
      <h2 className="hc-type-h2 text-balance">{title}</h2>
      {lead && (
        <p
          className={cn(
            "hc-type-body-lg text-pretty",
            isDark
              ? "text-[color-mix(in_srgb,var(--hc-bone)_80%,transparent)]"
              : "text-[var(--hc-sage)]"
          )}
        >
          {lead}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
