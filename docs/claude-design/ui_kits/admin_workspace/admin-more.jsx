const { DataTable, StatusBadge, Tabs, SearchField, FilterChip, SortControl, Pagination, Card, Button, IconButton, Icon, EmptyState, InlineAlert, Timeline, DocumentRow, DocumentCard, ListingCard, ShipmentCard, KpiCard, Field, Input, Select, Combobox, Textarea, Switch, Checkbox, DatePicker, Dialog, ConfirmationModal, Drawer, FileUpload, Stepper } = window.HillsCoffeeDesignSystem_ca006d;

const money = (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>;

/* ---------- Users / Organizations ---------- */
const USERS = [
  { id: 1, org: 'Nile Traders LLC', role: 'Buyer', contact: 'Ahmed Fouad', country: 'Egypt', kyb: 'moreInfo', account: 'live', last: '6 Sep 2026' },
  { id: 2, org: 'Abyssinia Exports PLC', role: 'Seller', contact: 'Mesfin Tadesse', country: 'Ethiopia', kyb: 'approved', account: 'live', last: '6 Sep 2026' },
  { id: 3, org: 'Gulf Coffee Co.', role: 'Buyer', contact: 'Salem Al Marri', country: 'UAE', kyb: 'approved', account: 'live', last: '5 Sep 2026' },
  { id: 4, org: 'Levant Roasters', role: 'Buyer', contact: 'Rana Haddad', country: 'Jordan', kyb: 'rejected', account: 'suspended', last: '30 Aug 2026' },
  { id: 5, org: 'Kigali Lots Ltd', role: 'Seller', contact: 'Claude Uwase', country: 'Rwanda', kyb: 'approved', account: 'live', last: '2 Sep 2026' },
];

function AdminUsers() {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [suspend, setSuspend] = React.useState(null);
  const rows = USERS.filter((r) => (tab === 'all' || (tab === 'suspended' ? r.account === 'suspended' : r.role.toLowerCase() === tab)) && (r.org + r.contact).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Users & organizations" subtitle="Every buyer and seller account, its verification state and its account state."
        actions={<Button variant="secondary" iconLeft={<Icon name="download" size={16} />}>Export list</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 5 }, { value: 'buyer', label: 'Buyers', count: 3 }, { value: 'seller', label: 'Sellers', count: 2 }, { value: 'suspended', label: 'Suspended', count: 1 }]} />
        <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search organization or contact" style={{ maxWidth: 340 }} />
        <DataTable rows={rows}
          emptyState={<EmptyState icon={<Icon name="users" size={24} />} title="No accounts match" message="Adjust the filters or search a different organization." />}
          columns={[
            { key: 'org', header: 'Organization', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.org}</span> },
            { key: 'role', header: 'Role' },
            { key: 'contact', header: 'Primary contact' },
            { key: 'country', header: 'Jurisdiction' },
            { key: 'kyb', header: 'KYB', render: (r) => <StatusBadge status={r.kyb} size="sm" /> },
            { key: 'account', header: 'Account', render: (r) => <StatusBadge status={r.account === 'suspended' ? 'suspended' : 'live'} size="sm" label={r.account === 'suspended' ? 'Suspended' : 'Active'} /> },
            { key: 'last', header: 'Last activity', nowrap: true },
            { key: 'go', header: '', align: 'end', render: (r) => <Button size="sm" variant={r.account === 'suspended' ? 'outline' : 'destructive'} onClick={(e) => { e.stopPropagation(); setSuspend(r); }}>{r.account === 'suspended' ? 'Reinstate' : 'Suspend'}</Button> },
          ]} />
      </div>
      <ConfirmationModal open={!!suspend} onClose={() => setSuspend(null)} onConfirm={() => setSuspend(null)} tone={suspend && suspend.account === 'suspended' ? 'primary' : 'danger'}
        title={suspend ? (suspend.account === 'suspended' ? 'Reinstate ' + suspend.org + '?' : 'Suspend ' + suspend.org + '?') : ''}
        message={suspend && suspend.account === 'suspended' ? 'Trading functions are restored immediately.' : 'Trading functions pause immediately. Existing orders stay visible to both sides.'}
        consequence="The action is recorded in the audit trail against your admin account."
        confirmLabel={suspend && suspend.account === 'suspended' ? 'Reinstate account' : 'Suspend account'} />
    </>
  );
}

/* ---------- All listings ---------- */
const LISTINGS = [
  { id: 1, lot: 'Yirgacheffe Kochere Lot 14', owner: 'Hills Coffee', origin: 'Ethiopia', qty: '320 bags', price: 'USD 4.80', status: 'live', updated: '3 Sep 2026' },
  { id: 2, lot: 'Guji Hambela Natural', owner: 'Abyssinia Exports', origin: 'Ethiopia', qty: '140 bags', price: 'USD 5.40', status: 'live', updated: '3 Sep 2026' },
  { id: 3, lot: 'Sidamo Bensa Washed', owner: 'Abyssinia Exports', origin: 'Ethiopia', qty: '110 bags', price: 'USD 4.95', status: 'review', updated: '1 Sep 2026' },
  { id: 4, lot: 'Huila Pitalito Lot 07', owner: 'Andes Green SAS', origin: 'Colombia', qty: '180 bags', price: 'USD 5.15', status: 'live', updated: '31 Aug 2026' },
  { id: 5, lot: 'Limu Kossa Natural', owner: 'Abyssinia Exports', origin: 'Ethiopia', qty: '0 bags', price: 'USD 4.70', status: 'sold', updated: '20 Aug 2026' },
  { id: 6, lot: 'Harrar Longberry', owner: 'Abyssinia Exports', origin: 'Ethiopia', qty: '60 bags', price: 'USD 4.40', status: 'suspended', updated: '18 Aug 2026' },
];

