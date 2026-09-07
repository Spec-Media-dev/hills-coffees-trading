import * as React from 'react';

export interface ConfirmationModalProps {
  open?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger for suspend / reject / cancel order. */
  tone?: 'primary' | 'danger';
  /** Spells out what will happen — required for irreversible admin actions. */
  consequence?: string;
  loading?: boolean;
}
export declare function ConfirmationModal(props: ConfirmationModalProps): JSX.Element;
