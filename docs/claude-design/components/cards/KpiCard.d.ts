import * as React from 'react';

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: string;
  /** Change copy, e.g. "+12 this week". */
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  hint?: string;
  /** Use inside the dark operations shell. */
  onDark?: boolean;
}
export declare function KpiCard(props: KpiCardProps): JSX.Element;