function AdminListings({ onNavigate }) {
  const [tab, setTab] = React.useState('all');
  const [owner, setOwner] = React.useState(null);
  const rows = LISTINGS.filter((r) => (tab === 'all' || r.status === tab) && (!owner || (owner === 'hills' ? r.owner === 'Hills Coffee' : r.owner !== 'Hills Coffee')));
  return (
    <>
      <PageHead title="All listings" subtitle="Hills-owned lots and verified-seller lots in one lifecycle view."
        actions={<><Button variant="secondary" onClick={() => onNavigate('createHillsListing')} iconLeft={<Icon name="plus" size={16} />}>Create Hills listing</Button><Button onClick={() => onNavigate('listingReview')}>Open review queue</Button></>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 6 }, { value: 'review', label: 'Awaiting review', count: 1 }, { value: 'live', label: 'Live', count: 3 }, { value: 'sold', label: 'Sold', count: 1 }, { value: 'suspended', label: 'Suspended', count: 1 }]} />
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterChip label="Hills lots" selected={owner === 'hills'} onToggle={() => setOwner(owner === 'hills' ? null : 'hills')} />
          <FilterChip label="Seller lots" selected={owner === 'seller'} onToggle={() => setOwner(owner === 'seller' ? null : 'seller')} />
          <span style={{ marginInlineStart: 'auto' }}><SortControl value="updated" direction="desc" onChange={() => {}} onDirectionChange={() => {}} options={[{ value: 'updated', label: 'Last updated' }, { value: 'qty', label: 'Quantity' }, { value: 'price', label: 'Price / kg' }]} /></span>
        </div>
        <DataTable rows={rows} onRowClick={() => onNavigate('listingReview')}
          columns={[
            { key: 'lot', header: 'Lot', render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.lot}</span> },
            { key: 'owner', header: 'Owner' },
            { key: 'origin', header: 'Origin' },
            { key: 'qty', header: 'Available', nowrap: true },
            { key: 'price', header: 'Price / kg', align: 'end', numeric: true, nowrap: true },
            { key: 'updated', header: 'Updated', nowrap: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          ]} />
        <Pagination page={1} pageCount={12} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 148 listings'} />
      </div>
    </>
  );
}

