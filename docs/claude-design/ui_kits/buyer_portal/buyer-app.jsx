const SCREENS = ['dashboard', 'marketplace', 'cart', 'orders', 'order', 'invoices', 'shipments', 'notifications', 'kyb', 'settings'];

function BuyerApp() {
  const [screen, setScreen] = React.useState('dashboard');
  const go = (key) => setScreen(SCREENS.includes(key) ? key : 'dashboard');
  return (
    <BuyerShell active={screen === 'order' ? 'orders' : screen} onNavigate={go}>
      {screen === 'dashboard' && <BuyerDashboard onNavigate={go} />}
      {screen === 'marketplace' && <BuyerMarketplace onNavigate={go} />}
      {screen === 'cart' && <CartCheckout onNavigate={go} />}
      {screen === 'orders' && <BuyerOrders onNavigate={go} />}
      {screen === 'order' && <BuyerOrderDetail onNavigate={go} />}
      {screen === 'invoices' && <BuyerInvoices onNavigate={go} />}
      {screen === 'shipments' && <BuyerShipments onNavigate={go} />}
      {screen === 'notifications' && <BuyerNotifications />}
      {screen === 'kyb' && <BuyerKybProfile onNavigate={go} />}
      {screen === 'settings' && <AccountSettings role="Buyer" />}
    </BuyerShell>
  );
}

/* No mount here on purpose: this file is compiled into the design-system bundle,
   so a module-scope createRoot would run on every page that loads the bundle.
   The mount lives in an inline script at the end of index.html. */
Object.assign(window, { BuyerApp });
