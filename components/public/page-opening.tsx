import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageOpeningProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "forest" | "bone" | "moss";
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

/**
 * PageOpening — Consistent editorial opening banner for public sub-routes (HILLS_DESIGN_PLAN.md §10 & §14).
 * Communicates [data-page-opener="dark"] to the PublicShell and SiteHeader scroll-transition system
 * when rendered in forest or moss tone.
 * Server Component: pure semantic SSR markup.
 */
export function PageOpening({
  eyebrow,
  title,
  lead,
  tone = "forest",
  actions,
  aside,
  className,
}: PageOpeningProps) {
  const isDark = tone === "forest" || tone === "moss";

  return (
    <section
      data-page-opener={isDark ? "dark" : "light"}
      className={cn(
        "relative isolate overflow-hidden pb-[clamp(4.5rem,9vw,8.5rem)]",
        isDark
          ? "-mt-[var(--header-h)] min-h-[min(72svh,48rem)] pt-[calc(var(--header-h)+4rem)]"
          : "pt-[calc(var(--header-h)+2rem)]",
        tone === "forest" && "hc-stage-forest bg-[var(--hc-forest)] text-[#EEE4D1]",
        tone === "moss" && "hc-stage-moss bg-[var(--hc-moss)] text-[#EEE4D1]",
        tone === "bone" && "bg-background text-foreground",
        className
      )}
    >
      {/* Visual richness: subtle ambient radial ember glow & brand arch watermark (PDF Guidelines §05) */}
      {isDark ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_65%_at_85%_15%,rgba(164,72,25,0.18),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 end-8 -z-10 h-96 w-72 rounded-t-[10rem] border border-[rgba(242,245,235,0.06)] bg-gradient-to-b from-transparent to-[rgba(242,245,235,0.02)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(242,245,235,0.15)] to-transparent"
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_85%_20%,rgba(164,72,25,0.06),transparent_70%)]"
        />
      )}

      <div className="hc-public-container-wide">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] lg:items-end">
          <div className="flex max-w-[64rem] flex-col gap-5">
            {eyebrow && (
              <span
                className={cn(
                  "hc-type-label font-semibold tracking-wider",
                  isDark ? "text-[var(--gold-on-dark)]" : "text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]"
                )}
              >
                {eyebrow}
              </span>
            )}
            <h1 className={cn("font-heading text-[clamp(3.5rem,2.5rem+5vw,7.8rem)] font-semibold leading-[0.88] tracking-[-0.04em] text-balance rtl:leading-[1.05] rtl:tracking-normal", isDark && "text-[#EEE4D1]")}>
              {title}
            </h1>
            <span aria-hidden="true" className="h-0.5 w-16 bg-[var(--hc-accent)] opacity-100" />
            {lead && (
              <p
                className={cn(
                  "hc-type-body-lg max-w-[56ch] text-pretty",
                  isDark
                    ? "text-[#EEE4D1]/82 font-normal"
                    : "text-muted-foreground"
                )}
              >
                {lead}
              </p>
            )}
            {actions && <div className="mt-4 flex flex-wrap gap-4">{actions}</div>}
          </div>

          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      </div>
    </section>
  );
}
