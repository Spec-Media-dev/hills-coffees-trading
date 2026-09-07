const { Sidebar, Topbar, ThemeToggle, LanguageSwitcher, IconButton, Icon, Breadcrumbs } = window.HillsCoffeeDesignSystem_ca006d;

const NAV = [
  { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: <Icon name="layout-grid" size={18} /> }] },
  { label: 'Selling', items: [
    { key: 'listings', label: 'My listings', icon: <Icon name="package" size={18} /> },
    { key: 'create', label: 'Create listing', icon: <Icon name="plus" size={18} /> },
    { key: 'orders', label: 'Sales orders', icon: <Icon name="clipboard-list" size={18} />, badge: 2 },
  ] },
  { label: 'Money & delivery', items: [
    { key: 'settlements', label: 'Settlements', icon: <Icon name="scale" size={18} /> },
    { key: 'shipments', label: 'Shipments', icon: <Icon name="truck" size={18} />, badge: 2 },
    { key: 'notifications', label: 'Notifications', icon: <Icon name="bell" size={18} />, badge: 2 },
  ] },
  { label: 'Company', items: [
    { key: 'kyb', label: 'KYB & company profile', icon: <Icon name="shield-check" size={18} /> },
    { key: 'settings', label: 'Settings', icon: <Icon name="settings" size={18} /> },
  ] },
];

function SellerShell({ active, onNavigate, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar logoSrc="../../assets/logo-horizontal.png" groups={NAV} activeKey={active} onNavigate={onNavigate}
        footerNote="Verified seller · Abyssinia Exports" style={{ position: 'sticky', top: 0, height: '100vh' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar workspaceLabel="Seller portal" subtitle="Abyssinia Exports · Addis Ababa"
          style={{ background: 'var(--surface-page)', borderBottom: '1px solid var(--border)' }}
          actions={<>
            <ThemeToggle variant="onLight" theme="light" onChange={(t) => { document.documentElement.dataset.theme = t; }} />
            <LanguageSwitcher variant="onLight" lang="en" onChange={(l) => { document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = l; }} />
            <IconButton icon={<Icon name="bell" size={18} />} label="Notifications" variant="outline" />
          </>} />
        <main style={{ flex: 1, padding: '0 var(--gutter-page) var(--space-16)' }}>{children}</main>
      </div>
    </div>
  );
}

function PageHead({ title, subtitle, actions, crumbs, onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-6)', flexWrap: 'wrap', padding: 'var(--space-8) 0 var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }}>
        {crumbs && <Breadcrumbs items={crumbs} onNavigate={onNavigate} />}
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-dash-title)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-muted)', margin: 0, maxWidth: 720, textWrap: 'pretty' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

Object.assign(window, { SellerShell, PageHead });
