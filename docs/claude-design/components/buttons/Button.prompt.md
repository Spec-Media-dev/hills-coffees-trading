The standard action control — one primary action per view, everything else secondary/outline/text.

```jsx
<Button variant="primary" iconLeft={<Icon name="shopping-cart" size={16} />}>Add to cart</Button>
<Button variant="outline" size="sm">Download proforma</Button>
<Button variant="destructive" loading>Reject application</Button>
```

Variants: `primary` (forest), `secondary` (white card + border), `outline`, `text`, `accent` (Golden Ochre — selective), `destructive`.
Sizes `sm` 36 / `md` 44 / `lg` 52px; `md` and up meet the 44px touch minimum. Supports `loading` and `disabled`.
