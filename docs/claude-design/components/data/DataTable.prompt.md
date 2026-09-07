The operations table behind Orders, Listings, Shipments, Users, Finance and Activity.

```jsx
<DataTable rows={orders} onRowClick={open}
  columns={[
    { key: 'ref', header: 'Order', nowrap: true },
    { key: 'buyer', header: 'Buyer' },
    { key: 'amount', header: 'Amount', align: 'end', numeric: true },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} size="sm" /> }]} />
```

Under 640px it becomes a label/value card list automatically — never a horizontally scrolling table on mobile.
Pass `emptyState={<EmptyState … />}` so the zero-row case is designed, not blank.
