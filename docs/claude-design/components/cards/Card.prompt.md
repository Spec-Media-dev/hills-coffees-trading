The generic panel every other card is built on.

```jsx
<Card header={<span className="hc-label">Recent activity</span>} padding="none">
  <DataTable rows={rows} columns={cols} />
</Card>
```

Cards are white on cream in light mode, `--surface-card` (#1E2C26) in dark. Never a coloured left border.
