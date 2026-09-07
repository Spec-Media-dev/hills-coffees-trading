import * as React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'checked'> {
  label?: React.ReactNode;
  description?: string;
  checked?: boolean;
  /** Partial selection — used by the table header "select all" cell. */
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  error?: boolean;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
