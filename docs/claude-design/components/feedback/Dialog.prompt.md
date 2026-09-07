Modal for focused tasks — request more info, add to cart quantity, upload payment proof.

```jsx
<Dialog open={open} onClose={close} title="Request more information"
  description="Name exactly what the applicant must provide."
  footer={<><Button variant="text" onClick={close}>Cancel</Button><Button>Send request</Button></>}>
  <Field label="Message to applicant"><Textarea rows={4} /></Field>
</Dialog>
```

Escape and backdrop click both close. For irreversible actions use `ConfirmationModal`.
