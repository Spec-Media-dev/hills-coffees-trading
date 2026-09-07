Section switcher — order detail panels, admin queues (with counts), listing preview vs documents.

```jsx
<Tabs value={tab} onChange={setTab} tabs={[{value:'all',label:'All',count:42},{value:'review',label:'Under review',count:6}]} />
<Tabs variant="pill" value={tab} onChange={setTab} tabs={['Preview','Documents','Activity']} />
```

The active underline is Golden Ochre — the one place gold appears as a state marker.
