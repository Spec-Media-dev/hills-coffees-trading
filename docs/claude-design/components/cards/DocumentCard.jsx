import React from 'react';

export function DocumentCard({ name, kind, size, uploadedOn, status, icon, actions, style, ...rest }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', boxShadow: 'var(--shadow-xs)', ...style }} {...rest}>
      <span style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 'var(--radius-sm)', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{[kind, size, uploadedOn].filter(Boolean).join(' · ')}</span>
      </div>
      {status}
      {actions && <div style={{ display: 'flex', gap: 'var(--space-2)' }}>{actions}</div>}
    </div>
  );
}
