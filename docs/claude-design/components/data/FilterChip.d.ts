import * as React from 'react';

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  count?: number;
  selected?: boolean;
  onToggle?: () => void;
  /** Renders a dismiss affordance on the selected chip. */
  onRemove?: () => void;
  icon?: React.ReactNode;
}
export declare function FilterChip(props: FilterChipProps): JSX.Element;
