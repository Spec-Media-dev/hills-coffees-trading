const { Card, Timeline, StatusBadge, InvoiceCard, PaymentProofCard, DocumentRow, Button, Tabs, Icon, Dialog, FileUpload, Field, InlineAlert } = window.HillsCoffeeDesignSystem_ca006d;

function BuyerOrderDetail({ onNavigate }) {
  const [tab, setTab] = React.useState('summary');
  const [upload, setUpload] = React.useState(false);
  return (
    <>
      <PageHead title="HC-2026-0418" subtitle="Placed 4 Sep 2026 · Abyssinia Exports · 2 lots, 480 bags"
        crumbs={[{ key: 'orders', label: 'My orders' }, { label: 'HC-2026-0418' }]} onNavigate={() => onNavigate('dashboard')}
        actions={<><StatusBadge status="paymentPending" /><Button onClick={() => setUpload(true)}>Upload payment proof</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(320px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'summary', label: 'Summary' }, { value: 'docs', label: 'Documents', count: 3 }, { value: 'activity', label: 'Activity' }]} />
          {tab === 'summary' && (
            <>
              <Card padding="none" header={<span className="hc-label">Line items</span>}>
                <div>
                  {[['Yirgacheffe Kochere Lot 14', 'Hills Coffee', '40 bags · 2,400 kg', 'USD 11,520'],
                    ['Guji Hambela Natural', 'Abyssinia Exports', '60 bags · 3,600 kg', 'USD 19,440']].map(([n, s, q, t]) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{n}</span>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{s} · {q}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{t}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card header={<span className="hc-label">Order timeline</span>}>
                <Timeline items={[
                  { label: 'Order placed', timestamp: '4 Sep 2026, 11:20' },
                  { label: 'Proforma issued', timestamp: '4 Sep 2026, 11:24', meta: <StatusBadge status="quoted" size="sm" /> },
                  { label: 'Awaiting payment', state: 'current', timestamp: 'Due 11 Sep 2026', description: 'Transfer using reference HC-2026-0418.' },
                  { label: 'Payment confirmed', state: 'todo' },
                  { label: 'Allocated & dispatched', state: 'todo' },
                  { label: 'Delivered', state: 'todo' },
                ]} />
              </Card>
            </>
          )}
          {tab === 'docs' && (
            <Card padding="none">
              <DocumentRow name="proforma-HC-2026-0418.pdf" kind="Proforma invoice" issuedOn="4 Sep 2026" amount="USD 138,240" icon={<Icon name="file-text" size={18} />} onPreview={() => {}} onDownload={() => {}} />
              <DocumentRow name="lot-14-spec-sheet.pdf" kind="Specification sheet" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
              <DocumentRow name="final-invoice.pdf" kind="Final / tax invoice" issuedOn="Issued after payment" icon={<Icon name="file-clock" size={18} />} status={<StatusBadge status="draft" size="sm" label="Not issued" />} />
            </Card>
          )}
          {tab === 'activity' && (
            <Card><Timeline items={[
              { label: 'Order created by Ahmed Fouad', timestamp: '4 Sep 2026, 11:20' },
              { label: 'Proforma generated automatically', timestamp: '4 Sep 2026, 11:24' },
              { label: 'Payment reminder sent', timestamp: '6 Sep 2026, 08:00' },
            ]} /></Card>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <InvoiceCard number="PI-2026-0418" issuedOn="4 Sep 2026" dueOn="11 Sep 2026" amount="138,240"
            status={<StatusBadge status="paymentPending" size="sm" />}
            lines={[{ label: '2 lots · 480 bags', value: 'USD 136,000' }, { label: 'Handling & documentation', value: 'USD 2,240' }]}
            instructions={'Beneficiary: Hills Coffee Trading FZ-LLC\nBank: Emirates NBD, Dubai\nIBAN: AE00 0000 0000 0000 0000 000\nReference: HC-2026-0418'}
            actions={<><Button size="sm" onClick={() => setUpload(true)}>Upload proof</Button><Button size="sm" variant="outline">Download PDF</Button></>} />
          <PaymentProofCard fileName="No proof uploaded yet" note="Upload the SWIFT copy or transfer receipt so finance can match the payment." status={<StatusBadge status="draft" size="sm" label="Awaiting upload" />} />
        </div>
      </div>
      <Dialog open={upload} onClose={() => setUpload(false)} title="Upload payment proof"
        description="Attach the SWIFT copy or bank receipt showing reference HC-2026-0418."
        footer={<><Button variant="text" onClick={() => setUpload(false)}>Cancel</Button><Button onClick={() => setUpload(false)}>Submit for verification</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <InlineAlert tone="info" icon={<Icon name="info" size={16} />}>Whether proof upload is required is a pending commercial decision — the flow works either way.</InlineAlert>
          <Field label="Transfer document" required><FileUpload icon={<Icon name="upload" size={18} />} label="Drop the SWIFT copy or browse" hint="PDF or JPG · up to 10 MB" /></Field>
        </div>
      </Dialog>
    </>
  );
}

Object.assign(window, { BuyerOrderDetail });
