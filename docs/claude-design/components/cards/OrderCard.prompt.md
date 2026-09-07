Order summary as a card — the mobile fallback for the orders table and the "recent orders" list.

```jsx
<OrderCard reference="HC-2026-0418" date="4 Sep 2026" counterparty="Abyssinia Exports"
  items="2 lots · 480 bags" amount="USD 138,240" status={<StatusBadge status="paymentPending" size="sm" />}
  action={<Button size="sm" variant="outline">Upload payment proof</Button>} onOpen={open} />
```
