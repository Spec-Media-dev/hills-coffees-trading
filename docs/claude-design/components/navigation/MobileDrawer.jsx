import React from 'react';

export function MobileDrawer({ open = false, onClose, links = [], activeKey, onNavigate, footer, title = 'Menu', style, ...rest }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-drawer)', display: 'flex' }} {...rest}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', animation: 'hcfade var(--dur-base) var(--ease-out)' }} />
      <aside style={{ position: 'relative', marginInlineStart: 'auto', width: 'var(--drawer-w)', height: '100%', background: 'var(--surface-page)', borderInlineStart: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'hcslide var(--dur-slow) var(--ease-out)', ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close menu" style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-strong)', fontSize: 18 }}>✕</button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)' }}>
          {links.map((l) => (
            <button key={l.key} type="button" onClick={() => { onNavigate && onNavigate(l.key); onClose && onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 52, padding: '0 var(--space-4)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'start', background: l.key === activeKey ? 'color-mix(in oklab, var(--primary) 8%, transparent)' : 'transparent', color: 'var(--text-strong)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', fontWeight: l.key === activeKey ? 'var(--weight-bold)' : 'var(--weight-medium)' }}>
              {l.icon}{l.label}
            </button>
          ))}
        </nav>
        {footer && <div style={{ padding: 'var(--space-5)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>{footer}</div>}
        <style>{'@keyframes hcfade{from{opacity:0}}@keyframes hcslide{from{transform:translateX(100%)}}'}</style>
      </aside>
    </div>
  );
}
