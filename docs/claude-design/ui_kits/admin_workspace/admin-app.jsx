const SCREENS = ['overview', 'approvals', 'kyb', 'users', 'listings', 'listingReview', 'createHillsListing', 'orders', 'orderDetail', 'finance', 'shipments', 'shipmentDetail', 'catalog', 'content', 'appearance', 'audit', 'settings'];
const ALIAS = { products: 'listings', offers: 'listings', pricing: 'listings', origins: 'catalog', regions: 'catalog', varieties: 'catalog', warehouses: 'catalog', taxonomy: 'catalog', pages: 'content', articles: 'content', media: 'content' };

function AdminApp() {
  const [screen, setScreen] = React.useState('overview');
  const go = (key) => setScreen(SCREENS.includes(key) ? key : ALIAS[key] || 'overview');
  const active = { kyb: 'approvals', listingReview: 'listings', createHillsListing: 'listings', orderDetail: 'orders', shipmentDetail: 'shipments' }[screen] || screen;
  return (
    <AdminShell active={active} onNavigate={go}>
      {screen === 'overview' && <AdminOverview />}
      {screen === 'approvals' && <AdminApprovals onOpen={() => go('kyb')} />}
      {screen === 'kyb' && <AdminKybReview onBack={() => go('approvals')} />}
      {screen === 'users' && <AdminUsers />}
      {screen === 'listings' && <AdminListings onNavigate={go} />}
      {screen === 'listingReview' && <AdminListingReview onBack={() => go('listings')} />}
      {screen === 'createHillsListing' && <AdminCreateHillsListing onBack={() => go('listings')} />}
      {screen === 'orders' && <AdminOrders onNavigate={go} />}
      {screen === 'orderDetail' && <AdminOrderDetail onBack={() => go('orders')} />}
      {screen === 'finance' && <AdminFinance />}
      {screen === 'shipments' && <AdminShipments onNavigate={go} />}
      {screen === 'shipmentDetail' && <AdminShipmentDetail onBack={() => go('shipments')} />}
      {screen === 'catalog' && <AdminCatalog />}
      {screen === 'content' && <AdminContent />}
      {screen === 'appearance' && <AdminAppearance />}
      {screen === 'audit' && <AdminAudit />}
      {screen === 'settings' && <AdminSettings />}
    </AdminShell>
  );
}

/* No mount here on purpose: this file is compiled into the design-system bundle,
   so a module-scope createRoot would run on every page that loads the bundle.
   The mount lives in an inline script at the end of index.html. */
Object.assign(window, { AdminApp });
