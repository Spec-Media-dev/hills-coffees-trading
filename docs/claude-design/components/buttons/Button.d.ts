import * as React from 'react';

/**
 * Hills Coffee action button. Primary is Deep Forest Green; the Golden Ochre
 * "accent" variant is selective and must not be used for every CTA.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'accent' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  /** Renders in the selected (toggled-on) treatment. */
  selected?: boolean;
}
export declare function Button(props: ButtonProps): JSX.Element;
