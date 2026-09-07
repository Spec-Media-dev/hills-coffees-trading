const { LanguageSwitcher, ThemeToggle, Icon } = window.HillsCoffeeDesignSystem_ca006d;

/* Split layout: brand panel on the leading edge, form on the trailing edge. */
function AuthChrome({ children, aside }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(320px,.85fr) minmax(0,1.15fr)', background: 'var(--bg)' }}>
      <aside style={{ background: 'var(--brand-forest)', color: 'var(--brand-cream)', padding: 'var(--space-10) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <div style={{ background: 'var(--brand-cream)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', width: 'fit-content' }}>
          <img src="../../assets/logo-horizontal.png" alt="Hills Coffee" style={{ height: 40 }} />
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,1.4rem + 2vw,3.25rem)', fontWeight: 'var(--weight-bold)', lineHeight: 'var(--lh-display)', letterSpacing: 'var(--tracking-display)' }}>Beyond the origin</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', color: 'rgba(238,228,209,.82)', lineHeight: 'var(--lh-body)', maxWidth: 360 }}>{aside || 'Green coffee sourcing and trading for verified buyers and sellers.'}</span>
        </div>
      </aside>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', padding: 'var(--space-5) var(--gutter-page)' }}>
          <LanguageSwitcher variant="onLight" lang="en" onChange={(l) => { document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = l; }} />
          <ThemeToggle variant="onLight" theme="light" onChange={(t) => { document.documentElement.dataset.theme = t; }} />
        </div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'start center', padding: '0 var(--gutter-page) var(--space-16)' }}>{children}</div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthChrome });
