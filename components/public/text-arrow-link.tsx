import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type TextArrowLinkProps = {
  href: string;
  children: ReactNode;
  tone?: "accent" | "burnt" | "sprout" | "bone" | "olive" | "current";
  className?: string;
  ariaLabel?: string;
};

const TONE_CLASSES = {
  accent: "text-[var(--hc-accent)] decoration-[var(--hc-accent)]",
  burnt: "text-[var(--hc-accent)] decoration-[var(--hc-accent)]",
  sprout: "text-[var(--hc-accent)] decoration-[var(--hc-accent)]",
  bone: "text-[var(--hc-bone)] decoration-[color-mix(in_srgb,var(--hc-bone)_50%,transparent)]",
  olive: "text-[var(--hc-olive)] decoration-[var(--hc-sage)]",
  current: "text-inherit decoration-current",
};

/**
 * TextArrowLink — Accessible directional text link treatment (HILLS_DESIGN_PLAN.md §10 & §11).
 * Server Component: provides 44px min hit target, underline offset, and directional icon translation.
 */
export function TextArrowLink({
  href,
  children,
  tone = "current",
  className,
  ariaLabel,
}: TextArrowLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        "group/link inline-flex min-h-11 shrink-0 items-center gap-2 text-[length:var(--text-small)] font-semibold underline-offset-4 hover:underline focus-visible:rounded-[var(--radius-xs)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        TONE_CLASSES[tone],
        className
      )}
    >
      <span>{children}</span>
      <Icon
        name="arrow-right"
        data-directional-icon="true"
        className="size-4 shrink-0 transition-transform duration-[var(--dur-fast)] group-hover/link:translate-x-1 rtl:group-hover/link:-translate-x-1"
      />
    </Link>
  );
}
