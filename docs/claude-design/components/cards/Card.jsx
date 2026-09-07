import React from 'react';

/* Base surface for every panel: white card, 1px warm border, 14px radius, soft warm shadow. */
export function Card({ as = 'div', padding = 'md', interactive = false, elevated = false, header, footer, children, style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  const Tag = as;
  const pad = { none: 0, sm: 'var(--space-4)', md: 'var(--space-5)', lg: 'var(--space-6)' }[padding] ?? 'var(--space-5)';
  return (
    <Tag onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: 'var(--surface-card)', border: '1px solid ' + (interactive && hovered ? 'var(--border-strong)' : 'var(--border)'), borderRadius: 'var(--radius-lg)', boxShadow: elevated ? 'var(--shadow-md)' : interactive && hovered ? 'var(--shadow-md)' : 'var(--shadow-xs)', transform: interactive && hovered ? 'translateY(-2px)' : 'none', transition: 'var(--transition-control)', overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }} {...rest}>
      {header && <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>{header}</div>}
      <div style={{ padding: pad, flex: 1, minWidth: 0 }}>{children}</div>
      {footer && <div style={{ padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>{footer}</div>}
    </Tag>
  );
}
