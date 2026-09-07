import React from 'react';

export function FilterChip({ label, count, selected = false, onToggle, onRemove, icon, style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button type="button" onClick={onToggle} aria-pressed={selected}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', height: 'var(--control-h-sm)', padding: '0 var(--space-4)', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', transition: 'var(--transition-control)', background: selected ? 'var(--primary)' : hovered ? 'var(--sand-200)' : 'var(--surface-card)', color: selected ? 'var(--primary-contrast)' : 'var(--text-strong)', border: '1px solid ' + (selected ? 'var(--primary)' : 'var(--border)'), ...style }} {...rest}>
      {icon}{label}
      {count != null && <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{count}</span>}
      {selected && onRemove && <span onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-hidden="true" style={{ marginInlineStart: 2 }}>✕</span>}
    </button>
  );
}
