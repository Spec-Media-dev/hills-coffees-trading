import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PublicButtonVariant = "accent" | "sprout" | "forest" | "outline";

export type PublicButtonProps = {
  variant?: PublicButtonVariant;
  href?: string;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "children">;

const VARIANT_CLASSES: Record<PublicButtonVariant, string> = {
  accent: "hc-btn-accent",
  sprout: "hc-btn-accent",
  forest: "hc-btn-forest",
  outline: "hc-btn-outline",
};

/**
 * PublicButton — Standardized Cultivated Precision button and link styling (HILLS_DESIGN_PLAN.md §10).
 * Server Component: renders semantic `<Link>` when `href` is supplied, or `<button>` otherwise.
 */
export function PublicButton({
  variant = "accent",
  href,
  className,
  children,
  ...buttonProps
}: PublicButtonProps) {
  const combinedClass = cn(
    VARIANT_CLASSES[variant],
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
    className
  );

  if (href) {
    return (
      <Link href={href} className={combinedClass}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={combinedClass} {...buttonProps}>
      {children}
    </button>
  );
}
