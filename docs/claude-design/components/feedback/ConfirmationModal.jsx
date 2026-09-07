import React from 'react';
import { Dialog } from './Dialog.jsx';
import { Button } from '../buttons/Button.jsx';

export function ConfirmationModal({ open = false, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', consequence, loading = false, ...rest }) {
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={title} description={message}
      footer={<>
        <Button variant="text" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'destructive' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>} {...rest}>
      {consequence && (
        <div style={{ background: tone === 'danger' ? 'var(--danger-surface)' : 'var(--surface-subtle)', border: '1px solid ' + (tone === 'danger' ? 'color-mix(in oklab, var(--danger) 25%, transparent)' : 'var(--border)'), borderRadius: 'var(--radius-sm)', padding: 'var(--space-4)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: tone === 'danger' ? 'var(--danger)' : 'var(--text-body)' }}>
          {consequence}
        </div>
      )}
    </Dialog>
  );
}
