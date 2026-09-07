import * as React from 'react';

export interface DrawerLink { key: string; label: string; icon?: React.ReactNode }
export interface MobileDrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  links?: DrawerLink[];
  activeKey?: string;
  onNavigate?: (key: string) => void;
  /** Bottom slot for Sign in / Apply actions and the language switch. */
  footer?: React.ReactNode;
  title?: string;
}
export declare function MobileDrawer(props: MobileDrawerProps): JSX.Element;
