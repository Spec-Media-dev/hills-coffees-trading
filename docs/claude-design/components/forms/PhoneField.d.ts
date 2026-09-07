import * as React from 'react';

export interface DialCode { value: string; label: string }
export interface PhoneFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  dialCode?: string;
  onDialCodeChange?: (code: string) => void;
  dialCodes?: DialCode[];
  error?: boolean;
}
export declare function PhoneField(props: PhoneFieldProps): JSX.Element;
