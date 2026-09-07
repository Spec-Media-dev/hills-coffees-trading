const { ListingCard, SearchField, FilterChip, SortControl, Pagination, DataTable, StatusBadge, Tabs, Card, Button, IconButton, Icon, EmptyState, InlineAlert, DocumentRow, InvoiceCard, KybCard, DocumentCard, Field, Input, Select, Switch, Checkbox, PhoneField, CountryField, FileUpload, Timeline, Drawer, Combobox, Skeleton } = window.HillsCoffeeDesignSystem_ca006d;

/* ---------- Marketplace (buyer view: prices unlocked) ---------- */
const LOTS = [
  { title: 'Yirgacheffe Kochere Lot 14', origin: 'Ethiopia', region: 'Yirgacheffe', grade: 'G1', process: 'Washed', harvest: '2025/26', quantity: '320 bags · 60kg', price: 'USD 4.80 / kg', seller: 'hills' },
  { title: 'Guji Hambela Natural', origin: 'Ethiopia', region: 'Guji', grade: 'G1', process: 'Natural', harvest: '2025/26', quantity: '140 bags · 60kg', price: 'USD 5.40 / kg', seller: 'verified', sellerName: 'Abyssinia Exports' },
  { title: 'Huila Pitalito Lot 07', origin: 'Colombia', region: 'Huila', grade: 'Supremo 17/18', process: 'Washed', harvest: '2025/26', quantity: '180 bags · 70kg', price: 'USD 5.15 / kg', seller: 'verified', sellerName: 'Andes Green SAS' },
  { title: 'Nyeri AA Karatina', origin: 'Kenya', region: 'Nyeri', grade: 'AA', process: 'Washed', harvest: '2025/26', quantity: '96 bags · 60kg', price: 'USD 6.20 / kg', seller: 'hills' },
  { title: 'Cerrado Mineiro Fine Cup', origin: 'Brazil', region: 'Cerrado', grade: 'NY2 17/18', process: 'Natural', harvest: '2025/26', quantity: '420 bags · 60kg', price: 'USD 3.95 / kg', seller: 'hills' },
  { title: 'Nyamasheke Honey Lot 3', origin: 'Rwanda', region: 'Nyamasheke', grade: 'A1', process: 'Honey', harvest: '2025/26', quantity: '64 bags · 60kg', price: 'USD 6.10 / kg', seller: 'verified', sellerName: 'Kigali Lots Ltd' },
];

