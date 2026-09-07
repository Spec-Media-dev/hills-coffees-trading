import React from 'react';

export function Tabs({ tabs = [], value, onChange, variant = 'underline', style, ...rest }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: variant === 'pill' ? 'var(--space-2)' : 'var(--space-6)', borderBottom: variant === 'underline' ? '1px solid var(--border)' : 'none', overflowX: 'auto', ...style }} {...rest}>
      {tabs.map((t) => {
        const key = typeof t === 'string' ? t : t.value;
        const label = typeof t === 'string' ? t : t.label;
        const count = typeof t === 'string' ? undefined : t.count;
        const active = key === value;
        return (
          <button key={key} role="tab" aria-selected={active} onClick={() => onChange && onChange(key)}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', border: variant === 'pill' ? '1px solid ' + (active ? 'var(--primary)' : 'var(--border)') : 'none', background: variant === 'pill' ? (active ? 'var(--primary)' : 'var(--surface-card)') : 'transparent', color: variant === 'pill' ? (active ? 'var(--primary-contrast)' : 'var(--text-muted)') : (active ? 'var(--text-strong)' : 'var(--text-muted)'), padding: variant === 'pill' ? '0 var(--space-4)' : '0 0 var(--space-3)', height: variant === 'pill' ? 'var(--control-h-sm)' : 'auto', borderRadius: variant === 'pill' ? 'var(--radius-pill)' : 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'var(--transition-control)' }}>
            {label}
            {count != null && <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-micro)', padding: '2px 7px', borderRadius: 999, background: active && variant === 'pill' ? 'rgba(255,255,255,.18)' : 'var(--sand-200)', color: active && variant === 'pill' ? 'inherit' : 'var(--text-muted)' }}>{count}</span>}
            {variant === 'underline' && active && <span aria-hidden="true" style={{ position: 'absolute', insetInline: 0, bottom: -1, height: 2, background: 'var(--accent)' }} />}
          </button>
        );
      })}
    </div>
  );
}
