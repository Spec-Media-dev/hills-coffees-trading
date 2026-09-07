const { DataTable, StatusBadge, Tabs, SearchField, FilterChip, Button, Icon, Pagination, EmptyState } = window.HillsCoffeeDesignSystem_ca006d;

const ROWS = [
  { id: 1, company: 'Nile Traders LLC', role: 'Buyer', country: 'Egypt', submitted: '2 Sep 2026', status: 'review', risk: 'Standard' },
  { id: 2, company: 'Abyssinia Exports', role: 'Seller', country: 'Ethiopia', submitted: '2 Sep 2026', status: 'moreInfo', risk: 'Licence expiring' },
  { id: 3, company: 'Gulf Coffee Co.', role: 'Buyer', country: 'UAE', submitted: '1 Sep 2026', status: 'submitted', risk: 'Standard' },
  { id: 4, company: 'Kigali Lots Ltd', role: 'Seller', country: 'Rwanda', submitted: '31 Aug 2026', status: 'approved', risk: 'Standard' },
  { id: 5, company: 'Levant Roasters', role: 'Buyer', country: 'Jordan', submitted: '30 Aug 2026', status: 'rejected', risk: 'Unverified UBO' },
];

function AdminApprovals({ onOpen }) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState(null);
  const rows = ROWS.filter((r) => (tab === 'all' || (tab === 'review' ? ['review', 'submitted'].includes(r.status) : r.status === tab))
    && (!roleFilter || r.role === roleFilter)
    && r.company.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Buyer & seller approvals"
        subtitle="One queue for both roles. Filter by role when a reviewer owns a single track."
        actions={<Button variant="secondary" iconLeft={<Icon name="download" size={16} />}>Export queue</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: ROWS.length }, { value: 'review', label: 'Awaiting review', count: 3 }, { value: 'moreInfo', label: 'More info', count: 1 }, { value: 'approved', label: 'Approved', count: 1 }, { value: 'rejected', label: 'Rejected', count: 1 }]} />
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search company" style={{ maxWidth: 320 }} />
          <FilterChip label="Buyers" selected={roleFilter === 'Buyer'} onToggle={() => setRoleFilter(roleFilter === 'Buyer' ? null : 'Buyer')} />
          <FilterChip label="Sellers" selected={roleFilter === 'Seller'} onToggle={() => setRoleFilter(roleFilter === 'Seller' ? null : 'Seller')} />
        </div>
        <DataTable rows={rows} onRowClick={onOpen}
          emptyState={<EmptyState icon={<Icon name="inbox" size={24} />} title="Nothing in this queue" message="Applications appear here as soon as they are submitted." />}
          columns={[
            { key: 'company', header: 'Company', nowrap: true, render: (r) => <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{r.company}</span> },
            { key: 'role', header: 'Role' },
            { key: 'country', header: 'Jurisdiction' },
            { key: 'submitted', header: 'Submitted', nowrap: true },
            { key: 'risk', header: 'Reviewer note' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> },
            { key: 'go', header: '', align: 'end', render: () => <Button size="sm" variant="outline">Review</Button> },
          ]} />
        <Pagination page={1} pageCount={3} totalLabel={'Showing 1–' + rows.length + ' of 42 applications'} onPageChange={() => {}} />
      </div>
    </>
  );
}

Object.assign(window, { AdminApprovals });
