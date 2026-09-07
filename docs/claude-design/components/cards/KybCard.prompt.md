Verification state panel on the buyer/seller dashboard and the KYB settings page.

```jsx
<KybCard companyName="Nile Traders LLC" role="Buyer" progress={80}
  status={<StatusBadge status="moreInfo" />}
  missingItems={['Certified trade licence (expired copy uploaded)', 'Authorised signatory passport']}
  action={<Button>Continue application</Button>} />
```

When status is `moreInfo`, `missingItems` is mandatory — the guide requires naming exactly what is missing plus a direct CTA.