/* ---------- Listing review ---------- */
function AdminListingReview({ onBack }) {
  const [ask, setAsk] = React.useState(false);
  const [reject, setReject] = React.useState(false);
  return (
    <>
      <PageHead title="Sidamo Bensa Washed" subtitle="Abyssinia Exports · submitted 1 Sep 2026"
        crumbs={[{ key: 'listings', label: 'All listings' }, { label: 'Sidamo Bensa Washed' }]} onNavigate={onBack}
        actions={<><Button variant="text" onClick={onBack}>Back</Button><Button variant="secondary" onClick={() => setAsk(true)}>Request changes</Button><Button variant="destructive" onClick={() => setReject(true)}>Reject</Button><Button>Approve & publish</Button></>} />
      <InlineAlert tone="warning" title="One required document is missing" icon={<Icon name="triangle-alert" size={18} />}>
        No warehouse holding certificate is attached. Publishing without it would list stock Hills cannot verify.
      </InlineAlert>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Submitted data</span>}>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-5)' }}>
              {[['Origin', 'Ethiopia · Sidamo'], ['Grade', 'G1'], ['Process', 'Washed'], ['Variety', 'Heirloom'], ['Harvest', '2025/26'], ['Moisture', '10.8%'], ['Quantity', '110 bags · 60kg'], ['Price', 'USD 4.95 / kg'], ['Warehouse', 'Addis Ababa bonded'], ['Min order', '20 bags']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</dt>
                  <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card padding="none" header={<span className="hc-label">Attached documents</span>}>
            <DocumentRow name="spec-sheet-sidamo.pdf" kind="Specification sheet" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onPreview={() => {}} />
            <DocumentRow name="cupping-notes.pdf" kind="Cupping notes" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onPreview={() => {}} />
            <DocumentRow name="holding-certificate.pdf" kind="Warehouse certificate" issuedOn="Not provided" icon={<Icon name="warehouse" size={18} />} status={<StatusBadge status="rejected" size="sm" label="Required" />} />
          </Card>
          <Card header={<span className="hc-label">Audit trail</span>}>
            <Timeline items={[
              { label: 'Draft created by Abyssinia Exports', timestamp: '28 Aug 2026' },
              { label: 'Submitted for review', timestamp: '1 Sep 2026, 14:02' },
              { label: 'Assigned to catalogue review', state: 'current', timestamp: '1 Sep 2026, 16:22' },
              { label: 'Decision', state: 'todo' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <span className="hc-label">Buyer preview</span>
          <ListingCard title="Sidamo Bensa Washed" origin="Ethiopia" region="Sidamo" grade="G1" process="Washed" harvest="2025/26"
            quantity="110 bags · 60kg" price="USD 4.95 / kg" seller="verified" sellerName="Abyssinia Exports"
            status={<StatusBadge status="review" size="sm" />} />
          <Card header={<span className="hc-label">Reviewer notes</span>}>
            <Field label="Internal note" hint="Visible to admins only"><Textarea rows={4} placeholder="Context for the next reviewer" /></Field>
          </Card>
        </div>
      </div>
      <Dialog open={ask} onClose={() => setAsk(false)} title="Request changes" description="Say exactly what the seller must change or attach."
        footer={<><Button variant="text" onClick={() => setAsk(false)}>Cancel</Button><Button onClick={() => setAsk(false)}>Send to seller</Button></>}>
        <Field label="Message to seller"><Textarea rows={4} defaultValue={'Attach the warehouse holding certificate for stack ST-14-B, then resubmit. Everything else is approved.'} /></Field>
      </Dialog>
      <ConfirmationModal open={reject} onClose={() => setReject(false)} onConfirm={() => setReject(false)} tone="danger"
        title="Reject this listing?" message="The seller must create a new listing to try again."
        consequence="Rejection is permanent for this record and is recorded in the audit trail." confirmLabel="Reject listing" />
    </>
  );
}

/* ---------- Create Hills listing ---------- */
function AdminCreateHillsListing({ onBack }) {
  const [step, setStep] = React.useState(0);
  const STEPS = [{ label: 'Coffee identity' }, { label: 'Origin & specs' }, { label: 'Quantity & pricing' }, { label: 'Warehouse & media' }, { label: 'Publish' }];
  return (
    <>
      <PageHead title="Create Hills listing" subtitle="Same data model as a seller listing, published under Hills Coffee ownership."
        crumbs={[{ key: 'listings', label: 'All listings' }, { label: 'New Hills lot' }]} onNavigate={onBack}
        actions={<><Button variant="secondary">Save draft</Button><Button onClick={onBack}>Publish listing</Button></>} />
      <Stepper current={step} onStepClick={setStep} steps={STEPS} />
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Card>
          {step === 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Lot name" required><Input defaultValue="Kochere Washed Lot 15" /></Field></div>
            <Field label="Coffee type" required><Select options={['Arabica', 'Robusta']} /></Field>
            <Field label="Variety" required><Combobox options={['Heirloom', 'Bourbon', 'Typica', 'SL28']} onChange={() => {}} /></Field>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Description" optional><Textarea rows={3} /></Field></div>
          </div>}
          {step === 1 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <Field label="Origin" required><Combobox options={['Ethiopia', 'Colombia', 'Kenya', 'Brazil']} onChange={() => {}} /></Field>
            <Field label="Region" required><Combobox options={['Yirgacheffe', 'Guji', 'Sidamo']} onChange={() => {}} /></Field>
            <Field label="Grade" required><Select options={['G1', 'G2', 'AA']} /></Field>
            <Field label="Process" required><Select options={['Washed', 'Natural', 'Honey']} /></Field>
            <Field label="Moisture (%)" required><Input defaultValue="10.2" /></Field>
            <Field label="Harvest year" required><Select options={['2025/26', '2024/25']} /></Field>
          </div>}
          {step === 2 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <Field label="Available bags" required><Input defaultValue="250" /></Field>
            <Field label="Minimum order" required><Input defaultValue="20" /></Field>
            <Field label="Price per kg" required><Input prefix="USD" defaultValue="4.85" /></Field>
            <Field label="Price basis" required><Select options={['Ex-warehouse', 'FOB', 'CIF']} /></Field>
            <div style={{ gridColumn: '1 / -1' }}><Switch label="Show price to guests" description="Off keeps the contract price behind buyer approval" /></div>
          </div>}
          {step === 3 && <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <Field label="Warehouse" required><Select options={['Jebel Ali, Dubai', 'Damietta, Egypt', 'Antwerp']} /></Field>
            <Field label="Lot photography" required hint="Documentary editorial, natural light"><FileUpload icon={<Icon name="image" size={18} />} label="Drop up to 6 images or browse" hint="JPG / PNG · up to 5 MB each" /></Field>
            <Field label="Specification sheet" required><FileUpload icon={<Icon name="file-text" size={18} />} /></Field>
          </div>}
          {step === 4 && <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Hills listings skip seller review">Publishing puts the lot live immediately under Hills Coffee ownership.</InlineAlert>
            <Checkbox checked label="Quantity confirmed against warehouse stock" />
            <Checkbox label="Pricing approved by commercial" />
          </div>}
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="text" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
            <span style={{ marginInlineStart: 'auto' }}>{step < STEPS.length - 1 ? <Button onClick={() => setStep(step + 1)}>Continue</Button> : <Button onClick={onBack}>Publish listing</Button>}</span>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'var(--space-5)' }}>
          <span className="hc-label">Buyer preview</span>
          <ListingCard title="Kochere Washed Lot 15" origin="Ethiopia" region="Yirgacheffe" grade="G1" process="Washed" harvest="2025/26" quantity="250 bags · 60kg" price="USD 4.85 / kg" seller="hills" status={<StatusBadge status="draft" size="sm" />} />
        </div>
      </div>
    </>
  );
}

/* ---------- Orders ---------- */
const AORDERS = [
  { id: 1, ref: 'HC-2026-0418', buyer: 'Nile Traders LLC', source: 'Abyssinia Exports', amount: 'USD 138,240', payment: 'paymentPending', fulfilment: 'draft' },
  { id: 2, ref: 'HC-2026-0411', buyer: 'Nile Traders LLC', source: 'Hills Coffee', amount: 'USD 34,560', payment: 'paid', fulfilment: 'inTransit' },
  { id: 3, ref: 'HC-2026-0409', buyer: 'Anatolia Coffee', source: 'Abyssinia Exports', amount: 'USD 21,600', payment: 'paid', fulfilment: 'picking' },
  { id: 4, ref: 'HC-2026-0402', buyer: 'Gulf Coffee Co.', source: 'Hills Coffee', amount: 'USD 86,400', payment: 'paid', fulfilment: 'delivered' },
  { id: 5, ref: 'HC-2026-0388', buyer: 'Levant Roasters', source: 'Kigali Lots Ltd', amount: 'USD 21,960', payment: 'refunded', fulfilment: 'cancelled' },
];

function AdminOrders({ onNavigate }) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const rows = AORDERS.filter((r) => (tab === 'all' || (tab === 'unpaid' ? r.payment === 'paymentPending' : tab === 'fulfilment' ? ['picking', 'inTransit', 'draft'].includes(r.fulfilment) : r.payment === 'refunded')) && (r.ref + r.buyer + r.source).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Orders" subtitle="Every order across buyers and sources, with payment and fulfilment tracked separately."
        actions={<DatePicker range icon={<Icon name="calendar" size={16} />} />} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 5 }, { value: 'unpaid', label: 'Awaiting payment', count: 1 }, { value: 'fulfilment', label: 'In fulfilment', count: 3 }, { value: 'refunded', label: 'Refunded', count: 1 }]} />
        <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search order, buyer or source" style={{ maxWidth: 340 }} />
        <DataTable rows={rows} onRowClick={() => onNavigate('orderDetail')}
          columns={[
            { key: 'ref', header: 'Order', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ref}</span> },
            { key: 'buyer', header: 'Buyer' },
            { key: 'source', header: 'Source' },
            { key: 'amount', header: 'Amount', align: 'end', numeric: true },
            { key: 'payment', header: 'Payment', render: (r) => <StatusBadge status={r.payment} size="sm" /> },
            { key: 'fulfilment', header: 'Fulfilment', render: (r) => <StatusBadge status={r.fulfilment} size="sm" /> },
          ]} />
        <Pagination page={1} pageCount={9} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 106 orders'} />
      </div>
    </>
  );
}

