import React from 'react';

export function SortControl({ options = [], value, direction = 'desc', onChange, onDirectionChange, style, ...rest }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', ...style }} {...rest}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' }}>Sort</span>
      <select value={value} onChange={(e) => onChange && onChange(e.target.value)}
        style={{ height: 'var(--control-h-sm)', padding: '0 var(--space-3)', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', cursor: 'pointer' }}>
        {options.map((o) => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return <option key={v} value={v}>{l}</option>; })}
      </select>
      <button type="button" onClick={() => onDirectionChange && onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
        aria-label={direction === 'asc' ? 'Ascending' : 'Descending'}
        style={{ width: 'var(--control-h-sm)', height: 'var(--control-h-sm)', display: 'grid', placeItems: 'center', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-strong)', fontSize: 12 }}>
        {direction === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
