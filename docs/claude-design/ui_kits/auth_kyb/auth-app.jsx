const ASIDES = {
  login: 'Green coffee sourcing and trading for verified buyers and sellers.',
  forgot: 'Password resets go to the work address on your company account.',
  role: 'One account, one track. Buyers source and order; sellers list and settle.',
  verify: 'Verify the work email first — KYB comes next.',
  kyb: 'Verification is a checklist, not a wall. Your progress saves as you go.',
  status: 'We tell you exactly what is missing and exactly where to fix it.',
};
const SCREENS = ['login', 'forgot', 'role', 'verify', 'kyb', 'status'];

function AuthApp() {
  const [screen, setScreen] = React.useState('login');
  const go = (key) => setScreen(SCREENS.includes(key) ? key : 'login');
  return (
    <AuthChrome aside={ASIDES[screen]}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[['login', 'Sign in'], ['forgot', 'Forgot password'], ['role', 'Register'], ['verify', 'Email verification'], ['kyb', 'KYB wizard'], ['status', 'Application status']].map(([k, l]) => (
            <button key={k} onClick={() => go(k)} style={{ minHeight: 32, padding: '0 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', background: screen === k ? 'var(--primary)' : 'var(--surface-card)', color: screen === k ? 'var(--primary-contrast)' : 'var(--text-muted)', border: '1px solid ' + (screen === k ? 'var(--primary)' : 'var(--border)') }}>{l}</button>
          ))}
        </div>
        {screen === 'login' && <Login onNavigate={go} />}
        {screen === 'forgot' && <ForgotPassword onNavigate={go} />}
        {screen === 'role' && <RoleSelect onNavigate={go} />}
        {screen === 'verify' && <EmailVerification onNavigate={go} />}
        {screen === 'kyb' && <KybWizard onNavigate={go} />}
        {screen === 'status' && <ApplicationStatus onNavigate={go} />}
      </div>
    </AuthChrome>
  );
}

/* No mount here on purpose: this file is compiled into the design-system bundle,
   so a module-scope createRoot would run on every page that loads the bundle.
   The mount lives in an inline script at the end of index.html. */
Object.assign(window, { AuthApp });
