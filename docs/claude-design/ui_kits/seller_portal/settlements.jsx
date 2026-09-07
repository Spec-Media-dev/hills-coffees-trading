const { KpiCard, DataTable, StatusBadge, Card, Timeline, DocumentRow, Button, Icon, InlineAlert, Tabs } = window.HillsCoffeeDesignSystem_ca006d;

const ROWS = [
  { id: 1, order: 'HC-2026-0418', buyer: 'Nile Traders LLC', gross: 'USD 19,440', fee: 'USD 972', net: 'USD 18,468', status: 'paymentPending' },
  { id: 2, order: 'HC-2026-0409', buyer: 'Anatolia Coffee', gross: 'USD 21,600', fee: 'USD 1,080', net: 'USD 20,520', status: 'review' },
  { id: 3, order: 'HC-2026-0396', buyer: 'Gulf Coffee Co.', gross: 'USD 48,600', fee: 'USD 2,430', net: 'USD 46,170', status: 'paid' },
];

function Settlements() {
  const [tab, setTab] = React.useState('all');
  const rows = ROWS.filter((r) => tab === 'all' || (tab === 'pending' ? r.status !== 'paid' : r.status === 'paid'));
  return (
    <>
      <PageHead title="Settlements & payouts" subtitle="Gross sale, Hills commission and your net amount for every order." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-5)' }}>
        <KpiCard icon={<Icon name="banknote" size={22} />} value="USD 89.6k" label="Gross sales this period" />
        <KpiCard icon={<Icon name="percent" size={22} />} value="USD 4.5k" label="Hills commission" hint="5% of gross" />
        <KpiCard icon={<Icon name="scale" size={22} />} value="USD 85.1k" label="Your net" />
        <KpiCard icon={<Icon name="hourglass" size={22} />} value="USD 38.9k" label="Payout pending" />
      </div>
      <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Payouts are recorded, not initiated here">
          Transfer timing follows the final commercial policy. This view shows what Hills has confirmed and what is still pending.
        </InlineAlert>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: 3 }, { value: 'pending', label: 'Pending', count: 2 }, { value: 'paid', label: 'Paid out', count: 1 }]} />
        <DataTable rows={rows} columns={[
          { key: 'order', header: 'Order', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.order}</span> },
          { key: 'buyer', header: 'Buyer' },
          { key: 'gross', header: 'Gross sale', align: 'end', numeric: true },
          { key: 'fee', header: 'Hills fee', align: 'end', numeric: true },
          { key: 'net', header: 'Your net', align: 'end', numeric: true },
          { key: 'status', header: 'Payout', render: (r) => <StatusBadge status={r.status} size="sm" label={r.status === 'paid' ? 'Paid out' : r.status === 'review' ? 'Awaiting payout run' : 'Buyer payment pending'} /> },
        ]} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(300px,1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
          <Card header={<span className="hc-label">HC-2026-0396 payout</span>}>
            <Timeline items={[
              { label: 'Buyer payment confirmed', timestamp: '21 Aug 2026' },
              { label: 'Delivered & accepted', timestamp: '22 Aug 2026' },
              { label: 'Settlement calculated', timestamp: '23 Aug 2026', description: 'Gross USD 48,600 · fee USD 2,430 · net USD 46,170' },
              { label: 'Payout recorded', timestamp: '25 Aug 2026', meta: <StatusBadge status="paid" size="sm" label="Reference PO-8841" /> },
            ]} />
          </Card>
          <Card padding="none" header={<span className="hc-label">Settlement documents</span>}>
            <DocumentRow name="settlement-0396.pdf" kind="Settlement statement" issuedOn="23 Aug 2026" amount="USD 46,170" icon={<Icon name="file-text" size={18} />} onDownload={() => {}} />
            <DocumentRow name="payout-advice-8841.pdf" kind="Payout advice" issuedOn="25 Aug 2026" icon={<Icon name="banknote" size={18} />} onDownload={() => {}} />
          </Card>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Settlements });
