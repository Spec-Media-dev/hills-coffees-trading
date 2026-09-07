Header for the public B2B site — the horizontal logo lockup sits at 150px minimum width.

```jsx
<Header logoSrc="assets/logo-horizontal.png" activeKey="marketplace" onNavigate={go}
  links={[{key:'marketplace',label:'Green coffee'},{key:'origins',label:'Origins'},{key:'knowledge',label:'Knowledge'},{key:'about',label:'About'}]}
  actions={<><Button variant="text" size="sm">Sign in</Button><Button size="sm">Apply as buyer</Button></>} />
```
