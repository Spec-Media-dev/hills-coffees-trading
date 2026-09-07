const { DataTable, StatusBadge, Tabs, SearchField, Button, Icon, ListingCard, Card, EmptyState, InlineAlert, Drawer, DocumentRow } = window.HillsCoffeeDesignSystem_ca006d;

const LOTS = [
  { id: 1, lot: 'Guji Hambela Natural', origin: 'Ethiopia · Guji', qty: '140 bags', price: 'USD 5.40 / kg', orders: 2, updated: '3 Sep 2026', status: 'live' },
  { id: 2, lot: 'Yirgacheffe Idido Washed', origin: 'Ethiopia · Yirgacheffe', qty: '90 bags', price: 'USD 5.10 / kg', orders: 0, updated: '2 Sep 2026', status: 'live' },
  { id: 3, lot: 'Sidamo Bensa Washed', origin: 'Ethiopia · Sidamo', qty: '110 bags', price: 'USD 4.95 / kg', orders: 0, updated: '1 Sep 2026', status: 'moreInfo' },
  { id: 4, lot: 'Limu Kossa Natural', origin: 'Ethiopia · Limu', qty: '0 bags', price: 'USD 4.70 / kg', orders: 4, updated: '20 Aug 2026', status: 'sold' },
  { id: 5, lot: 'Harrar Longberry', origin: 'Ethiopia · Harrar', qty: '60 bags', price: 'USD 4.40 / kg', orders: 0, updated: '18 Aug 2026', status: 'draft' },
];

function SellerListings({ onNavigate }) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [preview, setPreview] = React.useState(null);
  const rows = LOTS.filter((l) => (tab === 'all' || l.status === tab) && l.lot.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="My listings" subtitle="Each lot carries its own lifecycle: draft, review, live, sold or suspended."
        actions={<Button onClick={() => onNavigate('create')} iconLeft={<Icon name="plus" size={16} />}>Create listing</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 5 }, { value: 'live', label: 'Live', count: 2 }, { value: 'moreInfo', label: 'Needs changes', count: 1 }, { value: 'draft', label: 'Drafts', count: 1 }, { value: 'sold', label: 'Sold', count: 1 }]} />
        <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search your lots" style={{ maxWidth: 340 }} />
        <DataTable rows={rows} onRowClick={(r) => setPreview(r)}
          emptyState={<EmptyState icon={<Icon name="package-open" size={24} />} title="Nothing in this state" message="Create a lot and submit it for review — approved lots go live to verified buyers." action={<Button onClick={() => onNavigate('create')}>Create listing</Button>} />}
          columns={[
            { key: 'lot', header: 'Lot', render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.lot}</span> },
            { key: 'origin', header: 'Origin' },
            { key: 'qty', header: 'Available', nowrap: true },
            { key: 'price', header: 'Price', align: 'end', numeric: true, nowrap: true },
            { key: 'orders', header: 'Orders', align: 'end', numeric: true },
            { key: 'updated', header: 'Updated', nowrap: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" label={r.status === 'moreInfo' ? 'Needs changes' : undefined} /> },
          ]} />
      </div>
      <Drawer open={!!preview} onClose={() => setPreview(null)} title={preview ? preview.lot : ''} width={520}
        footer={<><Button variant="text" onClick={() => setPreview(null)}>Close</Button><Button variant="secondary">Edit listing</Button><Button>Submit for review</Button></>}>
        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {preview.status === 'moreInfo' && <InlineAlert tone="warning" title="Returned by review" icon={<Icon name="triangle-alert" size={18} />}>Attach the warehouse holding certificate, then resubmit. Price and quantity edits do not need re-approval.</InlineAlert>}
            <span className="hc-label">Buyer preview</span>
            <ListingCard title={preview.lot} origin="Ethiopia" region={preview.origin.split('· ')[1]} grade="G1" process="Natural" harvest="2025/26" quantity={preview.qty} price={preview.price} seller="verified" sellerName="Abyssinia Exports" status={<StatusBadge status={preview.status} size="sm" />} />
            <Card padding="none" header={<span className="hc-label">Attached documents</span>}>
              <DocumentRow name="spec-sheet.pdf" kind="Specification sheet" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
              <DocumentRow name="holding-certificate.pdf" kind="Warehouse certificate" issuedOn="Missing" icon={<Icon name="warehouse" size={18} />} status={<StatusBadge status="rejected" size="sm" label="Required" />} />
            </Card>
          </div>
        )}
      </Drawer>
    </>
  );
}

Object.assign(window, { SellerListings });
