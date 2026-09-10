import Link from "next/link"
import type { ReactNode } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "cn"

/**
 * Member/Admin page header + breadcrumb system (Phase 5.5, UIF-035 — contract §1, §11).
 *
 * Composes the already-approved `Breadcrumb` primitive (UIF-012) rather than re-implementing
 * separator/mirroring behaviour: `BreadcrumbSeparator`'s default glyph is `chevron-right`, already
 * registered as `directional` in the icon registry, so it flips under `dir="rtl"` through the
 * existing global rule with zero code here.
 *
 * Server Component. `actions` is a slot for caller-supplied controls (a future feature's own
 * buttons); this file renders no business action itself.
 */

export type PageHeaderTrail = { label: ReactNode; href?: string }

export type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  trail?: readonly PageHeaderTrail[]
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, trail, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {trail && trail.length > 0 ? (
        <Breadcrumb>
          <BreadcrumbList>
            {trail.map((crumb, index) => {
              const isLast = index === trail.length - 1
              return (
                <span key={`${crumb.label}-${index}`} className="contents">
                  <BreadcrumbItem>
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast ? <BreadcrumbSeparator /> : null}
                </span>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="hc-heading-3 font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="max-w-[62ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
