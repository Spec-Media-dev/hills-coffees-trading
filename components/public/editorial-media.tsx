import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EditorialMediaAspectRatio = "16/10" | "4/5" | "16/9" | "3/2" | "1/1" | "portrait-hero" | "auto";
export type EditorialMediaScrim = "none" | "bottom" | "forest-heavy" | "forest-light" | "inset";

export type EditorialMediaProps = {
  src: string;
  alt: string;
  aspectRatio?: EditorialMediaAspectRatio;
  scrim?: EditorialMediaScrim;
  priority?: boolean;
  sizes?: string;
  objectPosition?: string;
  className?: string;
  imageClassName?: string;
  children?: ReactNode;
};

const ASPECT_CLASSES: Record<EditorialMediaAspectRatio, string> = {
  "16/10": "aspect-[16/10]",
  "4/5": "aspect-[4/5]",
  "16/9": "aspect-[16/9]",
  "3/2": "aspect-[3/2]",
  "1/1": "aspect-square",
  "portrait-hero": "aspect-[4/5] sm:aspect-[16/10]",
  auto: "h-full w-full",
};

const SCRIM_ELEMENTS: Record<EditorialMediaScrim, ReactNode> = {
  none: null,
  bottom: (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--hc-forest)] via-[color-mix(in_srgb,var(--hc-forest)_40%,transparent)] to-transparent"
    />
  ),
  "forest-heavy": (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--hc-forest)_75%,transparent)]"
    />
  ),
  "forest-light": (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--hc-forest)_35%,transparent)]"
    />
  ),
  inset: (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--hc-forest)_20%,transparent)_0%,color-mix(in_srgb,var(--hc-forest)_78%,transparent)_55%,var(--hc-forest)_100%)]"
    />
  ),
};

/**
 * EditorialMedia — Standardized media wrapper with aspect ratio, reserved space, and scrim control.
 * Follows Cultivated Precision media lock (HILLS_DESIGN_PLAN.md §5 & §7).
 * Server Component: preserves Server Component boundaries without layout shift.
 */
export function EditorialMedia({
  src,
  alt,
  aspectRatio = "16/10",
  scrim = "none",
  priority = false,
  sizes = "(min-width: 1200px) 1200px, 100vw",
  objectPosition = "center",
  className,
  imageClassName,
  children,
}: EditorialMediaProps) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[var(--hc-radius-panel)] bg-[var(--hc-moss)]",
        ASPECT_CLASSES[aspectRatio],
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        style={{ objectPosition }}
        className={cn(
          "object-cover transition-transform duration-700 ease-[var(--ease-out)]",
          imageClassName
        )}
      />
      {SCRIM_ELEMENTS[scrim]}
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  );
}
