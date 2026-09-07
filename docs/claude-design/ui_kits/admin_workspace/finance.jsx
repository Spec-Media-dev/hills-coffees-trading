const { KpiCard, DataTable, StatusBadge, PaymentProofCard, Button, Icon, Tabs, DatePicker, Card } = window.HillsCoffeeDesignSystem_ca006d;

const PAYMENTS = [
  { id: 1, ref: 'HC-2026-0418', buyer: 'Nile Traders LLC', amount: 'USD 138,240', method: 'Bank transfer', received: '5 Sep 2026', status: 'review' },
  { id: 2, ref: 'HC-2026-0417', buyer: 'Levant Roasters', amount: 'USD 34,560', method: 'Bank transfer', received: '4 Sep 2026', status: 'paid' },
  { id: 3, ref: 'HC-2026-0412', buyer: 'Gulf Coffee Co.', amount: 'USD 86,400', method: 'Bank transfer', received: '1 Sep 2026', status: 'paid' },
  { id: 4, ref: 'HC-2026-0409', buyer: 'Anatolia Coffee', amount: 'USD 21,600', method: 'Bank transfer', received: '29 Aug 2026', status: 'refunded' },
];

const SETTLEMENTS = [
  { id: 1, seller: 'Abyssinia Exports', gross: 'USD 96,000', fee: 'USD 4,800', net: 'USD 91,200', status: 'paymentPending' },
  { id: 2, seller: 'Kigali Lots Ltd', gross: 'USD 42,000', fee: 'USD 2,100', net: 'USD 39,900', status: 'paid' },
];

function AdminFinance() {
  const [tab, setTab] = React.useState('incoming');
  return (
    <>
      <PageHead title="Finance & payments" subtitle="Incoming transfers, verification queue and seller settlements."
        actions={<DatePicker range icon={<Icon name="calendar" size={16} />} />} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-5)' }}>
        <KpiCard onDark icon={<Icon name="banknote" size={22} />} value="USD 259k" label="Confirmed this period" />
        <KpiCard onDark icon={<Icon name="hourglass" size={22} />} value="1" label="Awaiting verification" />
        <KpiCard onDark icon={<Icon name="rotate-ccw" size={22} />} value="1" label="Refunds processed" />
        <KpiCard onDark icon={<Icon name="scale" size={22} />} value="USD 91.2k" label="Seller payouts pending" />
      </div>
      <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'incoming', label: 'Incoming payments', count: 4 }, { value: 'verify', label: 'Verification queue', count: 1 }, { value: 'settlements', label: 'Seller settlements', count: 2 }]} />
        {tab === 'incoming' && (
          <DataTable rows={PAYMENTS} columns={[
            { key: 'ref', header: 'Order', nowrap: true },
            { key: 'buyer', header: 'Buyer' },
            { key: 'method', header: 'Method' },
            { key: 'received', header: 'Received', nowrap: true },
            { key: 'amount', header: 'Amount', align: 'end', numeric: true },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
          ]} />
        )}
        {tab === 'verify' && (
          <PaymentProofCard fileName="swift-copy-0418.pdf" uploadedOn="5 Sep 2026" uploadedBy="Nile Traders LLC"
            amount="USD 138,240" reference="HC-2026-0418" status={<StatusBadge status="review" size="sm" />}
            note="Match the transfer reference against the bank statement before confirming."
            actions={<><Button size="sm">Confirm payment</Button><Button size="sm" variant="destructive">Reject proof</Button><Button size="sm" variant="text">Open order</Button></>} />
        )}
        {tab === 'settlements' && (
          <DataTable rows={SETTLEMENTS} columns={[
            { key: 'seller', header: 'Seller', nowrap: true },
            { key: 'gross', header: 'Gross sale', align: 'end', numeric: true },
            { key: 'fee', header: 'Hills fee', align: 'end', numeric: true },
            { key: 'net', header: 'Seller net', align: 'end', numeric: true },
            { key: 'status', header: 'Payout', render: (r) => <StatusBadge status={r.status} size="sm" label={r.status === 'paid' ? 'Paid out' : 'Payout pending'} /> },
            { key: 'go', header: '', align: 'end', render: () => <Button size="sm" variant="outline">Record payout</Button> },
          ]} />
        )}
        <Card><span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>VAT display, proforma approval and payout timing are pending business decisions — these tables are designed so the logic can switch without a redesign.</span></Card>
      </div>
    </>
  );
}

Object.assign(window, { AdminFinance });
