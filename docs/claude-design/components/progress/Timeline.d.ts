import * as React from 'react';

export interface TimelineItem {
  key?: string;
  label: string;
  timestamp?: string;
  description?: string;
  /** Slot for a badge, document row or actor chip. */
  meta?: React.ReactNode;
  state?: 'done' | 'current' | 'todo' | 'error';
}
export interface TimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  items?: TimelineItem[];
}
export declare function Timeline(props: TimelineProps): JSX.Element;
