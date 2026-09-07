import * as React from 'react';

export interface PaymentProofCardProps extends React.HTMLAttributes<HTMLDivElement> {
  fileName: string;
  uploadedOn?: string;
  uploadedBy?: string;
  amount?: string;
  method?: string;
  /** Transfer reference finance matches against. */
  reference?: string;
  status?: React.ReactNode;
  thumbnailSrc?: string;
  note?: string;
  /** Admin verify/reject or buyer replace actions. */
  actions?: React.ReactNode;
}
export declare function PaymentProofCard(props: PaymentProofCardProps): JSX.Element;
