import React from 'react';

export function Breadcrumbs({ items = [], onNavigate, style, ...rest }) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', ...style }} {...rest}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={it.key || it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {last
              ? <span aria-current="page" style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{it.label}</span>
              : <button type="button" onClick={() => onNavigate && onNavigate(it.key)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{it.label}</button>}
            {!last && <span aria-hidden="true" style={{ color: 'var(--border-strong)', fontSize: 'var(--text-meta)' }}>/</span>}
          </span>
        );
      })}
    </nav>
  );
}
