import React from 'react';

export function PaymentProofCard({ fileName, uploadedOn, uploadedBy, amount, method = 'Bank transfer', reference, status, thumbnailSrc, actions, note, style, ...rest }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', display: 'flex', gap: 'var(--space-5)', boxShadow: 'var(--shadow-xs)', flexWrap: 'wrap', ...style }} {...rest}>
      <div style={{ width: 96, height: 120, flex: '0 0 auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-subtle)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {thumbnailSrc
          ? <img src={thumbnailSrc} alt={fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Proof preview</span>}
      </div>
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{fileName}</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{[uploadedOn && 'Uploaded ' + uploadedOn, uploadedBy].filter(Boolean).join(' · ')}</span>
          </div>
          <span style={{ marginInlineStart: 'auto' }}>{status}</span>
        </div>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 'var(--space-3)' }}>
          {[['Amount', amount], ['Method', method], ['Reference', reference]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</dt>
              <dd style={{ margin: 0, fontFamily: k === 'Reference' ? 'var(--font-mono)' : 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
            </div>
          ))}
        </dl>
        {note && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{note}</span>}
        {actions && <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  );
}
