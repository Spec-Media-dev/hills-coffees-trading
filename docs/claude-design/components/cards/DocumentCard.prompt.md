A single stored document — KYB evidence, invoices, shipping paperwork, proof of delivery.

```jsx
<DocumentCard name="trade-licence-2026.pdf" kind="Trade licence" size="1.4 MB" uploadedOn="2 Sep 2026"
  icon={<Icon name="file-text" size={20} />} status={<StatusBadge status="approved" size="sm" />}
  actions={<IconButton icon={<Icon name="download" size={16} />} label="Download" size="sm" variant="outline" />} />
```

For dense document tables use `DocumentRow` instead.
