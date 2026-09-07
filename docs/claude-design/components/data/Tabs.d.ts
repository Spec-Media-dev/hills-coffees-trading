import * as React from 'react';

export interface TabItem { value: string; label: string; count?: number }
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs?: Array<TabItem | string>;
  value?: string;
  onChange?: (value: string) => void;
  /** underline for page-level sections, pill for in-panel filters. */
  variant?: 'underline' | 'pill';
}
export declare function Tabs(props: TabsProps): JSX.Element;
