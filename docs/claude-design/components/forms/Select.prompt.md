Native single-choice select for short, known lists (grade, process, incoterm, currency).

```jsx
<Field label="Processing"><Select placeholder="Any process" options={['Washed','Natural','Honey','Anaerobic']} /></Field>
```

For long or searchable lists use `Combobox`; for countries use `CountryField`.
