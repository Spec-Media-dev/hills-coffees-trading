const { Field, Input, Button, Checkbox, InlineAlert, Icon } = window.HillsCoffeeDesignSystem_ca006d;

function Login({ onNavigate }) {
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState(false);
  return (
    <div style={{ width: 'min(100%, 420px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Sign in</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', margin: 0 }}>Use the work email on your company account.</p>
      </div>
      {error && <InlineAlert tone="danger" title="We could not sign you in" icon={<Icon name="triangle-alert" size={18} />}>Check the email and password, or reset your password.</InlineAlert>}
      <Field label="Work email" required><Input type="email" placeholder="ops@company.com" defaultValue="ops@niletraders.example" /></Field>
      <Field label="Password" required><Input type="password" defaultValue="••••••••••" /></Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <Checkbox checked={remember} onChange={setRemember} label="Keep me signed in" />
        <a href="#" onClick={(e) => e.preventDefault()} style={{ marginInlineStart: 'auto', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)' }}>Forgot password?</a>
      </div>
      <Button size="lg" fullWidth onClick={() => onNavigate('status')}>Sign in</Button>
      <Button variant="text" onClick={() => setError(!error)}>Toggle error state</Button>
      <div style={{ paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>New to Hills Coffee?</span>
        <Button variant="outline" fullWidth onClick={() => onNavigate('role')}>Create a company account</Button>
      </div>
    </div>
  );
}

Object.assign(window, { Login });
