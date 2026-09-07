const { Card, Button, Field, Select, Checkbox, InlineAlert, Icon, Input, Stepper, RadioGroup, Textarea } = window.HillsCoffeeDesignSystem_ca006d;

const ITEMS = [
  { name: 'Yirgacheffe Kochere Lot 14', source: 'Hills Coffee', unit: 'USD 4.80 / kg', bags: 40, weight: '2,400 kg', total: 'USD 11,520' },
  { name: 'Guji Hambela Natural', source: 'Abyssinia Exports', unit: 'USD 5.40 / kg', bags: 60, weight: '3,600 kg', total: 'USD 19,440' },
];

function CartCheckout({ onNavigate }) {
  const [step, setStep] = React.useState(0);
  const [fulfilment, setFulfilment] = React.useState('deliver');
  const [agreed, setAgreed] = React.useState(false);
  return (
    <>
      <PageHead title={step === 0 ? 'Cart' : 'Order review'} subtitle={step === 0 ? 'Quantities are in 60kg bags. Fees and tax display according to the final commercial policy.' : 'Check the company details and fulfilment choice before placing the order.'} />
      <Stepper current={step} onStepClick={setStep} steps={[{ label: 'Cart', hint: '2 lots' }, { label: 'Order review', hint: 'Company & fulfilment' }, { label: 'Proforma & payment', hint: 'Bank transfer' }]} style={{ maxWidth: 720 }} />
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {step === 0 && ITEMS.map((it) => (
            <Card key={it.name}>
              <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: 84, height: 84, borderRadius: 'var(--radius-sm)', background: 'var(--forest-800)', display: 'grid', placeItems: 'center', color: 'rgba(238,228,209,.55)', fontFamily: 'var(--font-ui)', fontSize: 10, textAlign: 'center', padding: 6 }}>Lot photo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{it.name}</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{it.source} · {it.unit} · {it.weight}</span>
                </div>
                <div style={{ width: 120 }}><Field label="Bags"><Input type="number" defaultValue={it.bags} size="sm" /></Field></div>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'end' }}>{it.total}</span>
                <Button size="sm" variant="text">Remove</Button>
              </div>
            </Card>
          ))}
          {step === 1 && (
            <>
              <Card header={<span className="hc-label">Buying company</span>}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                  <Field label="Company"><Input defaultValue="Nile Traders LLC" disabled /></Field>
                  <Field label="Registration"><Input defaultValue="EG-4471-2019" disabled /></Field>
                  <Field label="Delivery contact" required><Input defaultValue="Ahmed Fouad" /></Field>
                  <Field label="Incoterm"><Select options={['CIF', 'FOB', 'EXW', 'DAP']} /></Field>
                </div>
              </Card>
              <Card header={<span className="hc-label">Fulfilment</span>}>
                <RadioGroup name="fulfilment" value={fulfilment} onChange={setFulfilment} options={[
                  { value: 'deliver', label: 'Ship to my warehouse', description: 'Hills arranges the shipment and shares documents and tracking.' },
                  { value: 'store', label: 'Store with Hills', description: 'Stays in the bonded warehouse; request scheduled releases later.' }]} />
              </Card>
              <Card header={<span className="hc-label">Notes for operations</span>}>
                <Textarea rows={3} placeholder="Anything the warehouse or logistics team should know" />
              </Card>
            </>
          )}
          {step === 2 && (
            <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Proforma issued">
              Your proforma is ready in Invoices & documents. Pay by bank transfer using the reference on the invoice, then upload the proof.
            </InlineAlert>
          )}
        </div>
        <Card header={<span className="hc-label">Summary</span>} style={{ position: 'sticky', top: 'var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[['2 lots · 100 bags', 'USD 30,960'], ['Handling & documentation', 'USD 620'], ['Estimated freight', 'Quoted after review'], ['VAT', 'Per final policy']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-strong)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
            <div style={{ paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>Order total</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.625rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>USD 31,580</span>
            </div>
            {step === 1 && <Checkbox checked={agreed} onChange={setAgreed} label="I accept the trading terms for this order" />}
            {step === 0 && <Button size="lg" fullWidth onClick={() => setStep(1)}>Review order</Button>}
            {step === 1 && <Button size="lg" fullWidth disabled={!agreed} onClick={() => setStep(2)}>Place order</Button>}
            {step === 2 && <Button size="lg" fullWidth onClick={() => onNavigate('order')}>Open order</Button>}
          </div>
        </Card>
      </div>
    </>
  );
}

Object.assign(window, { CartCheckout });
