The single status pill used everywhere a lifecycle state appears.

```jsx
<StatusBadge status="paymentPending" />
<StatusBadge status="inTransit" size="sm" />
<StatusBadge status="moreInfo" label="مطلوب معلومات إضافية" />
```

Never communicate a state with colour alone — the dot plus label is the contract. Use `refunded`/`disputed` rather than inventing new keys.