function BuyerMarketplace({ onNavigate }) {
  const [q, setQ] = React.useState('');
  const [facets, setFacets] = React.useState([]);
  const [drawer, setDrawer] = React.useState(false);
  const toggle = (v) => setFacets((s) => s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);
  const rows = LOTS.filter((l) => (facets.length === 0 || facets.includes(l.process) || facets.includes(l.origin) || (facets.includes('Hills lots') && l.seller === 'hills'))
    && (l.title + l.origin + l.region).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Marketplace" subtitle="Contract pricing is visible because your buyer account is approved."
        actions={<Button variant="secondary" iconLeft={<Icon name="sliders-horizontal" size={16} />} onClick={() => setDrawer(true)}>All filters</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search lots, origins, regions" style={{ maxWidth: 340 }} />
          {['Washed', 'Natural', 'Honey', 'Ethiopia', 'Hills lots'].map((v) => <FilterChip key={v} label={v} selected={facets.includes(v)} onToggle={() => toggle(v)} onRemove={() => toggle(v)} />)}
          <span style={{ marginInlineStart: 'auto' }}><SortControl value="price" direction="asc" onChange={() => {}} onDirectionChange={() => {}} options={[{ value: 'newest', label: 'Newest' }, { value: 'price', label: 'Price / kg' }, { value: 'qty', label: 'Available quantity' }]} /></span>
        </div>
        {rows.length === 0
          ? <EmptyState icon={<Icon name="search-x" size={24} />} title="No lots match these filters" message="Clear a filter or widen the origin selection." action={<Button onClick={() => { setFacets([]); setQ(''); }}>Clear filters</Button>} />
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-5)' }}>
              {rows.map((l) => <ListingCard key={l.title} {...l} onOpen={() => onNavigate('cart')} />)}
            </div>}
        <Pagination page={1} pageCount={25} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 148 lots'} />
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters"
        footer={<><Button variant="text" onClick={() => setFacets([])}>Reset</Button><Button onClick={() => setDrawer(false)}>Show {rows.length} lots</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Field label="Origin"><Combobox options={['Ethiopia', 'Colombia', 'Kenya', 'Brazil', 'Rwanda']} onChange={() => {}} /></Field>
          <Field label="Process"><Select placeholder="Any process" options={['Washed', 'Natural', 'Honey', 'Anaerobic']} /></Field>
          <Field label="Grade"><Select placeholder="Any grade" options={['G1', 'AA', 'Supremo 17/18', 'NY2 17/18']} /></Field>
          <Field label="Warehouse"><Select placeholder="Any location" options={['Jebel Ali, Dubai', 'Damietta, Egypt', 'Antwerp']} /></Field>
          <Field label="Price ceiling (USD / kg)"><Input type="number" placeholder="6.00" /></Field>
        </div>
      </Drawer>
    </>
  );
}

/* ---------- My orders ---------- */
const ORDERS = [
  { id: 1, ref: 'HC-2026-0418', date: '4 Sep 2026', source: 'Abyssinia Exports', qty: '480 bags', amount: 'USD 138,240', status: 'paymentPending' },
  { id: 2, ref: 'HC-2026-0411', date: '28 Aug 2026', source: 'Hills Coffee', qty: '120 bags', amount: 'USD 34,560', status: 'inTransit' },
  { id: 3, ref: 'HC-2026-0402', date: '19 Aug 2026', source: 'Hills Coffee', qty: '300 bags', amount: 'USD 86,400', status: 'completed' },
  { id: 4, ref: 'HC-2026-0388', date: '2 Aug 2026', source: 'Kigali Lots Ltd', qty: '60 bags', amount: 'USD 21,960', status: 'refunded' },
  { id: 5, ref: 'HC-2026-0375', date: '18 Jul 2026', source: 'Hills Coffee', qty: '200 bags', amount: 'USD 47,400', status: 'completed' },
];

function BuyerOrders({ onNavigate }) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const rows = ORDERS.filter((r) => (tab === 'all' || (tab === 'open' ? ['paymentPending', 'inTransit'].includes(r.status) : r.status === tab)) && (r.ref + r.source).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="My orders" subtitle="Every contract you have placed, with its payment and fulfilment state." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 5 }, { value: 'open', label: 'Open', count: 2 }, { value: 'completed', label: 'Completed', count: 2 }, { value: 'refunded', label: 'Refunded', count: 1 }]} />
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search order or source" style={{ maxWidth: 320 }} />
          <span style={{ marginInlineStart: 'auto' }}><Button variant="secondary" size="sm" iconLeft={<Icon name="download" size={16} />}>Export</Button></span>
        </div>
        <DataTable rows={rows} onRowClick={() => onNavigate('order')}
          emptyState={<EmptyState icon={<Icon name="clipboard-list" size={24} />} title="No orders in this state" message="Approved lots you buy will appear here." action={<Button onClick={() => onNavigate('marketplace')}>Browse lots</Button>} />}
          columns={[
            { key: 'ref', header: 'Order', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ref}</span> },
            { key: 'date', header: 'Placed', nowrap: true },
            { key: 'source', header: 'Source' },
            { key: 'qty', header: 'Quantity' },
            { key: 'amount', header: 'Total', align: 'end', numeric: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
            { key: 'go', header: '', align: 'end', render: () => <Button size="sm" variant="outline">Open</Button> },
          ]} />
        <Pagination page={1} pageCount={2} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 18 orders'} />
      </div>
    </>
  );
}

