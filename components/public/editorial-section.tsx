import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EditorialSectionTone = "forest" | "moss" | "bone" | "white";
export type EditorialSectionContainer = "default" | "wide" | "full";

export type EditorialSectionProps = {
  tone?: EditorialSectionTone;
  container?: EditorialSectionContainer;
  className?: string;
  containerClassName?: string;
  id?: string;
  "data-page-opener"?: "dark" | "light";
  children: ReactNode;
};

const TONE_CLASSES: Record<EditorialSectionTone, string> = {
  forest: "hc-stage-forest bg-[var(--hc-forest)] text-[var(--hc-bone)]",
  moss: "hc-stage-moss bg-[var(--hc-moss)] text-[var(--hc-bone)]",
  bone: "hc-stage-bone bg-[var(--hc-bone)] text-[var(--hc-olive)]",
  white: "hc-stage-white bg-[var(--hc-white)] text-[var(--hc-olive)]",
};

const CONTAINER_CLASSES: Record<EditorialSectionContainer, string> = {
  default: "hc-public-container",
  wide: "hc-public-container-wide",
  full: "w-full",
};

/**
 * EditorialSection — Core layout primitive for Cultivated Precision redesign (HILLS_DESIGN_PLAN.md §10).
 * Server Component: pure semantic structure with controlled tone and spacing.
 */
export function EditorialSection({
  tone = "bone",
  container = "default",
  className,
  containerClassName,
  id,
  "data-page-opener": pageOpener,
  children,
}: EditorialSectionProps) {
  return (
    <section
      id={id}
      data-page-opener={pageOpener}
      className={cn(
        "relative py-[var(--hc-section-y)] transition-colors duration-[var(--dur-base)]",
        TONE_CLASSES[tone],
        className
      )}
    >
      <div className={cn(CONTAINER_CLASSES[container], containerClassName)}>
        {children}
      </div>
    </section>
  );
}
