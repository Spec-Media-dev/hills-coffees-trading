import * as React from 'react';

export interface DrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  /** Inline edge it slides from — mirrors automatically in RTL. */
  side?: 'start' | 'end';
  width?: number;
  footer?: React.ReactNode;
}
export declare function Drawer(props: DrawerProps): JSX.Element | null;
