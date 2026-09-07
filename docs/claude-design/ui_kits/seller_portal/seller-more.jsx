const { DataTable, StatusBadge, Tabs, SearchField, FilterChip, Pagination, Card, Button, Icon, EmptyState, InlineAlert, Timeline, DocumentRow, ShipmentCard, Field, Input, Select, Textarea, Dialog, ConfirmationModal, FileUpload, Stepper, DatePicker, Switch } = window.HillsCoffeeDesignSystem_ca006d;

/* ---------- Sales orders ---------- */
const SALES = [
  { id: 1, ref: 'HC-2026-0418', buyer: 'Nile Traders LLC', lot: 'Guji Hambela Natural', qty: '60 bags', gross: 'USD 19,440', net: 'USD 18,468', status: 'paymentPending' },
  { id: 2, ref: 'HC-2026-0409', buyer: 'Anatolia Coffee', lot: 'Sidamo Bensa Washed', qty: '80 bags', gross: 'USD 21,600', net: 'USD 20,520', status: 'paid' },
  { id: 3, ref: 'HC-2026-0396', buyer: 'Gulf Coffee Co.', lot: 'Guji Hambela Natural', qty: '150 bags', gross: 'USD 48,600', net: 'USD 46,170', status: 'completed' },
  { id: 4, ref: 'HC-2026-0381', buyer: 'Levant Roasters', lot: 'Limu Kossa Natural', qty: '40 bags', gross: 'USD 11,280', net: 'USD 10,716', status: 'inTransit' },
];

function SellerSalesOrders({ onNavigate }) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const rows = SALES.filter((r) => (tab === 'all' || (tab === 'open' ? ['paymentPending', 'paid', 'inTransit'].includes(r.status) : r.status === tab)) && (r.ref + r.buyer + r.lot).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Sales orders" subtitle="Orders placed on your lots, with the settlement figure beside the gross." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 4 }, { value: 'open', label: 'Open', count: 3 }, { value: 'completed', label: 'Completed', count: 1 }]} />
        <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search order, buyer or lot" style={{ maxWidth: 340 }} />
        <DataTable rows={rows} onRowClick={() => onNavigate('salesOrder')}
          emptyState={<EmptyState icon={<Icon name="clipboard-list" size={24} />} title="No sales orders here" message="Orders appear as verified buyers purchase your live lots." />}
          columns={[
            { key: 'ref', header: 'Order', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ref}</span> },
            { key: 'buyer', header: 'Buyer' },
            { key: 'lot', header: 'Lot' },
            { key: 'qty', header: 'Quantity' },
            { key: 'gross', header: 'Gross', align: 'end', numeric: true },
            { key: 'net', header: 'Your net', align: 'end', numeric: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          ]} />
        <Pagination page={1} pageCount={2} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 14 sales orders'} />
      </div>
    </>
  );
}

/* ---------- Sales order detail ---------- */
function SellerSalesOrderDetail({ onNavigate }) {
  const [tab, setTab] = React.useState('summary');
  return (
    <>
      <PageHead title="HC-2026-0418" subtitle="Nile Traders LLC · 60 bags of Guji Hambela Natural"
        crumbs={[{ key: 'orders', label: 'Sales orders' }, { label: 'HC-2026-0418' }]} onNavigate={() => onNavigate('orders')}
        actions={<><StatusBadge status="paymentPending" /><Button variant="secondary">Download statement</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(320px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'summary', label: 'Summary' }, { value: 'documents', label: 'Documents', count: 2 }, { value: 'activity', label: 'Activity' }]} />
          {tab === 'summary' && <>
            <Card padding="none" header={<span className="hc-label">Sold items</span>}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>Guji Hambela Natural</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>60 bags · 3,600 kg · USD 5.40 / kg</span>
                </div>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>USD 19,440</span>
              </div>
            </Card>
            <Card header={<span className="hc-label">Order timeline</span>}>
              <Timeline items={[
                { label: 'Order placed by buyer', timestamp: '4 Sep 2026, 11:20' },
                { label: 'Proforma issued to buyer', timestamp: '4 Sep 2026, 11:24' },
                { label: 'Awaiting buyer payment', state: 'current', timestamp: 'Due 11 Sep 2026' },
                { label: 'Handover to warehouse', state: 'todo' },
                { label: 'Delivered & settlement calculated', state: 'todo' },
              ]} />
            </Card>
          </>}
          {tab === 'documents' && (
            <Card padding="none">
              <DocumentRow name="spec-sheet-guji.pdf" kind="Specification sheet" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
              <DocumentRow name="handover-note-4482.pdf" kind="Handover note" issuedOn="Pending payment" icon={<Icon name="warehouse" size={18} />} status={<StatusBadge status="draft" size="sm" label="Not issued" />} />
            </Card>
          )}
          {tab === 'activity' && (
            <Card><Timeline items={[
              { label: 'Listing viewed 42 times before purchase', timestamp: '1–4 Sep 2026' },
              { label: 'Order created', timestamp: '4 Sep 2026, 11:20' },
              { label: 'Payment reminder sent to buyer', timestamp: '6 Sep 2026, 08:00' },
            ]} /></Card>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Settlement summary</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[['Gross sale', 'USD 19,440'], ['Hills commission (5%)', '− USD 972'], ['Adjustments', 'USD 0']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--text-strong)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              ))}
              <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>Your net</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>USD 18,468</span>
              </div>
              <InlineAlert tone="info" icon={<Icon name="info" size={16} />}>Payout is released after the buyer payment clears and delivery is accepted. Timing follows the final commercial policy.</InlineAlert>
            </div>
          </Card>
          <ShipmentCard shipmentId="SHP-4482" orderReference="HC-2026-0418" eta="Awaiting payment" destination="Jebel Ali, Dubai"
            quantity="60 bags" status={<StatusBadge status="draft" size="sm" />} actionRequired="Prepare handover documents for the warehouse"
            onOpen={() => onNavigate('shipmentDetail')} />
        </div>
      </div>
    </>
  );
}

