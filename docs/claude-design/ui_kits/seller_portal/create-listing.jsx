const { Stepper, Card, Field, Input, Select, Combobox, CountryField, Textarea, FileUpload, Button, ListingCard, StatusBadge, InlineAlert, Icon, Checkbox } = window.HillsCoffeeDesignSystem_ca006d;

const STEPS = [
  { label: 'Coffee identity' }, { label: 'Origin' }, { label: 'Specifications' },
  { label: 'Quantity & pricing' }, { label: 'Warehouse' }, { label: 'Media & documents' }, { label: 'Review' },
];

function CreateListing({ onNavigate }) {
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState('Guji Hambela Natural Lot 22');
  const [price, setPrice] = React.useState('5.40');
  const [bags, setBags] = React.useState('140');
  return (
    <>
      <PageHead title="Create listing" subtitle="Sections, not one long form. The buyer preview updates as you fill it in."
        crumbs={[{ key: 'listings', label: 'My listings' }, { label: 'New lot' }]} onNavigate={() => onNavigate('listings')}
        actions={<><Button variant="secondary">Save draft</Button><Button onClick={() => onNavigate('listings')}>Submit for review</Button></>} />
      <Stepper current={step} onStepClick={setStep} steps={STEPS} />
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Card>
          {step === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Lot name" required hint="How buyers will see it in the marketplace"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
              <Field label="Coffee type" required><Select options={['Arabica', 'Robusta']} /></Field>
              <Field label="Variety" required><Combobox options={['Heirloom', 'Bourbon', 'Typica', 'Caturra', 'SL28']} onChange={() => {}} /></Field>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Short description" optional><Textarea rows={3} placeholder="Two or three sentences on the lot's character and handling" /></Field></div>
            </div>
          )}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Country of origin" required><CountryField value="Ethiopia" /></Field>
              <Field label="Region" required><Combobox options={['Guji', 'Yirgacheffe', 'Sidamo', 'Limu', 'Harrar']} onChange={() => {}} /></Field>
              <Field label="Washing station / farm" optional><Input placeholder="Hambela station" /></Field>
              <Field label="Altitude (m)" optional><Input placeholder="1,900–2,150" /></Field>
            </div>
          )}
          {step === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Grade" required><Select options={['G1', 'G2', 'AA', 'AB']} /></Field>
              <Field label="Process" required><Select options={['Washed', 'Natural', 'Honey', 'Anaerobic']} /></Field>
              <Field label="Screen size" optional><Input placeholder="15+" /></Field>
              <Field label="Moisture (%)" required><Input placeholder="10.4" /></Field>
              <Field label="Harvest year" required><Select options={['2025/26', '2024/25']} /></Field>
              <Field label="Cupping score" optional><Input placeholder="86.5" /></Field>
            </div>
          )}
          {step === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Available bags" required hint="60kg jute with GrainPro"><Input value={bags} onChange={(e) => setBags(e.target.value)} /></Field>
              <Field label="Minimum order (bags)" required><Input defaultValue="20" /></Field>
              <Field label="Price per kg" required><Input prefix="USD" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
              <Field label="Price basis" required><Select options={['Ex-warehouse', 'FOB', 'CIF']} /></Field>
              <div style={{ gridColumn: '1 / -1' }}><InlineAlert tone="info" icon={<Icon name="info" size={16} />}>Hills commission is applied at settlement, not to the listed price. Your net appears in Settlements.</InlineAlert></div>
            </div>
          )}
          {step === 4 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Warehouse" required><Select options={['Jebel Ali, Dubai', 'Damietta, Egypt', 'Addis Ababa bonded']} /></Field>
              <Field label="Lot / stack reference" optional><Input placeholder="ST-14-B" /></Field>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Handover notes" optional><Textarea rows={3} placeholder="Access, pickup hours, contact on site" /></Field></div>
            </div>
          )}
          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <Field label="Lot photography" required hint="Green beans, bags in warehouse, quality inspection. JPG or PNG."><FileUpload icon={<Icon name="image" size={18} />} label="Drop up to 6 images or browse" hint="JPG / PNG · up to 5 MB each" files={[{ name: 'guji-bags-01.jpg', size: '2.1 MB', progress: 100 }, { name: 'guji-beans-02.jpg', size: '1.8 MB', progress: 64 }]} onRemove={() => {}} /></Field>
              <Field label="Specification sheet" required><FileUpload icon={<Icon name="file-text" size={18} />} files={[{ name: 'spec-sheet.pdf', size: '410 KB', progress: 100 }]} onRemove={() => {}} /></Field>
              <Field label="Warehouse holding certificate" required><FileUpload state="error" icon={<Icon name="warehouse" size={18} />} label="Required before review" hint="PDF · up to 10 MB" /></Field>
            </div>
          )}
          {step === 6 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <InlineAlert tone="warning" title="One item blocks submission" icon={<Icon name="triangle-alert" size={18} />}>The warehouse holding certificate is still missing.</InlineAlert>
              {[['Coffee identity', 'Complete'], ['Origin', 'Complete'], ['Specifications', 'Complete'], ['Quantity & pricing', 'Complete'], ['Warehouse', 'Complete'], ['Media & documents', '1 required document missing']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{k}</span>
                  <span style={{ marginInlineStart: 'auto' }}>{v === 'Complete' ? <StatusBadge status="approved" size="sm" label="Complete" /> : <StatusBadge status="moreInfo" size="sm" label={v} />}</span>
                </div>
              ))}
              <Checkbox label="I confirm the lot is available in the stated quantity and location" />
            </div>
          )}
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="text" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
            <span style={{ marginInlineStart: 'auto' }}>
              {step < STEPS.length - 1 ? <Button onClick={() => setStep(step + 1)}>Continue</Button> : <Button onClick={() => onNavigate('listings')}>Submit for review</Button>}
            </span>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'var(--space-5)' }}>
          <span className="hc-label">Buyer preview</span>
          <ListingCard title={name} origin="Ethiopia" region="Guji" grade="G1" process="Natural" harvest="2025/26"
            quantity={bags + ' bags · 60kg'} price={'USD ' + price + ' / kg'} seller="verified" sellerName="Abyssinia Exports"
            status={<StatusBadge status="draft" size="sm" />} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>Listings stay in draft until submitted. After approval, price and quantity changes go live immediately; specification changes need re-approval.</span>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { CreateListing });
