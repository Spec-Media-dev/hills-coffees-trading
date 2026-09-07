import * as React from 'react';

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  /** Leading count copy, e.g. "Showing 1–20 of 148 listings". */
  totalLabel?: string;
}
export declare function Pagination(props: PaginationProps): JSX.Element;
