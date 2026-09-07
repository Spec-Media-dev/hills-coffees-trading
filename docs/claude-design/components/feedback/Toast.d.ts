import * as React from 'react';

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  icon?: React.ReactNode;
}
export declare function Toast(props: ToastProps): JSX.Element;
