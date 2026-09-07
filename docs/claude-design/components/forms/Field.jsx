import React from 'react';

/* Label + hint + error scaffold shared by every form control. */
export function Field({ label, htmlFor, hint, error, required = false, optional = false, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', ...style }} {...rest}>
      {label && (
        <label htmlFor={htmlFor} style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline' }}>
          {label}
          {required && <span style={{ color: 'var(--danger)' }}>*</span>}
          {optional && <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--weight-regular)', fontSize: 'var(--text-meta)' }}>Optional</span>}
        </label>
      )}
      {children}
      {error
        ? <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'center' }}>{error}</span>
        : hint ? <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </div>
  );
}

export const controlBase = (state = {}) => ({
  height: 'var(--control-h)', width: '100%', padding: '0 var(--space-4)',
  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-body)',
  background: state.disabled ? 'var(--sand-100)' : 'var(--surface-card)',
  border: '1px solid ' + (state.error ? 'var(--danger)' : state.focused ? 'var(--primary)' : 'var(--border)'),
  boxShadow: state.focused ? 'var(--shadow-focus)' : 'none',
  borderRadius: 'var(--radius-sm)', outline: 'none', transition: 'var(--transition-control)',
});