/* ---------- Order detail ---------- */
function AdminOrderDetail({ onBack }) {
  const [tab, setTab] = React.useState('commercial');
  return (
    <>
      <PageHead title="HC-2026-0418" subtitle="Nile Traders LLC · source Abyssinia Exports · placed 4 Sep 2026"
        crumbs={[{ key: 'orders', label: 'Orders' }, { label: 'HC-2026-0418' }]} onNavigate={onBack}
        actions={<><StatusBadge status="paymentPending" /><Button variant="secondary">Issue final invoice</Button><Button>Confirm payment</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(320px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'commercial', label: 'Commercial' }, { value: 'payment', label: 'Payment' }, { value: 'documents', label: 'Documents', count: 3 }, { value: 'notes', label: 'Notes & activity' }]} />
          {tab === 'commercial' && <Card>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-5)' }}>
              {[['Buyer', 'Nile Traders LLC'], ['Source', 'Abyssinia Exports'], ['Lots', '2'], ['Quantity', '480 bags'], ['Gross', 'USD 136,000'], ['Handling', 'USD 2,240'], ['Total', 'USD 138,240'], ['Incoterm', 'CIF'], ['Fulfilment', 'Ship to buyer warehouse'], ['Due date', '11 Sep 2026']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</dt>
                  <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>}
          {tab === 'payment' && <Card header={<span className="hc-label">Payment timeline</span>}>
            <Timeline items={[
              { label: 'Proforma issued', timestamp: '4 Sep 2026, 11:24', meta: <StatusBadge status="quoted" size="sm" /> },
              { label: 'Payment proof uploaded by buyer', timestamp: '5 Sep 2026, 16:02', meta: <StatusBadge status="review" size="sm" /> },
              { label: 'Awaiting finance verification', state: 'current', description: 'Match reference HC-2026-0418 against the bank statement.' },
              { label: 'Payment confirmed', state: 'todo' },
              { label: 'Seller settlement released', state: 'todo' },
            ]} />
          </Card>}
          {tab === 'documents' && <Card padding="none">
            <DocumentRow name="proforma-HC-2026-0418.pdf" kind="Proforma invoice" issuedOn="4 Sep 2026" amount="USD 138,240" icon={<Icon name="file-text" size={18} />} onPreview={() => {}} onDownload={() => {}} />
            <DocumentRow name="swift-copy-0418.pdf" kind="Payment proof" issuedOn="5 Sep 2026" icon={<Icon name="banknote" size={18} />} status={<StatusBadge status="review" size="sm" />} onPreview={() => {}} />
            <DocumentRow name="final-invoice.pdf" kind="Final / tax invoice" issuedOn="After payment" icon={<Icon name="file-clock" size={18} />} status={<StatusBadge status="draft" size="sm" label="Not issued" />} />
          </Card>}
          {tab === 'notes' && <Card header={<span className="hc-label">Internal notes</span>}>
            <Field label="Add a note"><Textarea rows={3} placeholder="Context for finance or logistics" /></Field>
            <div style={{ marginTop: 'var(--space-5)' }}><Timeline items={[
              { label: 'Order created', timestamp: '4 Sep 2026, 11:20', description: 'By buyer contact Ahmed Fouad' },
              { label: 'Payment reminder sent', timestamp: '6 Sep 2026, 08:00', description: 'Automated' },
            ]} /></div>
          </Card>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Seller settlement</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[['Gross sale', 'USD 19,440'], ['Hills fee (5%)', '− USD 972'], ['Seller net', 'USD 18,468']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span><span style={{ color: 'var(--text-strong)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              ))}
              <InlineAlert tone="info" icon={<Icon name="info" size={16} />}>Buyer total and seller settlement are separate figures and are never shown as one number.</InlineAlert>
            </div>
          </Card>
          <ShipmentCard shipmentId="SHP-4482" orderReference="HC-2026-0418" eta="Awaiting payment" destination="Damietta, Egypt" quantity="480 bags" status={<StatusBadge status="draft" size="sm" />} />
        </div>
      </div>
    </>
  );
}

/* ---------- Shipments queue ---------- */
const ASHIPS = [
  { id: 1, ship: 'SHP-4482', order: 'HC-2026-0418', wh: 'Addis Ababa bonded', qty: '480 bags', dest: 'Damietta, Egypt', eta: 'Awaiting payment', status: 'draft' },
  { id: 2, ship: 'SHP-4471', order: 'HC-2026-0411', wh: 'Jebel Ali, Dubai', qty: '120 bags', dest: 'Damietta, Egypt', eta: '18 Sep 2026', status: 'dispatched' },
  { id: 3, ship: 'SHP-4468', order: 'HC-2026-0409', wh: 'Addis Ababa bonded', qty: '80 bags', dest: 'Beirut', eta: '20 Sep 2026', status: 'picking' },
  { id: 4, ship: 'SHP-4460', order: 'HC-2026-0402', wh: 'Jebel Ali, Dubai', qty: '300 bags', dest: 'Damietta, Egypt', eta: 'Delivered 22 Aug', status: 'delivered' },
  { id: 5, ship: 'SHP-4441', order: 'HC-2026-0388', wh: 'Kigali bonded', qty: '60 bags', dest: 'Beirut', eta: 'Exception', status: 'failed' },
];

function AdminShipments({ onNavigate }) {
  const [tab, setTab] = React.useState('open');
  const rows = ASHIPS.filter((s) => tab === 'all' || (tab === 'open' ? !['delivered', 'failed'].includes(s.status) : tab === 'exceptions' ? s.status === 'failed' : s.status === 'delivered'));
  return (
    <>
      <PageHead title="Shipments" subtitle="Queue from requested to delivered, with exceptions surfaced separately."
        actions={<Button variant="secondary" iconLeft={<Icon name="download" size={16} />}>Export queue</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Open', count: 3 }, { value: 'exceptions', label: 'Exceptions', count: 1 }, { value: 'delivered', label: 'Delivered', count: 1 }, { value: 'all', label: 'All', count: 5 }]} />
        <DataTable rows={rows} onRowClick={() => onNavigate('shipmentDetail')}
          columns={[
            { key: 'ship', header: 'Shipment', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ship}</span> },
            { key: 'order', header: 'Order', nowrap: true },
            { key: 'wh', header: 'Warehouse' },
            { key: 'qty', header: 'Quantity' },
            { key: 'dest', header: 'Destination' },
            { key: 'eta', header: 'ETA', nowrap: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          ]} />
      </div>
    </>
  );
}

/* ---------- Shipment detail (admin logistics) ---------- */
function AdminShipmentDetail({ onBack }) {
  const [status, setStatus] = React.useState('dispatched');
  const [exception, setException] = React.useState(false);
  return (
    <>
      <PageHead title="SHP-4471" subtitle="Order HC-2026-0411 · 120 bags · Jebel Ali → Damietta"
        crumbs={[{ key: 'shipments', label: 'Shipments' }, { label: 'SHP-4471' }]} onNavigate={onBack}
        actions={<><StatusBadge status={status} /><Button variant="secondary" onClick={() => setException(true)}>Record exception</Button><Button onClick={() => setStatus('delivered')}>Mark delivered</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(320px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Logistics information</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Status" required><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'draft', label: 'Draft' }, { value: 'quoted', label: 'Requested' }, { value: 'reserved', label: 'Reserved' }, { value: 'picking', label: 'Picking' }, { value: 'dispatched', label: 'Dispatched' }, { value: 'delivered', label: 'Delivered' }, { value: 'failed', label: 'Failed' }]} /></Field>
              <Field label="Carrier"><Input defaultValue="MSC" /></Field>
              <Field label="Tracking reference"><Input defaultValue="MSCU4471882" /></Field>
              <Field label="Incoterm"><Select options={['CIF', 'FOB', 'EXW', 'DAP']} /></Field>
              <Field label="Dispatch date"><DatePicker icon={<Icon name="calendar" size={16} />} defaultValue="2026-09-12" /></Field>
              <Field label="ETA"><DatePicker icon={<Icon name="calendar" size={16} />} defaultValue="2026-09-18" /></Field>
              <Field label="Origin warehouse"><Select options={['Jebel Ali, Dubai', 'Addis Ababa bonded', 'Kigali bonded']} /></Field>
              <Field label="Confirmed quantity"><Input defaultValue="120" suffix="bags" /></Field>
            </div>
            <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)' }}><Button>Save shipment</Button><Button variant="text">Discard</Button></div>
          </Card>
          <Card header={<span className="hc-label">Upload documents</span>}>
            <Field label="Shipping document" hint="Bill of lading, packing list or proof of delivery"><FileUpload icon={<Icon name="upload" size={18} />} label="Drop a document or browse" hint="PDF or JPG · up to 10 MB" /></Field>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Timeline</span>}>
            <Timeline items={[
              { label: 'Requested', timestamp: '8 Sep 2026' }, { label: 'Confirmed', timestamp: '9 Sep 2026' },
              { label: 'Reserved', timestamp: '10 Sep 2026' }, { label: 'Picking', timestamp: '11 Sep 2026' },
              { label: 'Dispatched', state: status === 'delivered' ? 'done' : 'current', timestamp: '12 Sep 2026, 06:40' },
              { label: 'Delivered', state: status === 'delivered' ? 'done' : 'todo', timestamp: status === 'delivered' ? '18 Sep 2026' : undefined },
            ]} />
          </Card>
          <Card padding="none" header={<span className="hc-label">Documents</span>}>
            <DocumentRow name="bill-of-lading-4471.pdf" kind="Bill of lading" issuedOn="12 Sep 2026" icon={<Icon name="ship" size={18} />} onDownload={() => {}} />
            <DocumentRow name="packing-list-4471.pdf" kind="Packing list" issuedOn="11 Sep 2026" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
            <DocumentRow name="pod-4471.jpg" kind="Proof of delivery" issuedOn="On delivery" icon={<Icon name="image" size={18} />} status={<StatusBadge status="picking" size="sm" label="Pending" />} />
          </Card>
        </div>
      </div>
      <Dialog open={exception} onClose={() => setException(false)} title="Record an exception" description="Log what went wrong and the next action owner."
        footer={<><Button variant="text" onClick={() => setException(false)}>Cancel</Button><Button variant="destructive" onClick={() => setException(false)}>Record exception</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Field label="Exception type" required><Select options={['Customs hold', 'Quantity discrepancy', 'Damage', 'Carrier delay', 'Failed delivery']} /></Field>
          <Field label="What happened" required><Textarea rows={3} /></Field>
          <Field label="Next action owner" required><Select options={['Hills logistics', 'Seller', 'Buyer', 'Carrier']} /></Field>
        </div>
      </Dialog>
    </>
  );
}

/* ---------- Catalog / coffee data ---------- */
function AdminCatalog() {
  const [tab, setTab] = React.useState('origins');
  const DATA = {
    origins: { cols: ['Origin', 'Regions', 'Live lots', 'Status'], rows: [['Ethiopia', '5', '42', 'live'], ['Colombia', '4', '31', 'live'], ['Kenya', '3', '18', 'live'], ['Rwanda', '2', '12', 'live'], ['Yemen', '1', '0', 'draft']] },
    regions: { cols: ['Region', 'Origin', 'Live lots', 'Status'], rows: [['Yirgacheffe', 'Ethiopia', '14', 'live'], ['Guji', 'Ethiopia', '11', 'live'], ['Huila', 'Colombia', '9', 'live'], ['Nyeri', 'Kenya', '6', 'live']] },
    varieties: { cols: ['Variety', 'Origins', 'Live lots', 'Status'], rows: [['Heirloom', 'Ethiopia', '28', 'live'], ['Caturra', 'Colombia', '12', 'live'], ['SL28', 'Kenya', '6', 'live'], ['Bourbon', 'Rwanda', '4', 'live']] },
    warehouses: { cols: ['Warehouse', 'Location', 'Stored bags', 'Status'], rows: [['Jebel Ali bonded', 'Dubai, UAE', '1,240', 'live'], ['Damietta', 'Egypt', '620', 'live'], ['Addis Ababa bonded', 'Ethiopia', '410', 'live'], ['Antwerp', 'Belgium', '0', 'draft']] },
    taxonomy: { cols: ['Value', 'Group', 'Used by', 'Status'], rows: [['Washed', 'Processing', '61 lots', 'live'], ['Natural', 'Processing', '48 lots', 'live'], ['Honey', 'Processing', '11 lots', 'live'], ['Organic', 'Certification', '9 lots', 'live'], ['Rainforest Alliance', 'Certification', '4 lots', 'live']] },
  };
  const d = DATA[tab];
  return (
    <>
      <PageHead title="Catalog & coffee data" subtitle="The reference data every listing draws on: origins, regions, varieties, warehouses and taxonomy."
        actions={<Button iconLeft={<Icon name="plus" size={16} />}>Add entry</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'origins', label: 'Origins', count: 5 }, { value: 'regions', label: 'Regions', count: 4 }, { value: 'varieties', label: 'Varieties', count: 4 }, { value: 'warehouses', label: 'Warehouses', count: 4 }, { value: 'taxonomy', label: 'Taxonomy', count: 5 }]} />
        <DataTable rows={d.rows.map((r, i) => ({ id: i, a: r[0], b: r[1], c: r[2], status: r[3] }))}
          columns={[
            { key: 'a', header: d.cols[0], render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.a}</span> },
            { key: 'b', header: d.cols[1] },
            { key: 'c', header: d.cols[2], align: 'end', numeric: true },
            { key: 'status', header: d.cols[3], render: (r) => <StatusBadge status={r.status} size="sm" /> },
            { key: 'go', header: '', align: 'end', render: () => <Button size="sm" variant="outline">Edit</Button> },
          ]} />
      </div>
    </>
  );
}

/* ---------- Content / CMS ---------- */
function AdminContent() {
  const [tab, setTab] = React.useState('pages');
  return (
    <>
      <PageHead title="Content & CMS" subtitle="Public pages, knowledge articles, media library and announcement banners."
        actions={<Button iconLeft={<Icon name="plus" size={16} />}>New {tab === 'articles' ? 'article' : 'page'}</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pages', label: 'Pages', count: 12 }, { value: 'articles', label: 'Articles', count: 8 }, { value: 'media', label: 'Media', count: 0 }, { value: 'banners', label: 'Announcements', count: 1 }]} />
        {tab === 'pages' && <DataTable rows={[
          { id: 1, title: 'Home', path: '/', updated: '5 Sep 2026', status: 'live' },
          { id: 2, title: 'Green coffee offers', path: '/marketplace', updated: '5 Sep 2026', status: 'live' },
          { id: 3, title: 'Coffee origins', path: '/origins', updated: '2 Sep 2026', status: 'live' },
          { id: 4, title: 'Shipping & storage', path: '/shipping', updated: '28 Aug 2026', status: 'live' },
          { id: 5, title: 'Returns & refunds', path: '/returns', updated: 'Draft', status: 'draft' },
        ]} columns={[
          { key: 'title', header: 'Page', render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.title}</span> },
          { key: 'path', header: 'Path' }, { key: 'updated', header: 'Updated', nowrap: true },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          { key: 'go', header: '', align: 'end', render: () => <Button size="sm" variant="outline">Edit</Button> },
        ]} />}
        {tab === 'articles' && <DataTable rows={[
          { id: 1, title: 'Reading a green coffee spec sheet', cat: 'Sourcing fundamentals', updated: '4 Sep 2026', status: 'live' },
          { id: 2, title: 'How KYB works for buyers', cat: 'Trading with Hills', updated: '1 Sep 2026', status: 'live' },
          { id: 3, title: 'Incoterms for green coffee', cat: 'Logistics', updated: 'Draft', status: 'draft' },
        ]} columns={[
          { key: 'title', header: 'Article', render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.title}</span> },
          { key: 'cat', header: 'Category' }, { key: 'updated', header: 'Updated', nowrap: true },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          { key: 'go', header: '', align: 'end', render: () => <Button size="sm" variant="outline">Edit</Button> },
        ]} />}
        {tab === 'media' && <EmptyState icon={<Icon name="image" size={24} />} title="No media uploaded" message="Origin, harvest, warehouse and inspection photography goes here. Nothing was supplied with the brand kit." action={<Button>Upload media</Button>} />}
        {tab === 'banners' && <Card header={<span className="hc-label">Site announcement</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            <div style={{ gridColumn: '1 / -1' }}><Switch checked label="Show announcement bar" description="Appears above the public header on every page" /></div>
            <Field label="Message (English)"><Input defaultValue="New Ethiopian arrivals — 2025/26 harvest now landed in Jebel Ali." /></Field>
            <Field label="Message (Arabic)"><Input defaultValue="وصول جديد من إثيوبيا — حصاد 2025/26 متوفر الآن في جبل علي." /></Field>
            <Field label="Link"><Input defaultValue="/marketplace" /></Field>
            <Field label="Ends on"><DatePicker icon={<Icon name="calendar" size={16} />} defaultValue="2026-10-01" /></Field>
          </div>
          <div style={{ marginTop: 'var(--space-5)' }}><Button>Publish announcement</Button></div>
        </Card>}
      </div>
    </>
  );
}

/* ---------- Site appearance / brand ---------- */
function AdminAppearance() {
  return (
    <>
      <PageHead title="Site appearance & brand" subtitle="Approved brand assets and contact details. Core colours and font rules are locked." />
      <InlineAlert tone="warning" title="Brand rules are not editable here" icon={<Icon name="lock" size={18} />}>
        Colour tokens, type roles and logo geometry come from the Hills Coffee Brand Guidelines. This screen only swaps approved asset files and contact information.
      </InlineAlert>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Logo assets</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--brand-cream)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
                  <img src="../../assets/logo-horizontal.png" alt="Hills Coffee horizontal logo" style={{ height: 44 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>Horizontal lockup — in use</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>Minimum digital width 150px</span>
                </div>
                <span style={{ marginInlineStart: 'auto' }}><Button size="sm" variant="outline">Replace</Button></span>
              </div>
              <Field label="Stacked lockup" hint="Not supplied — minimum 100px when uploaded"><FileUpload icon={<Icon name="upload" size={18} />} label="Upload the stacked variant" hint="PNG or SVG" /></Field>
              <Field label="Dark-surface / monochrome variant" hint="Required so dark chrome stops using a cream plate"><FileUpload icon={<Icon name="upload" size={18} />} label="Upload the official dark variant" hint="PNG or SVG" /></Field>
              <Field label="Favicon"><FileUpload icon={<Icon name="upload" size={18} />} label="Upload a 512×512 mark" hint="PNG" /></Field>
            </div>
          </Card>
          <Card header={<span className="hc-label">Hero media</span>}>
            <Field label="Home hero image" hint="Documentary editorial: origin, harvest, warehouse or inspection"><FileUpload icon={<Icon name="image" size={18} />} label="Upload hero photography" hint="JPG · 2400px wide minimum" /></Field>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Contact & social</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Field label="Dubai phone"><Input defaultValue="+971 50 123 4567" /></Field>
              <Field label="Egypt phone"><Input defaultValue="+20 10 1234 5678" /></Field>
              <Field label="WhatsApp"><Input defaultValue="+971 50 123 4567" /></Field>
              <Field label="Trade email"><Input defaultValue="trade@hillscoffees.com" /></Field>
              <Field label="LinkedIn"><Input defaultValue="linkedin.com/company/hills-coffee" /></Field>
            </div>
          </Card>
          <Card header={<span className="hc-label">Locked brand tokens</span>}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {[['Deep Forest Green', '#173C32'], ['Warm Cream', '#EEE4D1'], ['Golden Ochre', '#CE8A39'], ['Burnt Orange', '#A44819']].map(([n, hex]) => (
                <div key={hex} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 'var(--radius-xs)', background: hex, border: '1px solid var(--border)' }} />
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-strong)' }}>{n}</span>
                  <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{hex}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- Activity / audit ---------- */
const AUDIT = [
  { id: 1, actor: 'adminhills@gmail.com', action: 'UPDATE', entity: 'kyb_applications', target: 'Nile Traders LLC', when: 'Sep 6, 2026, 09:12 AM' },
  { id: 2, actor: 'adminhills@gmail.com', action: 'INSERT', entity: 'site_pages', target: 'Returns & refunds', when: 'Sep 5, 2026, 12:02 PM' },
  { id: 3, actor: 'adminhills@gmail.com', action: 'DELETE', entity: 'site_pages', target: 'Old shipping page', when: 'Sep 5, 2026, 12:01 PM' },
  { id: 4, actor: 'finance@hillscoffees.com', action: 'UPDATE', entity: 'payments', target: 'HC-2026-0411', when: 'Sep 4, 2026, 04:40 PM' },
  { id: 5, actor: 'ops@hillscoffees.com', action: 'UPDATE', entity: 'shipments', target: 'SHP-4471', when: 'Sep 4, 2026, 11:20 AM' },
  { id: 6, actor: 'adminhills@gmail.com', action: 'DELETE', entity: 'articles', target: 'Draft article', when: 'Sep 5, 2026, 11:14 AM' },
];

function AdminAudit() {
  const [q, setQ] = React.useState('');
  const [entity, setEntity] = React.useState(null);
  const rows = AUDIT.filter((r) => (!entity || r.entity === entity) && (r.actor + r.target + r.entity).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Activity & audit" subtitle="Who did what, and when, across KYB, listings, orders, payments and shipments."
        actions={<><DatePicker range icon={<Icon name="calendar" size={16} />} /><Button variant="secondary" iconLeft={<Icon name="download" size={16} />}>Export</Button></>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search actor, entity or target" style={{ maxWidth: 340 }} />
          {['kyb_applications', 'listings', 'payments', 'shipments', 'site_pages'].map((e) => (
            <FilterChip key={e} label={e} selected={entity === e} onToggle={() => setEntity(entity === e ? null : e)} />
          ))}
        </div>
        <DataTable dense rows={rows}
          emptyState={<EmptyState icon={<Icon name="history" size={24} />} title="No activity matches" message="Widen the date range or clear the entity filter." />}
          columns={[
            { key: 'action', header: 'Action', nowrap: true, render: (r) => <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 'var(--weight-bold)', letterSpacing: '.04em', color: 'var(--text-strong)' }}>{r.action}</span> },
            { key: 'entity', header: 'Entity', render: (r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', color: 'var(--accent-text)' }}>{r.entity}</span> },
            { key: 'target', header: 'Target' },
            { key: 'actor', header: 'Actor' },
            { key: 'when', header: 'When', align: 'end', nowrap: true },
          ]} />
        <Pagination page={1} pageCount={40} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 2,140 events'} />
      </div>
    </>
  );
}

/* ---------- Admin settings ---------- */
function AdminSettings() {
  const [tab, setTab] = React.useState('profile');
  return (
    <>
      <PageHead title="Admin settings" subtitle="Your admin profile, security, notification routing and workspace preferences." />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,240px) minmax(0,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Card padding="sm">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[['profile', 'Profile', 'user'], ['security', 'Security', 'lock'], ['notifications', 'Notification routing', 'bell'], ['workspace', 'Workspace', 'palette']].map(([k, l, ic]) => (
              <button key={k} onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 44, padding: '0 var(--space-3)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'start', background: tab === k ? 'color-mix(in oklab, var(--primary) 10%, transparent)' : 'transparent', color: 'var(--text-strong)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: tab === k ? 'var(--weight-bold)' : 'var(--weight-medium)' }}>
                <Icon name={ic} size={16} />{l}
              </button>
            ))}
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {tab === 'profile' && <Card header={<span className="hc-label">Admin profile</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Name"><Input defaultValue="Hills Administrator" /></Field>
              <Field label="Admin email"><Input defaultValue="adminhills@gmail.com" disabled /></Field>
              <Field label="Team"><Select options={['Operations', 'Compliance', 'Finance', 'Content']} /></Field>
              <Field label="Timezone"><Select options={['Asia/Dubai (GST)', 'Africa/Cairo (EET)']} /></Field>
            </div>
            <div style={{ marginTop: 'var(--space-5)' }}><Button>Save changes</Button></div>
          </Card>}
          {tab === 'security' && <>
            <Card header={<span className="hc-label">Password</span>}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                <Field label="Current password" required><Input type="password" /></Field>
                <Field label="New password" required><Input type="password" /></Field>
              </div>
              <div style={{ marginTop: 'var(--space-5)' }}><Button>Update password</Button></div>
            </Card>
            <Card header={<span className="hc-label">Sensitive actions</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Switch checked label="Require step-up confirmation for suspend, reject and payout" />
                <Switch checked label="Require MFA for finance actions" description="Placeholder — enforcement lands with the security build" />
                <InlineAlert tone="info" icon={<Icon name="shield-check" size={16} />}>Administrator access is verified on the server; these toggles are workspace-level preferences.</InlineAlert>
              </div>
            </Card>
          </>}
          {tab === 'notifications' && <Card header={<span className="hc-label">Notification routing</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[['New KYB submissions', 'Compliance queue'], ['Payment proofs awaiting verification', 'Finance queue'], ['Listing review submissions', 'Catalogue queue'], ['Shipment exceptions', 'Operations queue'], ['Account suspensions', 'Compliance queue']].map(([l, d], i) => (
                <Switch key={l} label={l} description={d} checked={i !== 4} onChange={() => {}} />
              ))}
            </div>
          </Card>}
          {tab === 'workspace' && <Card header={<span className="hc-label">Workspace</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Language"><Select defaultValue="English" onChange={(e) => { const ar = e.target.value !== 'English'; document.documentElement.dir = ar ? 'rtl' : 'ltr'; document.documentElement.lang = ar ? 'ar' : 'en'; }} options={['English', 'العربية']} /></Field>
              <Field label="Theme" hint="The operations console is designed dark-first"><Select defaultValue="Dark" onChange={(e) => { document.documentElement.dataset.theme = e.target.value === 'Dark' ? 'dark' : 'light'; }} options={['Dark', 'Light']} /></Field>
              <Field label="Default landing page"><Select options={['Operations overview', 'Approvals queue', 'Finance', 'Shipments']} /></Field>
              <Field label="Table density"><Select options={['Comfortable', 'Dense']} /></Field>
            </div>
          </Card>}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { AdminUsers, AdminListings, AdminListingReview, AdminCreateHillsListing, AdminOrders, AdminOrderDetail, AdminShipments, AdminShipmentDetail, AdminCatalog, AdminContent, AdminAppearance, AdminAudit, AdminSettings });
