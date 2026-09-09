import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cn } from "cn"

type PaginationProps = ComponentProps<"nav"> & {
  page: number
  pageCount: number
  onPrevious?: () => void
  onNext?: () => void
}

function Pagination({ page, pageCount, onPrevious, onNext, className, ...props }: PaginationProps) {
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center gap-3", className)} {...props}>
      <Button variant="outline" onClick={onPrevious} disabled={page <= 1}><Icon name="chevron-left" /> Previous</Button>
      <span className="hc-meta" aria-live="polite">Page {page} of {pageCount}</span>
      <Button variant="outline" onClick={onNext} disabled={page >= pageCount}>Next <Icon name="chevron-right" /></Button>
    </nav>
  )
}

export { Pagination }
