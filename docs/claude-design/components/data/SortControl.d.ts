import * as React from 'react';

export interface SortOption { value: string; label: string }
export interface SortControlProps extends React.HTMLAttributes<HTMLDivElement> {
  options?: Array<SortOption | string>;
  value?: string;
  direction?: 'asc' | 'desc';
  onChange?: (value: string) => void;
  onDirectionChange?: (direction: 'asc' | 'desc') => void;
}
export declare function SortControl(props: SortControlProps): JSX.Element;
