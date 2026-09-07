const { KpiCard, KybCard, OrderCard, ShipmentCard, StatusBadge, Button, Card, InlineAlert, Icon, DataTable } = window.HillsCoffeeDesignSystem_ca006d;

const ORDERS = [
  { id: 1, ref: 'HC-2026-0418', date: '4 Sep 2026', source: 'Abyssinia Exports', qty: '480 bags', amount: 'USD 138,240', status: 'paymentPending' },
  { id: 2, ref: 'HC-2026-0411', date: '28 Aug 2026', source: 'Hills Coffee', qty: '120 bags', amount: 'USD 34,560', status: 'inTransit' },
  { id: 3, ref: 'HC-2026-0402', date: '19 Aug 2026', source: 'Hills Coffee', qty: '300 bags', amount: 'USD 86,400', status: 'completed' },
];

function BuyerDashboard({ onNavigate }) {
  return (
    <>
      <PageHead title="Welcome back, Ahmed" subtitle="What you bought, what you owe, where it is, and what needs you next."
        actions={<Button onClick={() => onNavigate('marketplace')} iconLeft={<Icon name="search" size={16} />}>Browse lots</Button>} />
      <InlineAlert tone="warning" title="Two documents need replacing" icon={<Icon name="triangle-alert" size={18} />}
        action={<Button size="sm" onClick={() => onNavigate('kyb')}>Open KYB</Button>}>
        Your trade licence expired in June 2026. Ordering stays open for now, but new contracts pause on 30 September.
      </InlineAlert>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-5)' }}>
        <KpiCard icon={<Icon name="clipboard-list" size={22} />} value="3" label="Active orders" />
        <KpiCard icon={<Icon name="hourglass" size={22} />} value="1" label="Pending payment" hint="USD 138,240 due 11 Sep" />
        <KpiCard icon={<Icon name="truck" size={22} />} value="1" label="In transit" />
        <KpiCard icon={<Icon name="check-check" size={22} />} value="12" label="Completed" />
      </div>
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card padding="none" header={<><span className="hc-label">Recent orders</span><Button size="sm" variant="text" style={{ marginInlineStart: 'auto' }} onClick={() => onNavigate('orders')}>View all</Button></>}>
            <DataTable rows={ORDERS} onRowClick={() => onNavigate('order')} style={{ border: 'none', borderRadius: 0 }}
              columns={[
                { key: 'ref', header: 'Order', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.ref}</span> },
                { key: 'date', header: 'Placed', nowrap: true },
                { key: 'source', header: 'Source' },
                { key: 'qty', header: 'Quantity' },
                { key: 'amount', header: 'Total', align: 'end', numeric: true },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
              ]} />
          </Card>
          <ShipmentCard shipmentId="SHP-4471" orderReference="HC-2026-0411" eta="18 Sep 2026" destination="Damietta, Egypt"
            quantity="120 bags" incoterm="CIF" status={<StatusBadge status="inTransit" size="sm" />}
            actionRequired="Confirm the delivery contact for customs clearance" onOpen={() => onNavigate('shipments')} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <KybCard companyName="Nile Traders LLC" role="Buyer" progress={80} status={<StatusBadge status="moreInfo" size="sm" />}
            missingItems={['Certified trade licence', 'Authorised signatory specimen']}
            action={<Button size="sm" onClick={() => onNavigate('kyb')}>Continue application</Button>} />
          <OrderCard reference="HC-2026-0418" date="4 Sep 2026" counterparty="Abyssinia Exports" items="2 lots · 480 bags"
            amount="USD 138,240" status={<StatusBadge status="paymentPending" size="sm" />}
            action={<Button size="sm" variant="outline" onClick={() => onNavigate('order')}>Pay & upload proof</Button>} />
        </div>
      </div>
    </>
  );
}

Object.assign(window, { BuyerDashboard });
