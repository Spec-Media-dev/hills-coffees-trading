const { ShipmentCard, StatusBadge, Timeline, Card, DocumentRow, Button, Tabs, Icon, DataTable, EmptyState } = window.HillsCoffeeDesignSystem_ca006d;

const SHIPMENTS = [
  { id: 1, ship: 'SHP-4471', order: 'HC-2026-0411', eta: '18 Sep 2026', dest: 'Damietta, Egypt', qty: '120 bags', status: 'inTransit' },
  { id: 2, ship: 'SHP-4460', order: 'HC-2026-0402', eta: 'Delivered 22 Aug', dest: 'Damietta, Egypt', qty: '300 bags', status: 'delivered' },
  { id: 3, ship: 'SHP-4482', order: 'HC-2026-0418', eta: 'Awaiting payment', dest: 'Damietta, Egypt', qty: '480 bags', status: 'draft' },
];

function BuyerShipments({ onNavigate }) {
  const [tab, setTab] = React.useState('active');
  const [open, setOpen] = React.useState('SHP-4471');
  const rows = SHIPMENTS.filter((s) => tab === 'all' || (tab === 'active' ? ['inTransit', 'draft'].includes(s.status) : s.status === 'delivered'));
  return (
    <>
      <PageHead title="Shipments" subtitle="Where each order is, what is confirmed, and what still needs you." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Active', count: 2 }, { value: 'delivered', label: 'Delivered', count: 1 }, { value: 'all', label: 'All', count: 3 }]} />
      <div style={{ marginTop: 'var(--space-5)', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(320px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <DataTable rows={rows} onRowClick={(r) => setOpen(r.ship)}
          emptyState={<EmptyState icon={<Icon name="truck" size={24} />} title="No shipments here" message="Shipments appear once an order is paid and allocated." />}
          columns={[
            { key: 'ship', header: 'Shipment', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ship}</span> },
            { key: 'order', header: 'Order', nowrap: true },
            { key: 'dest', header: 'Destination' },
            { key: 'qty', header: 'Quantity' },
            { key: 'eta', header: 'ETA', nowrap: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          ]} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <ShipmentCard shipmentId={open} orderReference="HC-2026-0411" eta="18 Sep 2026" destination="Damietta, Egypt"
            quantity="120 bags" carrier="MSC · MSCU4471882" incoterm="CIF" status={<StatusBadge status="inTransit" size="sm" />}
            actionRequired="Confirm the delivery contact for customs clearance" />
          <Card header={<span className="hc-label">Shipment timeline</span>}>
            <Timeline items={[
              { label: 'Requested', timestamp: '8 Sep 2026' },
              { label: 'Confirmed', timestamp: '9 Sep 2026', description: 'Warehouse slot booked at Jebel Ali.' },
              { label: 'Reserved', timestamp: '10 Sep 2026' },
              { label: 'Picking', timestamp: '11 Sep 2026' },
              { label: 'Dispatched', state: 'current', timestamp: '12 Sep 2026, 06:40' },
              { label: 'Delivered', state: 'todo', description: 'Proof of delivery is attached on arrival.' },
            ]} />
          </Card>
          <Card padding="none" header={<span className="hc-label">Shipping documents</span>}>
            <DocumentRow name="bill-of-lading-4471.pdf" kind="Bill of lading" issuedOn="12 Sep 2026" icon={<Icon name="ship" size={18} />} onDownload={() => {}} />
            <DocumentRow name="packing-list-4471.pdf" kind="Packing list" issuedOn="11 Sep 2026" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
            <DocumentRow name="pod-4471.jpg" kind="Proof of delivery" issuedOn="Pending" icon={<Icon name="image" size={18} />} status={<StatusBadge status="picking" size="sm" label="On delivery" />} />
          </Card>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { BuyerShipments });
