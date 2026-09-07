Dropzone plus uploaded-file rows — KYB documents, listing media, payment proof, shipping docs.

```jsx
<FileUpload required icon={<Icon name="upload" size={18} />}
  label="Trade licence" hint="PDF · up to 10 MB"
  files={[{ name: 'trade-licence-2026.pdf', size: '1.4 MB', progress: 100 }]} onRemove={remove} />
```

`state="error"` for a rejected document, `"success"` once accepted by the reviewer.
