import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EvidenceStageProps = {
  step: string | number;
  title: ReactNode;
  description: ReactNode;
  media?: ReactNode;
  tone?: "dark" | "light";
  className?: string;
};

/**
 * EvidenceStage — Reusable numbered commercial evidence / process card (HILLS_DESIGN_PLAN.md §10).
 * Server Component: clean typography-led structure with hairlines and subtle elevation.
 */
export function EvidenceStage({
  step,
  title,
  description,
  media,
  tone = "light",
  className,
}: EvidenceStageProps) {
  const isDark = tone === "dark";
  const formattedStep = typeof step === "number" ? String(step).padStart(2, "0") : step;

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-[var(--hc-radius-panel)] p-6 sm:p-8 transition-colors duration-[var(--dur-fast)]",
        isDark
          ? "bg-[color-mix(in_srgb,var(--hc-forest)_85%,transparent)] border border-[color-mix(in_srgb,var(--hc-bone)_12%,transparent)] text-[var(--hc-bone)]"
          : "bg-[var(--hc-white)] border border-[var(--hc-mist-green)] text-[var(--hc-olive)] shadow-[var(--hc-shadow-subtle)]",
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-4">
          <span
            className={cn(
              "font-mono text-sm font-semibold tracking-wider",
              isDark ? "text-[var(--hc-accent)]" : "text-[var(--hc-sage)]"
            )}
          >
            {formattedStep}
          </span>
        </div>

        <h3 className="hc-type-h3 mt-4 text-balance font-semibold">
          {title}
        </h3>

        <p
          className={cn(
            "hc-type-body mt-3 text-pretty",
            isDark
              ? "text-[color-mix(in_srgb,var(--hc-bone)_75%,transparent)]"
              : "text-[var(--hc-sage)]"
          )}
        >
          {description}
        </p>
      </div>

      {media && <div className="mt-6">{media}</div>}
    </div>
  );
}
