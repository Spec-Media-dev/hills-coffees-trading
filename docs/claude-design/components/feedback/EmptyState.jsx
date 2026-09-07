import React from 'react';

export function EmptyState({ icon, title, message, action, secondaryAction, compact = false, style, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--space-4)', padding: compact ? 'var(--space-8)' : 'var(--space-16) var(--space-8)', background: 'var(--surface-card)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)', ...style }} {...rest}>
      {icon && <span style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'var(--surface-subtle)', color: 'var(--primary)', display: 'grid', placeItems: 'center' }}>{icon}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: 420 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{title}</span>
        {message && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{message}</span>}
      </div>
      {(action || secondaryAction) && <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>{action}{secondaryAction}</div>}
    </div>
  );
}
