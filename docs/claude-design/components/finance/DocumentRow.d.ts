import * as React from 'react';

export interface DocumentRowProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  kind?: string;
  issuedOn?: string;
  amount?: string;
  status?: React.ReactNode;
  icon?: React.ReactNode;
  onDownload?: () => void;
  onPreview?: () => void;
  downloadLabel?: string;
  previewLabel?: string;
}
export declare function DocumentRow(props: DocumentRowProps): JSX.Element;
