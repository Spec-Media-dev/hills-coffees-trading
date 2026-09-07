const { Sidebar, Topbar, ThemeToggle, LanguageSwitcher, Icon, IconButton } = window.HillsCoffeeDesignSystem_ca006d;

const NAV = [
  { label: 'Overview', items: [{ key: 'overview', label: 'Dashboard', icon: <Icon name="layout-grid" size={18} /> }] },
  { label: 'Approvals', items: [
    { key: 'approvals', label: 'Buyer & seller approvals', icon: <Icon name="user-check" size={18} />, badge: 4 },
    { key: 'kyb', label: 'KYB applications', icon: <Icon name="shield-check" size={18} /> },
    { key: 'users', label: 'Users & organizations', icon: <Icon name="users" size={18} /> },
  ] },
  { label: 'Catalog', items: [
    { key: 'products', label: 'Products', icon: <Icon name="coffee" size={18} /> },
    { key: 'listings', label: 'All listings', icon: <Icon name="package" size={18} />, badge: 1 },
    { key: 'pricing', label: 'Pricing', icon: <Icon name="circle-dollar-sign" size={18} /> },
  ] },
  { label: 'Coffee data', items: [
    { key: 'origins', label: 'Origins', icon: <Icon name="map-pin" size={18} /> },
    { key: 'regions', label: 'Regions', icon: <Icon name="map" size={18} /> },
    { key: 'varieties', label: 'Varieties', icon: <Icon name="sprout" size={18} /> },
    { key: 'warehouses', label: 'Warehouses', icon: <Icon name="warehouse" size={18} /> },
    { key: 'taxonomy', label: 'Taxonomy', description: 'Types, processing, certifications, tags', icon: <Icon name="tag" size={18} /> },
  ] },
  { label: 'Operations', items: [
    { key: 'orders', label: 'Orders', icon: <Icon name="clipboard-list" size={18} /> },
    { key: 'finance', label: 'Finance & payments', icon: <Icon name="banknote" size={18} /> },
    { key: 'shipments', label: 'Shipments', icon: <Icon name="truck" size={18} /> },
  ] },
  { label: 'Reference', items: [
    { key: 'catalog', label: 'Catalog & coffee data', description: 'Origins, regions, varieties, warehouses, taxonomy', icon: <Icon name="map-pin" size={18} /> },
  ] },
  { label: 'Content', items: [
    { key: 'pages', label: 'Pages & CMS', icon: <Icon name="file-text" size={18} /> },
    { key: 'articles', label: 'Articles', icon: <Icon name="book-open" size={18} /> },
    { key: 'content', label: 'Pages, articles & media', icon: <Icon name="file-text" size={18} /> },
    { key: 'appearance', label: 'Site appearance & brand', icon: <Icon name="palette" size={18} /> },
  ] },
  { label: 'Governance', items: [
    { key: 'audit', label: 'Activity & audit', icon: <Icon name="history" size={18} /> },
    { key: 'settings', label: 'Admin settings', icon: <Icon name="settings" size={18} /> },
  ] },
];

function AdminShell({ active, onNavigate, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar logoSrc="../../assets/logo-horizontal.png" groups={NAV} activeKey={active} onNavigate={onNavigate}
        footerNote="Administrator access is verified on the server." style={{ position: 'sticky', top: 0, height: '100vh' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar workspaceLabel="Admin workspace" subtitle="adminhills@gmail.com"
          actions={<>
            <ThemeToggle theme="dark" onChange={(t) => { document.documentElement.dataset.theme = t; }} />
            <LanguageSwitcher lang="en" onChange={(l) => { document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = l; }} />
            <IconButton icon={<Icon name="bell" size={18} />} label="Notifications" variant="onDark" />
          </>} />
        <main style={{ flex: 1, padding: '0 var(--gutter-page) var(--space-16)' }}>{children}</main>
      </div>
    </div>
  );
}

function PageHead({ title, subtitle, note, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-6)', flexWrap: 'wrap', padding: 'var(--space-6) 0 var(--space-8)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-dash-title)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0, letterSpacing: 'var(--tracking-display)' }}>{title}</h1>
        {subtitle && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-body)', margin: 0 }}>{subtitle}</p>}
        {note && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', margin: 0 }}>{note}</p>}
      </div>
      {actions && <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 'var(--space-3)' }}>{actions}</div>}
    </div>
  );
}

Object.assign(window, { AdminShell, PageHead, ADMIN_NAV: NAV });
