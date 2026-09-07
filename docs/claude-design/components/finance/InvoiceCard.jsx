import React from 'react';

export function InvoiceCard({ number, kind = 'Proforma invoice', issuedOn, dueOn, amount, currency = 'USD', status, lines = [], instructions, actions, style, ...rest }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)', ...style }} {...rest}>
      <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{kind}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{number}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{[issuedOn && 'Issued ' + issuedOn, dueOn && 'Due ' + dueOn].filter(Boolean).join(' · ')}</span>
        </div>
        <span style={{ marginInlineStart: 'auto' }}>{status}</span>
      </div>
      {lines.length > 0 && (
        <div style={{ padding: 'var(--space-4) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {lines.map((l) => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums' }}>{l.value}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: 'var(--space-5) var(--space-6)', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>Total due</span>
        <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--font-display)', fontSize: '1.625rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{currency} {amount}</span>
      </div>
      {instructions && (
        <div style={{ padding: 'var(--space-5) var(--space-6)', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Bank transfer instructions</span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', color: 'var(--text-body)', lineHeight: 'var(--lh-relaxed)', whiteSpace: 'pre-line' }}>{instructions}</div>
        </div>
      )}
      {actions && <div style={{ padding: 'var(--space-5) var(--space-6)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}
