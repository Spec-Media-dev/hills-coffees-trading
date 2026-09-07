import * as React from 'react';

export interface InlineAlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'highlight';
  title?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}
export declare function InlineAlert(props: InlineAlertProps): JSX.Element;
