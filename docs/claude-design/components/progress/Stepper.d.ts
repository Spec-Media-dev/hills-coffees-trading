import * as React from 'react';

export interface Step {
  key?: string;
  label: string;
  hint?: string;
  /** Overrides the position-derived state — use 'error' for the step that needs fixing. */
  state?: 'todo' | 'current' | 'done' | 'error';
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps?: Step[];
  current?: number;
  orientation?: 'horizontal' | 'vertical';
  onStepClick?: (index: number) => void;
}
export declare function Stepper(props: StepperProps): JSX.Element;
