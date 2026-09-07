import React from 'react';

export function OrderCard({ reference, date, counterparty, counterpartyLabel = 'Seller', items, amount, status, action, onOpen, style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <article onClick={onOpen} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: 'var(--surface-card)', border: '1px solid ' + (hovered ? 'var(--border-strong)' : 'var(--border)'), borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', cursor: onOpen ? 'pointer' : 'default', boxShadow: 'var(--shadow-xs)', transition: 'var(--transition-control)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{reference}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{date}</span>
        </div>
        <span style={{ marginInlineStart: 'auto' }}>{status}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-4)' }}>
        {[[counterpartyLabel, counterparty], ['Items', items], ['Total', amount]].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
      </div>
      {action && <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>{action}</div>}
    </article>
  );
}
