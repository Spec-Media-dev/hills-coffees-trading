import * as React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'text' | 'block' | 'card' | 'circle';
  width?: number | string;
  height?: number | string;
  /** Line count for variant="text". */
  lines?: number;
  radius?: string;
}
export declare function Skeleton(props: SkeletonProps): JSX.Element;
