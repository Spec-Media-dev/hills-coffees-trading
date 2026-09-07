Wizard progress — never put KYB or Create Listing on one long form.

```jsx
<Stepper current={2} onStepClick={goTo} steps={[
  { label: 'Company', hint: 'Complete' },
  { label: 'Ownership', hint: 'Complete' },
  { label: 'Banking & evidence', hint: 'Passport copy expired', state: 'error' },
  { label: 'Agreements' }, { label: 'Review & submit' }]} />
```
