import React from 'react';

export function Topbar({ workspaceLabel, subtitle, actions, breadcrumbs, style, ...rest }) {
  return (
    <header style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--gutter-page)', background: 'transparent', ...style }} {...rest}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {workspaceLabel && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{workspaceLabel}</span>}
        {subtitle && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-strong)', fontWeight: 'var(--weight-medium)' }}>{subtitle}</span>}
        {breadcrumbs}
      </div>
      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{actions}</div>
    </header>
  );
}