/* ---------- Invoices & documents ---------- */
function BuyerInvoices({ onNavigate }) {
  const [tab, setTab] = React.useState('invoices');
  return (
    <>
      <PageHead title="Invoices & documents" subtitle="Proforma and final invoices, shipping paperwork and your download history." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'invoices', label: 'Invoices', count: 4 }, { value: 'shipping', label: 'Shipping documents', count: 3 }, { value: 'company', label: 'Company documents', count: 4 }]} />
      <div style={{ marginTop: 'var(--space-5)', display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Card padding="none">
          {tab === 'invoices' && <>
            <DocumentRow name="proforma-HC-2026-0418.pdf" kind="Proforma invoice" issuedOn="4 Sep 2026" amount="USD 138,240" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="paymentPending" size="sm" />} onPreview={() => {}} onDownload={() => {}} />
            <DocumentRow name="invoice-HC-2026-0411.pdf" kind="Final / tax invoice" issuedOn="29 Aug 2026" amount="USD 34,560" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="paid" size="sm" />} onPreview={() => {}} onDownload={() => {}} />
            <DocumentRow name="invoice-HC-2026-0402.pdf" kind="Final / tax invoice" issuedOn="20 Aug 2026" amount="USD 86,400" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="paid" size="sm" />} onPreview={() => {}} onDownload={() => {}} />
            <DocumentRow name="credit-note-0388.pdf" kind="Credit note" issuedOn="6 Aug 2026" amount="USD 21,960" icon={<Icon name="rotate-ccw" size={18} />} status={<StatusBadge status="refunded" size="sm" />} onDownload={() => {}} />
          </>}
          {tab === 'shipping' && <>
            <DocumentRow name="bill-of-lading-4471.pdf" kind="Bill of lading" issuedOn="12 Sep 2026" icon={<Icon name="ship" size={18} />} onDownload={() => {}} />
            <DocumentRow name="packing-list-4471.pdf" kind="Packing list" issuedOn="11 Sep 2026" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
            <DocumentRow name="pod-4460.jpg" kind="Proof of delivery" issuedOn="22 Aug 2026" icon={<Icon name="image" size={18} />} status={<StatusBadge status="delivered" size="sm" />} onPreview={() => {}} onDownload={() => {}} />
          </>}
          {tab === 'company' && <>
            <DocumentRow name="trade-licence-2026.pdf" kind="Trade licence" issuedOn="2 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="rejected" size="sm" label="Expired" />} onPreview={() => {}} />
            <DocumentRow name="commercial-registration.pdf" kind="Commercial registration" issuedOn="2 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
            <DocumentRow name="vat-certificate.pdf" kind="Tax certificate" issuedOn="2 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
            <DocumentRow name="bank-letter.pdf" kind="Banking evidence" issuedOn="2 Sep 2026" icon={<Icon name="banknote" size={18} />} status={<StatusBadge status="review" size="sm" />} onDownload={() => {}} />
          </>}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <InvoiceCard number="PI-2026-0418" issuedOn="4 Sep 2026" dueOn="11 Sep 2026" amount="138,240"
            status={<StatusBadge status="paymentPending" size="sm" />}
            lines={[{ label: '2 lots · 480 bags', value: 'USD 136,000' }, { label: 'Handling & documentation', value: 'USD 2,240' }]}
            instructions={'Beneficiary: Hills Coffee Trading FZ-LLC\nIBAN: AE00 0000 0000 0000 0000 000\nReference: HC-2026-0418'}
            actions={<><Button size="sm" onClick={() => onNavigate('order')}>Open order</Button><Button size="sm" variant="outline">Download PDF</Button></>} />
        </div>
      </div>
    </>
  );
}

/* ---------- Notifications ---------- */
const NOTES = [
  { id: 1, icon: 'shield-check', title: 'More information required on your KYB', body: 'Trade licence expired; signatory specimen missing.', when: '4 Sep 2026, 11:48', unread: true, kind: 'KYB' },
  { id: 2, icon: 'file-text', title: 'Proforma PI-2026-0418 issued', body: 'USD 138,240 due 11 Sep 2026. Reference HC-2026-0418.', when: '4 Sep 2026, 11:24', unread: true, kind: 'Payment' },
  { id: 3, icon: 'truck', title: 'Shipment SHP-4471 dispatched', body: 'ETA 18 Sep 2026 to Damietta, Egypt.', when: '12 Sep 2026, 06:40', unread: false, kind: 'Shipment' },
  { id: 4, icon: 'check-check', title: 'Order HC-2026-0402 completed', body: 'Proof of delivery attached.', when: '22 Aug 2026, 15:10', unread: false, kind: 'Order' },
];

