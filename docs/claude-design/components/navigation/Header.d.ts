import * as React from 'react';

export interface HeaderLink { key: string; label: string }

export interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  logoSrc?: string;
  links?: HeaderLink[];
  activeKey?: string;
  onNavigate?: (key: string) => void;
  /** Right-hand slot: language, theme, Sign in, Apply as seller. */
  actions?: React.ReactNode;
  /** Sits transparent over the hero image with a blur panel. */
  transparent?: boolean;
  onOpenMenu?: () => void;
}
export declare function Header(props: HeaderProps): JSX.Element;
