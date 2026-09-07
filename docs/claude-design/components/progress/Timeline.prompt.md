Chronology for order, payment, shipment and KYB history.

```jsx
<Timeline items={[
  { label: 'Order placed', timestamp: '4 Sep 2026, 11:20' },
  { label: 'Payment confirmed', timestamp: '5 Sep 2026, 09:04', meta: <StatusBadge status="paid" size="sm" /> },
  { label: 'Dispatched', state: 'current', timestamp: '6 Sep 2026, 14:41' },
  { label: 'Delivered', state: 'todo' }]} />
```

The current node is Golden Ochre, completed nodes are green, future nodes are hollow.
