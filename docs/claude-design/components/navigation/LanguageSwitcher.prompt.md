EN ⇄ AR toggle. It shows the language you will get, not the one you are in.

```jsx
<LanguageSwitcher lang={lang} onChange={(l) => { setLang(l); document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; }} />
```

Switching language must also switch `dir` and the Arabic font stack — RTL is a real layout, not right-aligned text.
