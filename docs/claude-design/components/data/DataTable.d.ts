import * as React from 'react';

export interface DataTableColumn<Row = any> {
  key: string;
  header: string;
  align?: 'start' | 'center' | 'end';
  numeric?: boolean;
  nowrap?: boolean;
  render?: (row: Row) => React.ReactNode;
}

export interface DataTableProps<Row = any> extends React.HTMLAttributes<HTMLDivElement> {
  columns?: DataTableColumn<Row>[];
  rows?: Row[];
  selectable?: boolean;
  selected?: Array<string | number>;
  onSelect?: (id: string | number, checked: boolean) => void;
  onRowClick?: (row: Row) => void;
  /** Rendered instead of the table when rows is empty. */
  emptyState?: React.ReactNode;
  dense?: boolean;
  /** Set false to keep the table layout on narrow viewports. */
  responsive?: boolean;
}
export declare function DataTable<Row = any>(props: DataTableProps<Row>): JSX.Element;
