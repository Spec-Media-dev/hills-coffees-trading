import * as React from 'react';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  hint?: string;
  /** When set, replaces the hint and turns the control red. */
  error?: string;
  required?: boolean;
  optional?: boolean;
  children?: React.ReactNode;
}
export declare function Field(props: FieldProps): JSX.Element;
export declare const controlBase: (state?: { focused?: boolean; error?: boolean; disabled?: boolean }) => React.CSSProperties;
