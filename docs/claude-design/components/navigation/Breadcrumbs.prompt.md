Trail for nested dashboard views (order → shipment, KYB → document).

```jsx
<Breadcrumbs onNavigate={go} items={[{key:'orders',label:'Orders'},{label:'HC-2026-0418'}]} />
```

The separator is a forward slash and flips direction in RTL along with the layout.
