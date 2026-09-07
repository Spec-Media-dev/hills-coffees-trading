import * as React from 'react';

export interface CountryFieldProps {
  /** Defaults to the trading countries Hills operates in. */
  countries?: string[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function CountryField(props: CountryFieldProps): JSX.Element;