/* ---------- Shipments ---------- */
const SHIPS = [
  { id: 1, ship: 'SHP-4482', order: 'HC-2026-0418', buyer: 'Nile Traders LLC', qty: '60 bags', dest: 'Jebel Ali, Dubai', status: 'draft' },
  { id: 2, ship: 'SHP-4468', order: 'HC-2026-0381', buyer: 'Levant Roasters', qty: '40 bags', dest: 'Beirut', status: 'dispatched' },
  { id: 3, ship: 'SHP-4402', order: 'HC-2026-0396', buyer: 'Gulf Coffee Co.', qty: '150 bags', dest: 'Jebel Ali, Dubai', status: 'delivered' },
];

function SellerShipments({ onNavigate }) {
  const [tab, setTab] = React.useState('action');
  const rows = SHIPS.filter((s) => tab === 'all' || (tab === 'action' ? ['draft', 'dispatched'].includes(s.status) : s.status === 'delivered'));
  return (
    <>
      <PageHead title="Shipments" subtitle="Deliveries tied to your sales orders, and what is waiting on you." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'action', label: 'Needs action', count: 2 }, { value: 'delivered', label: 'Delivered', count: 1 }, { value: 'all', label: 'All', count: 3 }]} />
        <DataTable rows={rows} onRowClick={() => onNavigate('shipmentDetail')}
          emptyState={<EmptyState icon={<Icon name="truck" size={24} />} title="No shipments here" message="A shipment is created once a sales order is paid." />}
          columns={[
            { key: 'ship', header: 'Shipment', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ship}</span> },
            { key: 'order', header: 'Order', nowrap: true },
            { key: 'buyer', header: 'Buyer' },
            { key: 'qty', header: 'Quantity' },
            { key: 'dest', header: 'Destination' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          ]} />
      </div>
    </>
  );
}

/* ---------- Shipment detail (seller handover view) ---------- */
function SellerShipmentDetail({ onNavigate }) {
  const [confirm, setConfirm] = React.useState(false);
  return (
    <>
      <PageHead title="SHP-4482" subtitle="Order HC-2026-0418 · 60 bags to Jebel Ali, Dubai"
        crumbs={[{ key: 'shipments', label: 'Shipments' }, { label: 'SHP-4482' }]} onNavigate={() => onNavigate('shipments')}
        actions={<><StatusBadge status="draft" /><Button onClick={() => setConfirm(true)}>Confirm handover</Button></>} />
      <InlineAlert tone="warning" title="Waiting on you" icon={<Icon name="triangle-alert" size={18} />}>
        Confirm the handover quantity and attach the warehouse receipt before the pickup slot on 14 September.
      </InlineAlert>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Handover details</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Confirmed quantity (bags)" required><Input defaultValue="60" /></Field>
              <Field label="Pickup date" required><DatePicker icon={<Icon name="calendar" size={16} />} defaultValue="2026-09-14" /></Field>
              <Field label="Warehouse / stack" required><Select options={['Addis Ababa bonded · ST-14-B', 'Jebel Ali, Dubai']} /></Field>
              <Field label="On-site contact" required><Input defaultValue="Mesfin Tadesse" /></Field>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Notes for logistics" optional><Textarea rows={3} placeholder="Access hours, gate, forklift availability" /></Field></div>
            </div>
          </Card>
          <Card header={<span className="hc-label">Handover documents</span>}>
            <Field label="Warehouse receipt" required><FileUpload icon={<Icon name="upload" size={18} />} label="Drop the receipt or browse" hint="PDF or JPG · up to 10 MB" /></Field>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Shipment timeline</span>}>
            <Timeline items={[
              { label: 'Draft created', timestamp: '4 Sep 2026' },
              { label: 'Awaiting buyer payment', state: 'current', timestamp: 'Due 11 Sep 2026' },
              { label: 'Requested', state: 'todo' }, { label: 'Confirmed', state: 'todo' },
              { label: 'Picking', state: 'todo' }, { label: 'Dispatched', state: 'todo' }, { label: 'Delivered', state: 'todo' },
            ]} />
          </Card>
          <Card padding="none" header={<span className="hc-label">Documents</span>}>
            <DocumentRow name="packing-list-4482.pdf" kind="Packing list" issuedOn="Draft" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="draft" size="sm" />} />
            <DocumentRow name="warehouse-receipt.pdf" kind="Warehouse receipt" issuedOn="Required" icon={<Icon name="warehouse" size={18} />} status={<StatusBadge status="rejected" size="sm" label="Required" />} />
          </Card>
        </div>
      </div>
      <ConfirmationModal open={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)}
        title="Confirm handover of 60 bags?" message="Hills logistics will schedule pickup against this quantity."
        consequence="The confirmed quantity is recorded against the sales order and cannot be reduced without an exception."
        confirmLabel="Confirm handover" />
    </>
  );
}

