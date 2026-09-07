import * as React from 'react';

export interface TopbarProps extends React.HTMLAttributes<HTMLElement> {
  /** Uppercase workspace eyebrow, e.g. "ADMIN WORKSPACE". */
  workspaceLabel?: string;
  /** Signed-in identity or context line. */
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
}
export declare function Topbar(props: TopbarProps): JSX.Element;
