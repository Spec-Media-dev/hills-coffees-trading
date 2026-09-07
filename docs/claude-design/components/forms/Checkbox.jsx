import React from 'react';

export function Checkbox({ label, description, checked = false, indeterminate = false, onChange, disabled = false, error = false, style, ...rest }) {
  const on = checked || indeterminate;
  return (
    <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, minHeight: 'var(--touch-min)', ...style }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      <span aria-hidden="true" style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 auto', borderRadius: 'var(--radius-xs)', border: '1.5px solid ' + (error ? 'var(--danger)' : on ? 'var(--primary)' : 'var(--border-strong)'), background: on ? 'var(--primary)' : 'var(--surface-card)', color: 'var(--primary-contrast)', display: 'grid', placeItems: 'center', fontSize: 12, lineHeight: 1, transition: 'var(--transition-control)' }}>
        {indeterminate ? '–' : checked ? '✓' : ''}
      </span>
      {(label || description) && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-strong)', fontWeight: 'var(--weight-medium)' }}>{label}</span>
          {description && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{description}</span>}
        </span>
      )}
    </label>
  );
}
