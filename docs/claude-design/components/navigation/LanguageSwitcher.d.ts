import * as React from 'react';

export interface LanguageSwitcherProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  lang?: 'en' | 'ar';
  onChange?: (lang: 'en' | 'ar') => void;
  variant?: 'onDark' | 'onLight';
}
export declare function LanguageSwitcher(props: LanguageSwitcherProps): JSX.Element;
