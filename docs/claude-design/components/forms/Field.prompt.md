Wraps any control with its label, hint and inline error. Every KYB/checkout field uses it.

```jsx
<Field label="Legal company name" required hint="Exactly as printed on the trade licence">
  <Input placeholder="Hills Coffee Trading FZ-LLC" />
</Field>
```

Also exports `controlBase(state)` — the shared 44px control box style used by Input, Select and friends.
