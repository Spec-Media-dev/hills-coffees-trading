import * as React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  /** Required — becomes aria-label and tooltip. */
  label: string;
  variant?: 'ghost' | 'outline' | 'solid' | 'onDark';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
