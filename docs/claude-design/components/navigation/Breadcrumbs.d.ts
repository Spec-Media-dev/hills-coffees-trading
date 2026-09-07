import * as React from 'react';

export interface BreadcrumbItem { key?: string; label: string }
export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items?: BreadcrumbItem[];
  onNavigate?: (key?: string) => void;
}
export declare function Breadcrumbs(props: BreadcrumbsProps): JSX.Element;
