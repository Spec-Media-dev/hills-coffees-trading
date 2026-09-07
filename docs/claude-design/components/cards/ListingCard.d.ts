import * as React from 'react';

export interface ListingCardProps extends React.HTMLAttributes<HTMLElement> {
  imageSrc?: string;
  title: string;
  origin?: string;
  region?: string;
  grade?: string;
  process?: string;
  harvest?: string;
  /** Available quantity copy, e.g. "320 bags · 60kg". */
  quantity?: string;
  /** Contract price copy, e.g. "USD 4.80 / kg". */
  price?: string;
  /** Hides the price behind the sign-in gate for guests. */
  priceLocked?: boolean;
  seller?: 'hills' | 'verified';
  sellerName?: string;
  /** Slot for a StatusBadge on the media corner. */
  status?: React.ReactNode;
  onOpen?: () => void;
}
export declare function ListingCard(props: ListingCardProps): JSX.Element;
