import * as React from 'react';

export interface StateScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: 'unauthorized' | 'suspended' | 'pending' | 'offline' | 'notFound' | 'error';
  /** Overrides the preset copy. */
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Support reference / trace id. */
  reference?: string;
}
export declare function StateScreen(props: StateScreenProps): JSX.Element;
