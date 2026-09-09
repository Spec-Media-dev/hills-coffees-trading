"use client"

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type DataTableColumn<Row> = {
  id: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  mobileLabel?: ReactNode
  hideOnTablet?: boolean
  sortable?: boolean
}

type DataTableProps<Row> = {
  rows: readonly Row[]
  columns: readonly DataTableColumn<Row>[]
  getRowKey: (row: Row) => string
  emptyState: ReactNode
  loading?: boolean
  loadingRows?: number
  sortColumn?: string
  sortDirection?: "asc" | "desc"
  onSort?: (columnId: string) => void
  renderActions?: (row: Row) => ReactNode
  pagination?: ReactNode
  filterAction?: ReactNode
}

function DataTable<Row>({
  rows,
  columns,
  getRowKey,
  emptyState,
  loading = false,
  loadingRows = 3,
  sortColumn,
  sortDirection,
  onSort,
  renderActions,
  pagination,
  filterAction,
}: DataTableProps<Row>) {
  if (!loading && rows.length === 0) {
    return <div data-slot="data-table-empty">{emptyState}</div>
  }

  return (
    <div data-slot="data-table" className="min-w-0 space-y-4">
      {filterAction ? <div className="flex justify-end md:hidden">{filterAction}</div> : null}

      <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className={column.hideOnTablet ? "hidden lg:table-cell" : undefined}>
                  {column.sortable && onSort ? (
                    <Button variant="text" className="-ms-3" onClick={() => onSort(column.id)} aria-label={`Sort by ${String(column.header)}`}>
                      {column.header}
                      {sortColumn === column.id ? <Icon name={sortDirection === "desc" ? "arrow-down" : "arrow-up"} /> : null}
                    </Button>
                  ) : column.header}
                </TableHead>
              ))}
              {renderActions ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                  <TableRow key={`loading-${rowIndex}`} aria-hidden="true">
                    {columns.map((column) => <TableCell key={column.id} className={column.hideOnTablet ? "hidden lg:table-cell" : undefined}><Skeleton className="h-5 w-full" /></TableCell>)}
                    {renderActions ? <TableCell><Skeleton className="ms-auto h-11 w-11" /></TableCell> : null}
                  </TableRow>
                ))
              : rows.map((row) => (
                  <TableRow key={getRowKey(row)}>
                    {columns.map((column) => <TableCell key={column.id} className={column.hideOnTablet ? "hidden lg:table-cell" : undefined}>{column.cell(row)}</TableCell>)}
                    {renderActions ? <TableCell className="text-end">{renderActions(row)}</TableCell> : null}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid min-w-0 gap-3 md:hidden">
        {loading
          ? Array.from({ length: loadingRows }, (_, rowIndex) => <Skeleton key={`mobile-loading-${rowIndex}`} className="h-36 w-full rounded-[var(--radius-lg)]" />)
          : rows.map((row) => (
              <article key={getRowKey(row)} className="min-w-0 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]">
                <dl className="grid min-w-0 gap-3">
                  {columns.map((column) => (
                    <div key={column.id} className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
                      <dt className="hc-meta text-muted-foreground">{column.mobileLabel ?? column.header}</dt>
                      <dd className="min-w-0 break-words text-end text-sm text-foreground">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
                {renderActions ? <div className="mt-4 flex justify-end border-t border-border pt-3">{renderActions(row)}</div> : null}
              </article>
            ))}
      </div>

      {pagination ? <div className="flex justify-end">{pagination}</div> : null}
    </div>
  )
}

export { DataTable }
