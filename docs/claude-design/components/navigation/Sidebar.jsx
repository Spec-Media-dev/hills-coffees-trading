import React from 'react';

/* Dashboard sidebar, recreated from the live Hills Coffee admin workspace:
   dark forest panel, cream logo plate, gold uppercase group labels,
   filled green active item, verification note pinned to the bottom. */
export function Sidebar({ logoSrc, groups = [], activeKey, onNavigate, footerNote, collapsed = false, style, ...rest }) {
  return (
    <nav style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)', flex: '0 0 auto', background: 'var(--brand-dark-bg)', borderInlineEnd: '1px solid #22302B', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', ...style }} {...rest}>
      <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
        <div style={{ background: 'var(--brand-cream)', borderRadius: 'var(--radius-md)', height: 60, display: 'grid', placeItems: 'center', padding: '0 var(--space-4)' }}>
          {logoSrc
            ? <img src={logoSrc} alt="Hills Coffee" style={{ maxWidth: '100%', maxHeight: 40, objectFit: 'contain' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--brand-forest)', letterSpacing: '.04em' }}>HILLS</span>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-3) var(--space-4)' }}>
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 'var(--space-6)' }}>
            {!collapsed && <div style={{ padding: '0 var(--space-3)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-on-dark)' }}>{g.label}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map((it) => {
                const active = it.key === activeKey;
                return (
                  <button key={it.key} type="button" onClick={() => onNavigate && onNavigate(it.key)} title={collapsed ? it.label : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', textAlign: 'start', background: active ? 'var(--forest-500)' : 'transparent', color: active ? '#F2EDE1' : '#C7D4CC', transition: 'var(--transition-control)', fontFamily: 'var(--font-ui)' }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(238,228,209,.07)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ display: 'inline-flex', flex: '0 0 auto', opacity: active ? 1 : 0.8 }}>{it.icon}</span>
                    {!collapsed && (
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: 'var(--text-small)', fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)' }}>{it.label}</span>
                        {it.description && <span style={{ fontSize: 11, color: '#8FA398', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description}</span>}
                      </span>
                    )}
                    {!collapsed && it.badge != null && <span style={{ marginInlineStart: 'auto', fontSize: 'var(--text-micro)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', background: 'var(--accent)', color: '#17211D', borderRadius: 999, padding: '2px 7px' }}>{it.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {footerNote && !collapsed && <div style={{ padding: 'var(--space-4)', borderTop: '1px solid #22302B', fontFamily: 'var(--font-ui)', fontSize: 11, color: '#8FA398' }}>{footerNote}</div>}
    </nav>
  );
}
