Guard for destructive or state-changing admin actions.

```jsx
<ConfirmationModal open={open} onClose={close} onConfirm={suspend} tone="danger"
  title="Suspend this seller?" message="Live listings will be hidden immediately."
  consequence="6 live listings will be unpublished and 2 open orders flagged for review."
  confirmLabel="Suspend seller" />
```
