const { Card, Button, Icon, InlineAlert, DocumentRow, StatusBadge, Field, Input, Select, Switch, Checkbox, PhoneField, CountryField } = window.HillsCoffeeDesignSystem_ca006d;

/* Shared account & settings surface — Buyer, Seller and Admin share this base (§14).
   Loaded by every portal kit; the caller passes its own PageHead via window. */
/* ---------- Settings (shared shape across roles) ---------- */
function AccountSettings({ role = 'Buyer' }) {
  const [tab, setTab] = React.useState('profile');
  const [lang, setLang] = React.useState('English');
  return (
    <>
      <PageHead title="Settings" subtitle={'Profile, security, language and notifications for your ' + role.toLowerCase() + ' account.'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,240px) minmax(0,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Card padding="sm">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[['profile', 'Profile', 'user'], ['company', 'Company', 'building-2'], ['security', 'Security', 'lock'], ['notifications', 'Notifications', 'bell'], ['appearance', 'Theme & language', 'palette']].map(([k, l, ic]) => (
              <button key={k} onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 44, padding: '0 var(--space-3)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'start', background: tab === k ? 'color-mix(in oklab, var(--primary) 8%, transparent)' : 'transparent', color: 'var(--text-strong)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: tab === k ? 'var(--weight-bold)' : 'var(--weight-medium)' }}>
                <Icon name={ic} size={16} />{l}
              </button>
            ))}
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {tab === 'profile' && (
            <Card header={<span className="hc-label">Profile</span>}>
              <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <span style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--forest-100)', color: 'var(--brand-forest)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700 }}>AF</span>
                  <Button size="sm" variant="outline">Change photo</Button>
                </div>
                <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                  <Field label="Full name" required><Input defaultValue="Ahmed Fouad" /></Field>
                  <Field label="Role / authority"><Input defaultValue="Head of sourcing" /></Field>
                  <Field label="Work email" required hint="Changing this requires re-verification"><Input defaultValue="ops@niletraders.example" /></Field>
                  <Field label="Work phone"><PhoneField dialCode="+20" defaultValue="10 1234 5678" /></Field>
                </div>
              </div>
              <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}><Button>Save changes</Button><Button variant="text">Discard</Button></div>
            </Card>
          )}
          {tab === 'company' && (
            <Card header={<span className="hc-label">Company</span>}>
              <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Verified fields are read-only">Legal name, registration number and jurisdiction can only change through a new KYB review.</InlineAlert>
              <div style={{ marginTop: 'var(--space-5)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                <Field label="Legal company name"><Input defaultValue="Nile Traders LLC" disabled /></Field>
                <Field label="Registration number"><Input defaultValue="EG-4471-2019" disabled /></Field>
                <Field label="Trading name" optional><Input defaultValue="Nile Traders" /></Field>
                <Field label="Billing email"><Input defaultValue="finance@niletraders.example" /></Field>
              </div>
            </Card>
          )}
          {tab === 'security' && (
            <>
              <Card header={<span className="hc-label">Password</span>}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                  <Field label="Current password" required><Input type="password" /></Field>
                  <Field label="New password" required hint="At least 12 characters"><Input type="password" /></Field>
                </div>
                <div style={{ marginTop: 'var(--space-5)' }}><Button>Update password</Button></div>
              </Card>
              <Card header={<span className="hc-label">Multi-factor authentication</span>}>
                <Switch label="Require a one-time code at sign-in" description="Placeholder — enforcement lands with the security build" />
              </Card>
              <Card padding="none" header={<span className="hc-label">Sessions & devices</span>}>
                <DocumentRow name="Chrome · Cairo, Egypt" kind="This device" issuedOn="Active now" icon={<Icon name="monitor" size={18} />} status={<StatusBadge status="approved" size="sm" label="Current" />} />
                <DocumentRow name="Safari · iPhone" kind="Cairo, Egypt" issuedOn="Last seen 3 Sep 2026" icon={<Icon name="smartphone" size={18} />} onPreview={() => {}} previewLabel="Sign out" />
              </Card>
            </>
          )}
          {tab === 'notifications' && (
            <Card header={<span className="hc-label">Notification preferences</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {[['Order updates', 'Placed, quoted, paid, completed'], ['Payment & invoices', 'Proforma issued, payment confirmed, refunds'], ['Shipment updates', 'Dispatched, delivered, exceptions'], ['KYB & documents', 'Review outcomes and expiring documents'], ['Marketplace digest', 'New lots matching your saved filters']].map(([l, d], i) => (
                  <Switch key={l} label={l} description={d} checked={i < 4} onChange={() => {}} />
                ))}
                <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
                  <Checkbox checked label="Email" /><Checkbox checked label="In-app" /><Checkbox label="WhatsApp" description="Where available" />
                </div>
              </div>
            </Card>
          )}
          {tab === 'appearance' && (
            <Card header={<span className="hc-label">Theme & language</span>}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                <Field label="Language" hint="Switching to Arabic also switches the layout to RTL">
                  <Select value={lang} onChange={(e) => { setLang(e.target.value); const ar = e.target.value !== 'English'; document.documentElement.dir = ar ? 'rtl' : 'ltr'; document.documentElement.lang = ar ? 'ar' : 'en'; }} options={['English', 'العربية']} />
                </Field>
                <Field label="Theme">
                  <Select defaultValue="Light" onChange={(e) => { document.documentElement.dataset.theme = e.target.value === 'Dark' ? 'dark' : 'light'; }} options={['Light', 'Dark']} />
                </Field>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { AccountSettings });
