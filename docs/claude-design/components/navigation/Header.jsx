import React from 'react';

/* Public marketing header. Cream/transparent over the hero, solid on scroll. */
export function Header({ logoSrc, links = [], activeKey, onNavigate, actions, transparent = false, onOpenMenu, style, ...rest }) {
  return (
    <header style={{ height: 'var(--header-h)', display: 'flex', alignItems: 'center', gap: 'var(--space-6)', padding: '0 var(--gutter-page)', background: transparent ? 'transparent' : 'var(--surface-page)', borderBottom: transparent ? '1px solid transparent' : '1px solid var(--border)', backdropFilter: transparent ? 'var(--blur-panel)' : 'none', ...style }} {...rest}>
      <a href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate('home'); }} style={{ display: 'inline-flex', flex: '0 0 auto' }}>
        {logoSrc ? <img src={logoSrc} alt="Hills Coffee" style={{ height: 40 }} /> : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: 'var(--brand-forest)' }}>HILLS COFFEE</span>}
      </a>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', marginInlineStart: 'var(--space-6)', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {links.map((l) => (
          <button key={l.key} type="button" onClick={() => onNavigate && onNavigate(l.key)}
            style={{ border: 'none', background: 'transparent', padding: '6px 0', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: l.key === activeKey ? 'var(--weight-bold)' : 'var(--weight-medium)', color: l.key === activeKey ? 'var(--text-strong)' : 'var(--text-muted)', borderBottom: '2px solid ' + (l.key === activeKey ? 'var(--accent)' : 'transparent'), whiteSpace: 'nowrap' }}>{l.label}</button>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: '0 0 auto' }}>{actions}</div>
      {onOpenMenu && (
        <button type="button" onClick={onOpenMenu} aria-label="Open menu"
          style={{ width: 'var(--control-h)', height: 'var(--control-h)', display: 'none', placeItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', cursor: 'pointer' }}>☰</button>
      )}
    </header>
  );
}