function BuyerNotifications() {
  const [tab, setTab] = React.useState('all');
  const rows = NOTES.filter((n) => tab === 'all' || (tab === 'unread' ? n.unread : n.kind.toLowerCase() === tab));
  return (
    <>
      <PageHead title="Notifications" subtitle="KYB, order, payment, shipment and document requests."
        actions={<Button variant="secondary" size="sm">Mark all as read</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 4 }, { value: 'unread', label: 'Unread', count: 2 }, { value: 'payment', label: 'Payment' }, { value: 'shipment', label: 'Shipment' }, { value: 'kyb', label: 'KYB' }]} />
      <div style={{ marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 860 }}>
        {rows.length === 0 && <EmptyState icon={<Icon name="bell-off" size={24} />} title="Nothing here" message="Notifications for this category will appear as they happen." />}
        {rows.map((n) => (
          <div key={n.id} style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', background: 'var(--surface-card)', border: '1px solid ' + (n.unread ? 'var(--accent)' : 'var(--border)'), borderRadius: 'var(--radius-md)' }}>
            <span style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: 'var(--radius-sm)', background: 'var(--surface-subtle)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><Icon name={n.icon} size={18} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{n.title}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{n.body}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{n.when}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- KYB & company profile ---------- */
function BuyerKybProfile({ onNavigate }) {
  return (
    <>
      <PageHead title="KYB & company profile" subtitle="What Hills Coffee holds on file for Nile Traders LLC, and what still needs replacing." />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Company details</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Legal company name"><Input defaultValue="Nile Traders LLC" disabled /></Field>
              <Field label="Registration number"><Input defaultValue="EG-4471-2019" disabled /></Field>
              <Field label="Jurisdiction"><CountryField value="Egypt" disabled /></Field>
              <Field label="Tax / VAT number"><Input defaultValue="EG-VAT-882931" /></Field>
              <Field label="Registered address" hint="Changes to a verified address trigger re-review"><Input defaultValue="14 Nile Corniche, Cairo" /></Field>
              <Field label="Work phone"><PhoneField dialCode="+20" defaultValue="10 1234 5678" /></Field>
            </div>
          </Card>
          <Card padding="none" header={<span className="hc-label">Documents on file</span>}>
            <DocumentRow name="trade-licence-2026.pdf" kind="Trade licence · expires 30 Jun 2026" issuedOn="Expired" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="rejected" size="sm" label="Replace" />} onPreview={() => {}} />
            <DocumentRow name="commercial-registration.pdf" kind="Commercial registration" issuedOn="2 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
            <DocumentRow name="vat-certificate.pdf" kind="Tax certificate" issuedOn="2 Sep 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
            <DocumentRow name="bank-letter.pdf" kind="Banking evidence" issuedOn="2 Sep 2026" icon={<Icon name="banknote" size={18} />} status={<StatusBadge status="review" size="sm" />} onDownload={() => {}} />
          </Card>
          <Card header={<span className="hc-label">Replace a document</span>}>
            <Field label="Trade licence" required hint="PDF · up to 10 MB"><FileUpload state="error" icon={<Icon name="upload" size={18} />} label="Upload the current licence" hint="PDF · up to 10 MB" /></Field>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <KybCard companyName="Nile Traders LLC" role="Buyer" progress={80} status={<StatusBadge status="moreInfo" />} submittedOn="2 Sep 2026"
            missingItems={['Certified trade licence — the copy on file expired in June 2026', 'Authorised signatory specimen']}
            action={<Button size="sm">Resubmit for review</Button>} />
          <Card header={<span className="hc-label">Verification history</span>}>
            <Timeline items={[
              { label: 'Submitted', timestamp: '2 Sep 2026' },
              { label: 'Under review', timestamp: '3 Sep 2026' },
              { label: 'More information requested', state: 'current', timestamp: '4 Sep 2026' },
              { label: 'Approved', state: 'todo' },
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { BuyerMarketplace, BuyerOrders, BuyerInvoices, BuyerNotifications, BuyerKybProfile });
