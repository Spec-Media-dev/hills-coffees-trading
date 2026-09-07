import React from 'react';

export function ShipmentCard({ shipmentId, orderReference, status, eta, destination, quantity, carrier, incoterm, actionRequired, onOpen, style, ...rest }) {
  return (
    <article onClick={onOpen} style={{ background: 'var(--surface-card)', border: '1px solid ' + (actionRequired ? 'var(--accent)' : 'var(--border)'), borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', cursor: onOpen ? 'pointer' : 'default', boxShadow: 'var(--shadow-xs)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{shipmentId}</span>
          {orderReference && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>Order {orderReference}</span>}
        </div>
        <span style={{ marginInlineStart: 'auto' }}>{status}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-4)' }}>
        {[['ETA', eta], ['Destination', destination], ['Quantity', quantity], ['Carrier', carrier], ['Incoterm', incoterm]].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{v}</span>
          </div>
        ))}
      </div>
      {actionRequired && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--warning-surface)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: 'var(--accent-text)' }}>
          {actionRequired}
        </div>
      )}
    </article>
  );
}
