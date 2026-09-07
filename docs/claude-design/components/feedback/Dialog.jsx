import React from 'react';

export function Dialog({ open = false, onClose, title, description, children, footer, size = 'md', closeLabel = 'Close', style, ...rest }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 420, md: 560, lg: 760 }[size] || 560;
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dialog)', display: 'grid', placeItems: 'center', padding: 'var(--space-5)' }} {...rest}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', backdropFilter: 'blur(2px)', animation: 'hcdfade var(--dur-base) var(--ease-out)' }} />
      <div role="dialog" aria-modal="true" aria-label={title}
        style={{ position: 'relative', width: 'min(100%, ' + width + 'px)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', animation: 'hcdrise var(--dur-slow) var(--ease-out)', ...style }}>
        <div style={{ padding: 'var(--space-6) var(--space-6) var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
            {title && <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{title}</h2>}
            {description && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', margin: 0, lineHeight: 'var(--lh-snug)' }}>{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} style={{ marginInlineStart: 'auto', width: 44, height: 44, flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
        </div>
        {children && <div style={{ padding: '0 var(--space-6) var(--space-6)' }}>{children}</div>}
        {footer && <div style={{ padding: 'var(--space-5) var(--space-6)', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>{footer}</div>}
        <style>{'@keyframes hcdfade{from{opacity:0}}@keyframes hcdrise{from{opacity:0;transform:translateY(12px)}}'}</style>
      </div>
    </div>
  );
}
