Type-to-filter single select — origins, regions, varieties, warehouses, taxonomy values.

```jsx
<Combobox value={origin} onChange={setOrigin}
  options={[{value:'et',label:'Ethiopia',meta:'12 lots'},{value:'co',label:'Colombia',meta:'8 lots'}]} />
```

Shows `meta` on the trailing edge for counts. Falls back to `emptyText` when nothing matches.
