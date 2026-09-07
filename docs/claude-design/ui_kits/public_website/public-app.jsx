const SCREENS = ['home', 'marketplace', 'listing', 'origins', 'origin', 'knowledge', 'article', 'about', 'contact', 'shipping', 'help', 'legal'];

function PublicApp() {
  const [screen, setScreen] = React.useState('home');
  const go = (key) => setScreen(SCREENS.includes(key) ? key : 'home');
  const active = { listing: 'marketplace', origin: 'origins', article: 'knowledge' }[screen] || screen;
  return (
    <SiteChrome active={active} onNavigate={go}>
      {screen === 'home' && <Home onNavigate={go} />}
      {screen === 'marketplace' && <Marketplace onNavigate={go} />}
      {screen === 'listing' && <ListingDetail onNavigate={go} />}
      {screen === 'origins' && <OriginsHub onNavigate={go} />}
      {screen === 'origin' && <OriginDetail onNavigate={go} />}
      {screen === 'knowledge' && <KnowledgeHub onNavigate={go} />}
      {screen === 'article' && <Knowledge onNavigate={go} />}
      {screen === 'about' && <About onNavigate={go} />}
      {screen === 'contact' && <Contact />}
      {screen === 'shipping' && <Shipping onNavigate={go} />}
      {screen === 'help' && <HelpFaq onNavigate={go} />}
      {screen === 'legal' && <Legal />}
    </SiteChrome>
  );
}

/* No mount here on purpose: this file is compiled into the design-system bundle,
   so a module-scope createRoot would run on every page that loads the bundle.
   The mount lives in an inline script at the end of index.html. */
Object.assign(window, { PublicApp });
