import * as React from 'react';

export interface SelectOption { value: string; label: string }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: Array<SelectOption | string>;
  error?: boolean;
  placeholder?: string;
}
export declare function Select(props: SelectProps): JSX.Element;
