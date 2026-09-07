const { KpiCard, Card, DataTable, StatusBadge, OrderCard, ShipmentCard, Button, InlineAlert, Icon } = window.HillsCoffeeDesignSystem_ca006d;

const RECENT = [
  { id: 1, ref: 'HC-2026-0418', buyer: 'Nile Traders LLC', lot: 'Guji Hambela Natural', qty: '60 bags', amount: 'USD 19,440', status: 'paymentPending' },
  { id: 2, ref: 'HC-2026-0409', buyer: 'Anatolia Coffee', lot: 'Sidamo Bensa Washed', qty: '80 bags', amount: 'USD 21,600', status: 'paid' },
  { id: 3, ref: 'HC-2026-0396', buyer: 'Gulf Coffee Co.', lot: 'Guji Hambela Natural', qty: '150 bags', amount: 'USD 48,600', status: 'completed' },
];

function SellerDashboard({ onNavigate }) {
  return (
    <>
      <PageHead title="Abyssinia Exports" subtitle="Your live lots, the orders placed on them, and what Hills owes you."
        actions={<Button onClick={() => onNavigate('create')} iconLeft={<Icon name="plus" size={16} />}>Create listing</Button>} />
      <InlineAlert tone="highlight" title="One listing needs changes before it can go live" icon={<Icon name="triangle-alert" size={18} />}
        action={<Button size="sm" variant="outline" onClick={() => onNavigate('listings')}>Open listing</Button>}>
        Sidamo Bensa Washed was returned by review: the warehouse holding certificate is missing.
      </InlineAlert>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-5)' }}>
        <KpiCard icon={<Icon name="package" size={22} />} value="4" label="Live listings" />
        <KpiCard icon={<Icon name="hourglass" size={22} />} value="1" label="Pending review" />
        <KpiCard icon={<Icon name="clipboard-list" size={22} />} value="3" label="Orders received" />
        <KpiCard icon={<Icon name="scale" size={22} />} value="USD 91.2k" label="Settlement pending" hint="Net of Hills fee" />
      </div>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Card padding="none" header={<><span className="hc-label">Recent sales orders</span><Button size="sm" variant="text" style={{ marginInlineStart: 'auto' }} onClick={() => onNavigate('orders')}>View all</Button></>}>
          <DataTable rows={RECENT} style={{ border: 'none', borderRadius: 0 }}
            columns={[
              { key: 'ref', header: 'Order', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ref}</span> },
              { key: 'buyer', header: 'Buyer' },
              { key: 'lot', header: 'Lot' },
              { key: 'qty', header: 'Quantity' },
              { key: 'amount', header: 'Gross', align: 'end', numeric: true },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
            ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <OrderCard reference="HC-2026-0418" date="4 Sep 2026" counterparty="Nile Traders LLC" counterpartyLabel="Buyer"
            items="60 bags · Guji Hambela" amount="USD 19,440" status={<StatusBadge status="paymentPending" size="sm" />}
            action={<Button size="sm" variant="outline">View settlement</Button>} onOpen={() => onNavigate('settlements')} />
          <ShipmentCard shipmentId="SHP-4482" orderReference="HC-2026-0418" eta="Awaiting payment" destination="Jebel Ali, Dubai"
            quantity="60 bags" status={<StatusBadge status="draft" size="sm" />}
            actionRequired="Prepare handover documents for the warehouse" />
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SellerDashboard });
