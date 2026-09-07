import React from 'react';

export function Drawer({ open = false, onClose, title, side = 'end', width = 480, children, footer, style, ...rest }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-drawer)', display: 'flex' }} {...rest}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} />
      <aside style={{ position: 'relative', marginInlineStart: side === 'end' ? 'auto' : 0, width: 'min(' + width + 'px, 92vw)', height: '100%', background: 'var(--surface-page)', borderInlineStart: side === 'end' ? '1px solid var(--border)' : 'none', borderInlineEnd: side === 'start' ? '1px solid var(--border)' : 'none', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'hcdrawer var(--dur-slow) var(--ease-out)', ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 'var(--weight-bold)', margin: 0, color: 'var(--text-strong)' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginInlineStart: 'auto', width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>{children}</div>
        {footer && <div style={{ padding: 'var(--space-5) var(--space-6)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>{footer}</div>}
        <style>{'@keyframes hcdrawer{from{transform:translateX(100%)}}'}</style>
      </aside>
    </div>
  );
}
