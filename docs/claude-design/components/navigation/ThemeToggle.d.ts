import * as React from 'react';

export interface ThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  theme?: 'light' | 'dark';
  onChange?: (theme: 'light' | 'dark') => void;
  variant?: 'onDark' | 'onLight';
}
export declare function ThemeToggle(props: ThemeToggleProps): JSX.Element;
