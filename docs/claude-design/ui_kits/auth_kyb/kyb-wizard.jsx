const { Stepper, Field, Input, Select, Combobox, CountryField, PhoneField, FileUpload, Checkbox, Button, Card, InlineAlert, Icon, Textarea, DocumentCard, StatusBadge } = window.HillsCoffeeDesignSystem_ca006d;

const STEPS = [
  { label: 'Company', hint: 'Legal identity' },
  { label: 'Ownership', hint: 'UBO & signatories' },
  { label: 'Contact', hint: 'Working contact' },
  { label: 'Banking & evidence', hint: 'Documents' },
  { label: 'Agreements', hint: 'Terms' },
  { label: 'Review & submit', hint: 'Final check' },
];

function KybWizard({ onNavigate }) {
  const [step, setStep] = React.useState(3);
  return (
    <div style={{ width: 'min(100%, 860px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="hc-eyebrow">Buyer verification · KYB</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{STEPS[step].label}</h1>
        </div>
        <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>Autosaved a moment ago</span>
      </div>
      <Stepper current={step} onStepClick={setStep} steps={STEPS} />
      <Card>
        {step === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <Field label="Legal company name" required hint="Exactly as printed on the trade licence"><Input defaultValue="Nile Traders LLC" /></Field>
            <Field label="Registration number" required><Input defaultValue="EG-4471-2019" /></Field>
            <Field label="Jurisdiction of registration" required><CountryField value="Egypt" /></Field>
            <Field label="Trade licence number" required><Input defaultValue="4471-CAI" /></Field>
            <Field label="Tax / VAT number" optional><Input defaultValue="EG-VAT-882931" /></Field>
            <Field label="Primary activity" required><Select options={['Green coffee import', 'Roasting', 'Trading / distribution', 'Export']} /></Field>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Registered address" required><Textarea rows={2} defaultValue="14 Nile Corniche, Cairo, Egypt" /></Field></div>
          </div>
        )}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <InlineAlert tone="info" icon={<Icon name="users" size={18} />} title="List every beneficial owner above 25%">Directors and the authorised signatory are required regardless of shareholding.</InlineAlert>
            {[['Ahmed Fouad', 'UBO · 55%'], ['Mona Said', 'UBO · 30%'], ['Karim Adel', 'Director']].map(([n, r]) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <Icon name="user" size={18} color="var(--primary)" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{n}</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{r}</span>
                </div>
                <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 'var(--space-2)' }}><Button size="sm" variant="outline">Edit</Button></span>
              </div>
            ))}
            <Button variant="secondary" iconLeft={<Icon name="plus" size={16} />} style={{ alignSelf: 'flex-start' }}>Add person</Button>
          </div>
        )}
        {step === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <Field label="Contact name" required><Input defaultValue="Ahmed Fouad" /></Field>
            <Field label="Role / authority" required><Input defaultValue="Head of sourcing" /></Field>
            <Field label="Work email" required><Input type="email" defaultValue="ops@niletraders.example" /></Field>
            <Field label="Work phone" required><PhoneField dialCode="+20" defaultValue="10 1234 5678" /></Field>
          </div>
        )}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <InlineAlert tone="warning" title="One document needs replacing" icon={<Icon name="triangle-alert" size={18} />}>
              The trade licence on file expired in June 2026. Upload a current copy to continue.
            </InlineAlert>
            <Field label="Trade licence" required hint="PDF · up to 10 MB">
              <FileUpload state="error" icon={<Icon name="upload" size={18} />} label="Replace the expired licence" hint="PDF · up to 10 MB"
                files={[{ name: 'trade-licence-2026.pdf', size: '1.4 MB', progress: 100 }]} onRemove={() => {}} />
            </Field>
            <Field label="Commercial registration" required><FileUpload state="success" icon={<Icon name="upload" size={18} />} files={[{ name: 'commercial-registration.pdf', size: '820 KB', progress: 100 }]} onRemove={() => {}} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Bank name" required><Input defaultValue="Banque Misr" /></Field>
              <Field label="IBAN" required><Input defaultValue="EG38 0019 0005 0000 0000 2631 8" /></Field>
            </div>
          </div>
        )}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Checkbox checked label="Marketplace terms" description="Trading rules, dispute handling and platform obligations" />
            <Checkbox checked label="Privacy policy" description="How company and contact data is processed" />
            <Checkbox label="Delivery acknowledgment" description="Incoterms, storage and handover responsibilities" />
            <InlineAlert tone="info" icon={<Icon name="info" size={18} />}>Final legal wording is pending Owner / Legal approval and may change before launch.</InlineAlert>
          </div>
        )}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {[['Company', 'Nile Traders LLC · EG-4471-2019 · Egypt', 'done'], ['Ownership & signatories', '2 UBOs, 1 director, signatory specimen missing', 'error'], ['Contact', 'Ahmed Fouad · ops@niletraders.example', 'done'], ['Banking & evidence', '3 of 4 documents accepted', 'error'], ['Agreements', '2 of 3 accepted', 'error']].map(([k, v, s]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{v}</span>
                </div>
                <span style={{ marginInlineStart: 'auto' }}>{s === 'done' ? <StatusBadge status="approved" size="sm" label="Complete" /> : <StatusBadge status="moreInfo" size="sm" label="Needs attention" />}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Button variant="text" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>Back</Button>
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="secondary">Save & exit</Button>
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep(step + 1)}>Continue</Button>
            : <Button onClick={() => onNavigate('status')}>Submit application</Button>}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { KybWizard });
