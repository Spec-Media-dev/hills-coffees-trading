import * as React from 'react';

export interface OrderCardProps extends React.HTMLAttributes<HTMLElement> {
  reference: string;
  date?: string;
  counterparty?: string;
  /** "Seller" in the buyer portal, "Buyer" in the seller portal. */
  counterpartyLabel?: string;
  items?: string;
  amount?: string;
  /** StatusBadge slot. */
  status?: React.ReactNode;
  /** Required-action row, e.g. an "Upload payment proof" button. */
  action?: React.ReactNode;
  onOpen?: () => void;
}
export declare function OrderCard(props: OrderCardProps): JSX.Element;
