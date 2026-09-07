Uploaded transfer evidence — buyer sees it read-only, admin finance verifies or rejects it.

```jsx
<PaymentProofCard fileName="swift-copy-0418.pdf" uploadedOn="5 Sep 2026" uploadedBy="Nile Traders LLC"
  amount="USD 138,240" reference="HC-2026-0418" status={<StatusBadge status="review" size="sm" />}
  actions={<><Button size="sm">Confirm payment</Button><Button size="sm" variant="destructive">Reject</Button></>} />
```

Whether proof upload is enabled at all is a pending business decision — keep the component optional in flows.
