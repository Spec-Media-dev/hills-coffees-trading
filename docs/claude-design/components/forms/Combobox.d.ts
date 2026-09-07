import * as React from 'react';

export interface ComboboxOption { value: string; label: string; meta?: string }
export interface ComboboxProps {
  options?: Array<ComboboxOption | string>;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  emptyText?: string;
  style?: React.CSSProperties;
}
export declare function Combobox(props: ComboboxProps): JSX.Element;
