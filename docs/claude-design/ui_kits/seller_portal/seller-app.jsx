const SCREENS = ['dashboard', 'listings', 'create', 'orders', 'salesOrder', 'settlements', 'shipments', 'shipmentDetail', 'notifications', 'kyb', 'settings'];

function SellerApp() {
  const [screen, setScreen] = React.useState('dashboard');
  const go = (key) => setScreen(SCREENS.includes(key) ? key : 'dashboard');
  const active = screen === 'salesOrder' ? 'orders' : screen === 'shipmentDetail' ? 'shipments' : screen;
  return (
    <SellerShell active={active} onNavigate={go}>
      {screen === 'dashboard' && <SellerDashboard onNavigate={go} />}
      {screen === 'listings' && <SellerListings onNavigate={go} />}
      {screen === 'create' && <CreateListing onNavigate={go} />}
      {screen === 'orders' && <SellerSalesOrders onNavigate={go} />}
      {screen === 'salesOrder' && <SellerSalesOrderDetail onNavigate={go} />}
      {screen === 'settlements' && <Settlements />}
      {screen === 'shipments' && <SellerShipments onNavigate={go} />}
      {screen === 'shipmentDetail' && <SellerShipmentDetail onNavigate={go} />}
      {screen === 'notifications' && <SellerNotifications />}
      {screen === 'kyb' && <SellerKybProfile />}
      {screen === 'settings' && <AccountSettings role="Seller" />}
    </SellerShell>
  );
}

/* No mount here on purpose: this file is compiled into the design-system bundle,
   so a module-scope createRoot would run on every page that loads the bundle.
   The mount lives in an inline script at the end of index.html. */
Object.assign(window, { SellerApp });
