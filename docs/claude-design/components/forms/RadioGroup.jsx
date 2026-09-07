import React from 'react';

export function RadioGroup({ name, options = [], value, onChange, layout = 'stack', style, ...rest }) {
  return (
    <div role="radiogroup" style={{ display: 'flex', flexDirection: layout === 'row' ? 'row' : 'column', gap: 'var(--space-3)', ...style }} {...rest}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label key={o.value} style={{ flex: layout === 'row' ? 1 : undefined, display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', padding: 'var(--space-4)', minHeight: 'var(--touch-min)', cursor: 'pointer', background: selected ? 'color-mix(in oklab, var(--primary) 6%, var(--surface-card))' : 'var(--surface-card)', border: '1.5px solid ' + (selected ? 'var(--primary)' : 'var(--border)'), borderRadius: 'var(--radius-md)', transition: 'var(--transition-control)' }}>
            <input type="radio" name={name} checked={selected} onChange={() => onChange && onChange(o.value)}
              style={{ appearance: 'none', width: 18, height: 18, marginTop: 2, flex: '0 0 auto', borderRadius: '50%', border: '1.5px solid ' + (selected ? 'var(--primary)' : 'var(--border-strong)'), background: selected ? 'radial-gradient(circle, var(--primary) 45%, var(--surface-card) 48%)' : 'var(--surface-card)', cursor: 'inherit' }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{o.label}</span>
              {o.description && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{o.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
