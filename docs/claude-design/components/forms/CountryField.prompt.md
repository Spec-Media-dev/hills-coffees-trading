Searchable country picker for KYB jurisdiction, company address and origin filters.

```jsx
<Field label="Jurisdiction of registration" required><CountryField value={country} onChange={setCountry} /></Field>
```

Wraps `Combobox`; pass `countries` to narrow the list (e.g. origin countries only).
