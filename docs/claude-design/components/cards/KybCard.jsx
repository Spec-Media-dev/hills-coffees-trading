import React from 'react';

export function KybCard({ companyName, role = 'Buyer', status, submittedOn, progress, missingItems = [], expiresOn, action, style, ...rest }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', boxShadow: 'var(--shadow-xs)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{role} verification</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{companyName}</span>
          {submittedOn && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>Submitted {submittedOn}</span>}
        </div>
        <span style={{ marginInlineStart: 'auto' }}>{status}</span>
      </div>
      {progress != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>
            <span>Application progress</span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--sand-300)', overflow: 'hidden' }}>
            <div style={{ width: progress + '%', height: '100%', background: 'var(--accent)', transition: 'width var(--dur-slow) var(--ease-out)' }} />
          </div>
        </div>
      )}
      {missingItems.length > 0 && (
        <div style={{ background: 'var(--warning-surface)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-bold)', color: 'var(--accent-text)' }}>Still required</span>
          <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {missingItems.map((m) => <li key={m} style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-body)' }}>{m}</li>)}
          </ul>
        </div>
      )}
      {expiresOn && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>Documents expire {expiresOn}</span>}
      {action && <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>{action}</div>}
    </div>
  );
}
