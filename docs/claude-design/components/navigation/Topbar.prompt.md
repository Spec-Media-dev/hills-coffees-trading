Dashboard top strip: workspace eyebrow + identity on the leading edge, theme/language/profile controls trailing.

```jsx
<Topbar workspaceLabel="Admin workspace" subtitle="adminhills@gmail.com"
  actions={<><ThemeToggle theme={theme} onChange={setTheme} /><LanguageSwitcher lang="en" onChange={setLang} /></>} />
```
