Renders a Lucide glyph — use it anywhere an icon is needed instead of inlining SVG paths.

```jsx
<Icon name="package" size={20} />
<Icon name="map-pin" size={16} color="var(--accent-text)" />
```

Requires the Lucide UMD script on the page: `<script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js"></script>`.
Icons are always line/outline at one stroke weight; never mix icon families in a screen.
