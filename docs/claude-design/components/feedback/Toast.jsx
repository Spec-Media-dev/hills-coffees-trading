import React from 'react';

const TONES = {
  success: ['var(--success)', 'var(--success-surface)'],
  error: ['var(--danger)', 'var(--danger-surface)'],
  warning: ['var(--warning)', 'var(--warning-surface)'],
  info: ['var(--info)', 'var(--info-surface)'],
};

export function Toast({ tone = 'info', title, message, action, onDismiss, icon, style, ...rest }) {
  const [color, surface] = TONES[tone] || TONES.info;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', minWidth: 300, maxWidth: 420, padding: 'var(--space-4)', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', animation: 'hctoast var(--dur-slow) var(--ease-out)', ...style }} {...rest}>
      <span style={{ width: 32, height: 32, flex: '0 0 auto', borderRadius: 'var(--radius-xs)', background: surface, color, display: 'grid', placeItems: 'center' }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        {title && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{title}</span>}
        {message && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{message}</span>}
        {action && <span style={{ marginTop: 'var(--space-2)' }}>{action}</span>}
      </div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>✕</button>}
      <style>{'@keyframes hctoast{from{opacity:0;transform:translateY(10px)}}'}</style>
    </div>
  );
}
