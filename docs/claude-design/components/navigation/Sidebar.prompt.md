Primary navigation for the Buyer, Seller and Admin dashboards. Always dark forest, regardless of theme.

```jsx
<Sidebar logoSrc="assets/logo-horizontal.png" activeKey="dashboard" onNavigate={go}
  footerNote="Administrator access is verified on the server."
  groups={[{ label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: <Icon name="layout-grid" size={18} /> }] },
           { label: 'Catalog', items: [{ key: 'offers', label: 'Offers', icon: <Icon name="package" size={18} /> }] }]} />
```

Group labels are Golden Ochre uppercase; the active item is a filled `--forest-500` block. In RTL it mirrors to the right edge.
