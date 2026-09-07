import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: keyof JSX.IntrinsicElements;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Adds hover lift + border darkening for clickable cards. */
  interactive?: boolean;
  elevated?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;
