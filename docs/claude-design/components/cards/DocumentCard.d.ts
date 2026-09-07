import * as React from 'react';

export interface DocumentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  /** "Trade licence", "Proforma invoice", "Bill of lading"… */
  kind?: string;
  size?: string;
  uploadedOn?: string;
  status?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}
export declare function DocumentCard(props: DocumentCardProps): JSX.Element;
