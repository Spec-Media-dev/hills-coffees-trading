const { RadioGroup, Button, Field, Input, PhoneField, Checkbox, InlineAlert, Icon } = window.HillsCoffeeDesignSystem_ca006d;

function RoleSelect({ onNavigate }) {
  const [role, setRole] = React.useState('buyer');
  const [agreed, setAgreed] = React.useState(false);
  return (
    <div style={{ width: 'min(100%, 620px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Choose your track</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', margin: 0 }}>One account is either a buyer or a seller. You can read the difference before you commit.</p>
      </div>
      <RadioGroup name="role" value={role} onChange={setRole} options={[
        { value: 'buyer', label: 'Buy green coffee', description: 'Source lots, place orders, follow payments, invoices and shipments.' },
        { value: 'seller', label: 'Sell green coffee', description: 'List lots for verified buyers, manage sales orders, shipments and settlements.' }]} />
      <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Both tracks need company verification">
        Registration creates the account. Trading is enabled after your KYB application is approved.
      </InlineAlert>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
        <Field label="Company name" required><Input placeholder="Nile Traders LLC" /></Field>
        <Field label="Work email" required><Input type="email" placeholder="ops@company.com" /></Field>
        <Field label="Work phone" required><PhoneField dialCode="+20" placeholder="10 1234 5678" /></Field>
        <Field label="Your role" required><Input placeholder="Head of sourcing" /></Field>
        <div style={{ gridColumn: '1 / -1' }}><Field label="Password" required hint="At least 12 characters"><Input type="password" /></Field></div>
      </div>
      <Checkbox checked={agreed} onChange={setAgreed} label="I am authorised to register this company" description="Hills Coffee verifies signing authority during KYB." />
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Button size="lg" disabled={!agreed} onClick={() => onNavigate('kyb')}>Continue to verification</Button>
        <Button size="lg" variant="text" onClick={() => onNavigate('login')}>Back to sign in</Button>
      </div>
    </div>
  );
}

Object.assign(window, { RoleSelect });
