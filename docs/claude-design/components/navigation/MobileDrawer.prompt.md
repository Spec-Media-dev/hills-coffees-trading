Mobile navigation for the public site and dashboards. 52px rows, sheet slides from the inline-end edge.

```jsx
<MobileDrawer open={open} onClose={close} links={navLinks} activeKey="origins" onNavigate={go}
  footer={<><Button fullWidth>Apply as buyer</Button><LanguageSwitcher variant="onLight" lang={lang} onChange={setLang} /></>} />
```
