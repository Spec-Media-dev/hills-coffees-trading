import * as React from 'react';

export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
