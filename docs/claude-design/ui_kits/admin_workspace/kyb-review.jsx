const { Card, StatusBadge, Timeline, DocumentCard, Button, InlineAlert, Icon, Field, Textarea, Dialog, ConfirmationModal, Tabs, Stepper } = window.HillsCoffeeDesignSystem_ca006d;

function AdminKybReview({ onBack }) {
  const [tab, setTab] = React.useState('company');
  const [askOpen, setAskOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  return (
    <>
      <PageHead title="Nile Traders LLC" subtitle="Buyer application · submitted 2 Sep 2026"
        actions={<><Button variant="text" onClick={onBack}>Back to queue</Button><Button variant="secondary" onClick={() => setAskOpen(true)}>Request more info</Button><Button variant="destructive" onClick={() => setRejectOpen(true)}>Reject</Button><Button>Approve buyer</Button></>} />
      <InlineAlert tone="warning" title="One document needs attention" icon={<Icon name="triangle-alert" size={18} />}>
        The uploaded trade licence expired in June 2026. Approving now would activate trading on an expired licence.
      </InlineAlert>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'company', label: 'Company' }, { value: 'ownership', label: 'Ownership' }, { value: 'documents', label: 'Documents', count: 4 }, { value: 'agreements', label: 'Agreements' }]} />
          {tab === 'company' && (
            <Card>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--space-5)' }}>
                {[['Legal name', 'Nile Traders LLC'], ['Registration no.', 'EG-4471-2019'], ['Jurisdiction', 'Egypt'], ['Trade licence', '4471-CAI (expired)'], ['Tax / VAT', 'EG-VAT-882931'], ['Activity', 'Green coffee import & roasting'], ['Registered address', '14 Nile Corniche, Cairo'], ['Work email', 'ops@niletraders.example']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</dt>
                    <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-strong)', fontWeight: 'var(--weight-medium)' }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {tab === 'ownership' && (
            <Card><Stepper orientation="vertical" current={3} steps={[{ label: 'Ahmed Fouad — 55% UBO', hint: 'Passport verified' }, { label: 'Mona Said — 30% UBO', hint: 'Passport verified' }, { label: 'Karim Adel — director', hint: 'Board resolution on file' }, { label: 'Authorised signatory', hint: 'Signature specimen missing', state: 'error' }]} /></Card>
          )}
          {tab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <DocumentCard name="trade-licence-2026.pdf" kind="Trade licence" size="1.4 MB" uploadedOn="2 Sep 2026" icon={<Icon name="file-text" size={20} />} status={<StatusBadge status="rejected" size="sm" />} actions={<Button size="sm" variant="outline">Preview</Button>} />
              <DocumentCard name="commercial-registration.pdf" kind="Commercial registration" size="820 KB" uploadedOn="2 Sep 2026" icon={<Icon name="file-text" size={20} />} status={<StatusBadge status="approved" size="sm" />} actions={<Button size="sm" variant="outline">Preview</Button>} />
              <DocumentCard name="vat-certificate.pdf" kind="Tax certificate" size="410 KB" uploadedOn="2 Sep 2026" icon={<Icon name="file-text" size={20} />} status={<StatusBadge status="approved" size="sm" />} actions={<Button size="sm" variant="outline">Preview</Button>} />
              <DocumentCard name="bank-letter.pdf" kind="Banking evidence" size="220 KB" uploadedOn="2 Sep 2026" icon={<Icon name="file-text" size={20} />} status={<StatusBadge status="review" size="sm" />} actions={<Button size="sm" variant="outline">Preview</Button>} />
            </div>
          )}
          {tab === 'agreements' && (
            <Card><Timeline items={[{ label: 'Marketplace terms accepted', timestamp: '2 Sep 2026, 10:12' }, { label: 'Privacy policy accepted', timestamp: '2 Sep 2026, 10:12' }, { label: 'Delivery acknowledgment accepted', timestamp: '2 Sep 2026, 10:13' }]} /></Card>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Application status</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <StatusBadge status="review" />
              <Timeline items={[{ label: 'Draft created', timestamp: '30 Aug 2026' }, { label: 'Submitted', timestamp: '2 Sep 2026' }, { label: 'Under review', state: 'current', timestamp: '3 Sep 2026', description: 'Assigned to compliance' }, { label: 'Decision', state: 'todo' }]} />
            </div>
          </Card>
          <Card header={<span className="hc-label">Reviewer notes</span>}>
            <Field label="Internal note" hint="Visible to admins only"><Textarea rows={4} placeholder="Add context for the next reviewer" /></Field>
          </Card>
        </div>
      </div>
      <Dialog open={askOpen} onClose={() => setAskOpen(false)} title="Request more information"
        description="Name exactly what is missing and it will appear on the applicant's checklist."
        footer={<><Button variant="text" onClick={() => setAskOpen(false)}>Cancel</Button><Button onClick={() => setAskOpen(false)}>Send request</Button></>}>
        <Field label="Message to applicant"><Textarea rows={4} defaultValue={'Please upload a valid trade licence — the copy on file expired in June 2026.\nAlso attach the authorised signatory specimen.'} /></Field>
      </Dialog>
      <ConfirmationModal open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={() => setRejectOpen(false)} tone="danger"
        title="Reject this application?" message="The applicant will be notified and must start a new application."
        consequence="Rejection is recorded in the audit trail with your admin account." confirmLabel="Reject application" />
    </>
  );
}

Object.assign(window, { AdminKybReview });
