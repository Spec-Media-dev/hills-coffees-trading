Mutually exclusive choice as explained cards — the Buyer/Seller role select and fulfilment options.

```jsx
<RadioGroup name="role" layout="row" value={role} onChange={setRole} options={[
  { value: 'buyer', label: 'Buy green coffee', description: 'Source lots, place orders, track payments and shipments' },
  { value: 'seller', label: 'Sell green coffee', description: 'List lots, manage sales orders and settlements' }]} />
```

There is no combined Seller/Buyer role in this release — never offer a third "both" option.
