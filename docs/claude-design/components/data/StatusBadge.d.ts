import * as React from 'react';

export type HillsStatus =
  | 'draft' | 'quoted' | 'submitted' | 'review' | 'moreInfo'
  | 'paymentPending' | 'paid' | 'processing' | 'reserved' | 'picking'
  | 'dispatched' | 'inTransit' | 'delivered' | 'completed'
  | 'live' | 'approved' | 'sold'
  | 'cancelled' | 'refunded' | 'failed' | 'rejected' | 'suspended' | 'disputed';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: HillsStatus;
  /** Override the default copy (e.g. localised Arabic label). */
  label?: string;
  size?: 'sm' | 'md';
}
export declare function StatusBadge(props: StatusBadgeProps): JSX.Element;
