Delivery summary for the buyer, seller and admin shipment lists.

```jsx
<ShipmentCard shipmentId="SHP-4471" orderReference="HC-2026-0418" eta="18 Sep 2026"
  destination="Jebel Ali, Dubai" quantity="480 bags" incoterm="CIF"
  status={<StatusBadge status="dispatched" size="sm" />}
  actionRequired="Confirm handover quantity before pickup" />
```

`actionRequired` turns the border gold — reserve it for shipments waiting on this user.
