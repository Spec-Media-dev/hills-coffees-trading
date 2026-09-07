import * as React from 'react';

export interface SearchFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  /** Pass <Icon name="search" size={16} />. */
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}
export declare function SearchField(props: SearchFieldProps): JSX.Element;
