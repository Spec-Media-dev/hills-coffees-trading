import React from 'react';

export function Timeline({ items = [], style, ...rest }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', ...style }} {...rest}>
      {items.map((it, i) => {
        const state = it.state || 'done';
        const color = { done: 'var(--success)', current: 'var(--accent)', todo: 'var(--border-strong)', error: 'var(--danger)' }[state];
        const last = i === items.length - 1;
        return (
          <li key={it.key || it.label} style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: state === 'todo' ? 'var(--surface-card)' : color, border: '2px solid ' + color, marginTop: 5 }} />
              {!last && <span style={{ width: 2, flex: 1, minHeight: 34, background: state === 'todo' ? 'var(--sand-300)' : 'color-mix(in oklab, ' + color + ' 40%, transparent)' }} />}
            </div>
            <div style={{ paddingBottom: last ? 0 : 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: state === 'todo' ? 'var(--text-muted)' : 'var(--text-strong)' }}>{it.label}</span>
              {it.timestamp && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{it.timestamp}</span>}
              {it.description && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{it.description}</span>}
              {it.meta && <span style={{ marginTop: 'var(--space-2)' }}>{it.meta}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
