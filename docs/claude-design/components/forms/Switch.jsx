import React from 'react';

export function Switch({ checked = false, onChange, label, description, disabled = false, style, ...rest }) {
  return (
    <label style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', justifyContent: 'space-between', minHeight: 'var(--touch-min)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, ...style }}>
      {(label || description) && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>{label}</span>
          {description && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{description}</span>}
        </span>
      )}
      <span role="switch" aria-checked={checked} style={{ width: 44, height: 26, flex: '0 0 auto', borderRadius: 999, background: checked ? 'var(--primary)' : 'var(--sand-400)', padding: 3, display: 'flex', alignItems: 'center', transition: 'var(--transition-control)' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', transform: checked ? 'translateX(18px)' : 'translateX(0)', transition: 'transform var(--dur-base) var(--ease-standard)' }} />
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
    </label>
  );
}
