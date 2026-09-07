Light/dark switch. Set `data-theme="dark"` on the root element — every token re-maps from there.

```jsx
<ThemeToggle theme={theme} onChange={(t) => { setTheme(t); document.documentElement.dataset.theme = t; }} />
```
