import React from 'react';

const TONES = {
  info: ['var(--info)', 'var(--info-surface)'],
  success: ['var(--success)', 'var(--success-surface)'],
  warning: ['var(--warning)', 'var(--warning-surface)'],
  danger: ['var(--danger)', 'var(--danger-surface)'],
  highlight: ['var(--highlight)', 'var(--highlight-surface)'],
};

export function InlineAlert({ tone = 'info', title, children, action, icon, style, ...rest }) {
  const [color, surface] = TONES[tone] || TONES.info;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', background: surface, border: '1px solid color-mix(in oklab, ' + color + ' 26%, transparent)', borderRadius: 'var(--radius-md)', ...style }} {...rest}>
      {icon && <span style={{ color, display: 'inline-flex', flex: '0 0 auto', marginTop: 2 }}>{icon}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0, flex: 1 }}>
        {title && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{title}</span>}
        {children && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-body)', lineHeight: 'var(--lh-snug)' }}>{children}</span>}
        {action && <span style={{ marginTop: 'var(--space-1)' }}>{action}</span>}
      </div>
    </div>
  );
}
