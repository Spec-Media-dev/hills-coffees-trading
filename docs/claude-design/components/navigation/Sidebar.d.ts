import * as React from 'react';

export interface SidebarItem {
  key: string;
  label: string;
  /** Secondary line, e.g. "Types, processing, certifications, tags". */
  description?: string;
  icon?: React.ReactNode;
  badge?: number | string;
}
export interface SidebarGroup { label: string; items: SidebarItem[] }

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  logoSrc?: string;
  groups?: SidebarGroup[];
  activeKey?: string;
  onNavigate?: (key: string) => void;
  /** Pinned note at the bottom, e.g. "Administrator access is verified on the server." */
  footerNote?: string;
  collapsed?: boolean;
}
export declare function Sidebar(props: SidebarProps): JSX.Element;
