import * as React from 'react';

export interface KybCardProps extends React.HTMLAttributes<HTMLDivElement> {
  companyName: string;
  role?: 'Buyer' | 'Seller';
  status?: React.ReactNode;
  submittedOn?: string;
  /** 0–100 completion of the application wizard. */
  progress?: number;
  /** Exactly what the reviewer still needs — never a vague "more info". */
  missingItems?: string[];
  expiresOn?: string;
  action?: React.ReactNode;
}
export declare function KybCard(props: KybCardProps): JSX.Element;
