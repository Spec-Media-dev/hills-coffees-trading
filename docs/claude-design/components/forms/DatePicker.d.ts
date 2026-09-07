import * as React from 'react';

export interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  /** Renders a from–to pair in one control (finance and shipment filters). */
  range?: boolean;
  icon?: React.ReactNode;
}
export declare function DatePicker(props: DatePickerProps): JSX.Element;
