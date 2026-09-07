import * as React from 'react';

export interface RadioOption { value: string; label: string; description?: string }
export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  options?: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  layout?: 'stack' | 'row';
}
export declare function RadioGroup(props: RadioGroupProps): JSX.Element;
