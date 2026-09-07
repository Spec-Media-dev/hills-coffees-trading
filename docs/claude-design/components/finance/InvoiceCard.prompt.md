Proforma / final invoice panel with the payment step's transfer instructions.

```jsx
<InvoiceCard number="PI-2026-0418" issuedOn="4 Sep 2026" amount="138,240"
  status={<StatusBadge status="paymentPending" />}
  lines={[{label:'2 lots · 480 bags',value:'USD 136,000'},{label:'Handling & documentation',value:'USD 2,240'}]}
  instructions={'Beneficiary: Hills Coffee Trading FZ-LLC\nIBAN: AE00 0000 0000 0000 0000 000\nReference: HC-2026-0418'}
  actions={<><Button>Upload payment proof</Button><Button variant="outline">Download PDF</Button></>} />
```

The payment reference must always be visible and copyable — it is how finance matches the transfer.