/* ---------- Notifications ---------- */
const SNOTES = [
  { id: 1, icon: 'package', title: 'Sidamo Bensa Washed returned by review', body: 'Warehouse holding certificate is missing.', when: '1 Sep 2026, 16:22', unread: true },
  { id: 2, icon: 'clipboard-list', title: 'New order on Guji Hambela Natural', body: 'Nile Traders LLC bought 60 bags — USD 19,440 gross.', when: '4 Sep 2026, 11:20', unread: true },
  { id: 3, icon: 'truck', title: 'Handover required for SHP-4482', body: 'Confirm quantity before the 14 September pickup slot.', when: '5 Sep 2026, 09:00', unread: false },
  { id: 4, icon: 'banknote', title: 'Payout recorded for HC-2026-0396', body: 'USD 46,170 net · reference PO-8841.', when: '25 Aug 2026, 12:04', unread: false },
];

function SellerNotifications() {
  return (
    <>
      <PageHead title="Notifications" subtitle="Listing review, orders received, payments, shipment actions and document expiry."
        actions={<Button variant="secondary" size="sm">Mark all as read</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 860 }}>
        {SNOTES.map((n) => (
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

/* ---------- KYB & company profile (seller: adds banking verification) ---------- */
function SellerKybProfile() {
  return (
    <>
      <PageHead title="KYB & company profile" subtitle="Verified company data, documents and banking status for Abyssinia Exports." />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Company details</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
              <Field label="Legal company name"><Input defaultValue="Abyssinia Exports PLC" disabled /></Field>
              <Field label="Registration number"><Input defaultValue="ET-2211-2016" disabled /></Field>
              <Field label="Export licence"><Input defaultValue="EXP-8841" disabled /></Field>
              <Field label="Tax number"><Input defaultValue="ET-TIN-0044821" /></Field>
            </div>
          </Card>
          <Card padding="none" header={<span className="hc-label">Documents on file</span>}>
            <DocumentRow name="export-licence.pdf" kind="Export licence · expires 31 Mar 2027" issuedOn="12 Apr 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
            <DocumentRow name="commercial-registration.pdf" kind="Commercial registration" issuedOn="12 Apr 2026" icon={<Icon name="file-text" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
            <DocumentRow name="ubo-declaration.pdf" kind="Ownership declaration" issuedOn="12 Apr 2026" icon={<Icon name="users" size={18} />} status={<StatusBadge status="approved" size="sm" />} onDownload={() => {}} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Verification</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <StatusBadge status="approved" label="Seller approved" />
              <Timeline items={[{ label: 'Submitted', timestamp: '12 Apr 2026' }, { label: 'Under review', timestamp: '14 Apr 2026' }, { label: 'Approved', timestamp: '18 Apr 2026' }]} />
            </div>
          </Card>
          <Card header={<span className="hc-label">Banking</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <InlineAlert tone="info" icon={<Icon name="lock" size={16} />} title="Read-only">Payout account changes need step-up approval from Hills finance.</InlineAlert>
              <Field label="Bank"><Input defaultValue="Commercial Bank of Ethiopia" disabled /></Field>
              <Field label="Account"><Input defaultValue="•••• •••• 8841" disabled /></Field>
              <StatusBadge status="approved" size="sm" label="Banking verified" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SellerSalesOrders, SellerSalesOrderDetail, SellerShipments, SellerShipmentDetail, SellerNotifications, SellerKybProfile });
