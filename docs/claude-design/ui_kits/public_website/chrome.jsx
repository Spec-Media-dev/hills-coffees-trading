const { Header, MobileDrawer, Button, LanguageSwitcher, ThemeToggle, Icon } = window.HillsCoffeeDesignSystem_ca006d;

const LINKS = [
  { key: 'marketplace', label: 'Green coffee' },
  { key: 'origins', label: 'Origins' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'about', label: 'About' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'contact', label: 'Contact' },
  { key: 'help', label: 'Help' },
];

function SiteChrome({ active, onNavigate, children }) {
  const [menu, setMenu] = React.useState(false);
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Header logoSrc="../../assets/logo-horizontal.png" links={LINKS} activeKey={active} onNavigate={onNavigate}
        onOpenMenu={() => setMenu(true)}
        actions={<>
          <LanguageSwitcher variant="onLight" lang="en" onChange={(l) => { document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = l; }} />
          <ThemeToggle variant="onLight" theme="light" onChange={(t) => { document.documentElement.dataset.theme = t; }} />
          <Button variant="text" size="sm">Sign in</Button>
          <Button size="sm">Apply as buyer</Button>
        </>}
        style={{ position: 'sticky', top: 0, zIndex: 'var(--z-sticky)' }} />
      <main>{children}</main>
      <SiteFooter onNavigate={onNavigate} />
      <MobileDrawer open={menu} onClose={() => setMenu(false)} links={LINKS} activeKey={active} onNavigate={onNavigate}
        footer={<><Button fullWidth>Apply as buyer</Button><Button fullWidth variant="outline">Apply as seller</Button></>} />
    </div>
  );
}

function Section({ eyebrow, title, lead, children, tone = 'page', style }) {
  return (
    <section style={{ background: tone === 'cream' ? 'var(--brand-cream)' : 'var(--surface-page)', padding: 'var(--section-y) var(--gutter-page)', ...style }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        {(eyebrow || title) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 720 }}>
            {eyebrow && <span className="hc-eyebrow">{eyebrow}</span>}
            {title && <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: 0 }}>{title}</h2>}
            {lead && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-muted)', margin: 0, lineHeight: 'var(--lh-body)', textWrap: 'pretty' }}>{lead}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function ImagePlaceholder({ label, ratio = '16 / 9', style }) {
  return (
    <div style={{ aspectRatio: ratio, background: 'var(--forest-800)', borderRadius: 'var(--radius-lg)', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 'var(--space-6)', ...style }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'rgba(238,228,209,.62)', maxWidth: 280, lineHeight: 'var(--lh-snug)' }}>{label}</span>
    </div>
  );
}

const FOOTER_ROUTES = {
  'Green coffee offers': 'marketplace', 'Shipping & storage': 'shipping',
  Origins: 'origins', Regions: 'origins', Processing: 'origins', 'Knowledge hub': 'knowledge',
  'About Hills Coffee': 'about', Contact: 'contact', 'Help & FAQ': 'help', 'Returns & refunds': 'legal',
  Terms: 'legal', Privacy: 'legal', Cookies: 'legal',
};

function SiteFooter({ onNavigate }) {
  const cols = [
    ['Trade', ['Green coffee offers', 'Apply as buyer', 'Apply as seller', 'Shipping & storage']],
    ['Coffee', ['Origins', 'Regions', 'Processing', 'Knowledge hub']],
    ['Company', ['About Hills Coffee', 'Contact', 'Help & FAQ', 'Returns & refunds']],
    ['Legal', ['Terms', 'Privacy', 'Cookies']],
  ];
  return (
    <footer style={{ background: 'var(--brand-forest)', color: 'var(--brand-cream)', padding: 'var(--space-16) var(--gutter-page) var(--space-8)' }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) repeat(4, minmax(0,1fr))', gap: 'var(--space-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 'var(--weight-black)', letterSpacing: '.02em' }}>HILLS COFFEE</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'rgba(238,228,209,.72)', lineHeight: 'var(--lh-body)' }}>Beyond the origin. Green coffee sourcing and trading for roasters and importers.</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'rgba(238,228,209,.72)' }}>Dubai · Egypt</span>
        </div>
        {cols.map(([title, items]) => (
          <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-on-dark)' }}>{title}</span>
            {items.map((i) => <a key={i} href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(FOOTER_ROUTES[i] || 'marketplace'); }} style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'rgba(238,228,209,.86)', textDecoration: 'none' }}>{i}</a>)}
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 'var(--container-max)', margin: 'var(--space-12) auto 0', paddingTop: 'var(--space-5)', borderTop: '1px solid rgba(238,228,209,.16)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'rgba(238,228,209,.6)' }}>
        <span>© 2026 Hills Coffee Trading</span>
        <span style={{ marginInlineStart: 'auto' }}>B2B green coffee only — no retail sales</span>
      </div>
    </footer>
  );
}

Object.assign(window, { SiteChrome, Section, ImagePlaceholder, SiteFooter, PUBLIC_LINKS: LINKS, FOOTER_ROUTES });
