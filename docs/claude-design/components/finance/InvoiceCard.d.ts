import * as React from 'react';

export interface InvoiceLine { label: string; value: string }
export interface InvoiceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  number: string;
  kind?: 'Proforma invoice' | 'Final invoice' | 'Tax invoice' | string;
  issuedOn?: string;
  dueOn?: string;
  amount: string;
  currency?: string;
  status?: React.ReactNode;
  /** Subtotal / fees / VAT breakdown — VAT display is a pending business decision, keep it switchable. */
  lines?: InvoiceLine[];
  /** Payment reference and bank details, rendered monospaced. */
  instructions?: string;
  actions?: React.ReactNode;
}
export declare function InvoiceCard(props: InvoiceCardProps): JSX.Element;
