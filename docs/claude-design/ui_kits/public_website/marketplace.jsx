const { ListingCard, SearchField, FilterChip, SortControl, Pagination, Button, Drawer, Select, Field, Combobox, Icon, StatusBadge, Skeleton, EmptyState } = window.HillsCoffeeDesignSystem_ca006d;

const ALL = [
  { title: 'Yirgacheffe Kochere Lot 14', origin: 'Ethiopia', region: 'Yirgacheffe', grade: 'G1', process: 'Washed', harvest: '2025/26', quantity: '320 bags · 60kg', price: 'USD 4.80 / kg', seller: 'hills' },
  { title: 'Guji Hambela Natural', origin: 'Ethiopia', region: 'Guji', grade: 'G1', process: 'Natural', harvest: '2025/26', quantity: '140 bags · 60kg', price: 'USD 5.40 / kg', seller: 'verified', sellerName: 'Abyssinia Exports' },
  { title: 'Huila Pitalito Lot 07', origin: 'Colombia', region: 'Huila', grade: 'Supremo 17/18', process: 'Washed', harvest: '2025/26', quantity: '180 bags · 70kg', price: 'USD 5.15 / kg', seller: 'verified', sellerName: 'Andes Green SAS' },
  { title: 'Nyeri AA Karatina', origin: 'Kenya', region: 'Nyeri', grade: 'AA', process: 'Washed', harvest: '2025/26', quantity: '96 bags · 60kg', priceLocked: true, seller: 'hills' },
  { title: 'Cerrado Mineiro Fine Cup', origin: 'Brazil', region: 'Cerrado', grade: 'NY2 17/18', process: 'Natural', harvest: '2025/26', quantity: '420 bags · 60kg', price: 'USD 3.95 / kg', seller: 'hills' },
  { title: 'Nyamasheke Honey Lot 3', origin: 'Rwanda', region: 'Nyamasheke', grade: 'A1', process: 'Honey', harvest: '2025/26', quantity: '64 bags · 60kg', price: 'USD 6.10 / kg', seller: 'verified', sellerName: 'Kigali Lots Ltd' },
];

function Marketplace({ onNavigate }) {
  const [q, setQ] = React.useState('');
  const [facets, setFacets] = React.useState([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const toggle = (v) => setFacets((s) => s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);
  const rows = ALL.filter((l) => (facets.length === 0 || facets.includes(l.process) || facets.includes(l.origin) || (facets.includes('Hills lots') && l.seller === 'hills'))
    && (l.title + l.origin + l.region).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: 'var(--space-10) var(--gutter-page) var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span className="hc-eyebrow">Green coffee offers</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h1)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: 0 }}>Available lots</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-muted)', margin: 0, maxWidth: 680, textWrap: 'pretty' }}>Filter by origin, process, grade and quantity. Prices show for approved buyers; guests see specifications and availability.</p>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search lots, origins, regions" style={{ maxWidth: 340 }} />
        <Button variant="secondary" size="sm" iconLeft={<Icon name="sliders-horizontal" size={16} />} onClick={() => setFiltersOpen(true)}>All filters</Button>
        {['Washed', 'Natural', 'Honey', 'Ethiopia', 'Colombia', 'Hills lots'].map((v) => (
          <FilterChip key={v} label={v} selected={facets.includes(v)} onToggle={() => toggle(v)} onRemove={() => toggle(v)} />
        ))}
        <span style={{ marginInlineStart: 'auto' }}><SortControl value="newest" direction="desc" onChange={() => {}} onDirectionChange={() => {}} options={[{ value: 'newest', label: 'Newest' }, { value: 'price', label: 'Price / kg' }, { value: 'qty', label: 'Available quantity' }]} /></span>
      </div>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-5)' }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="card" height={380} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Icon name="search-x" size={24} />} title="No lots match these filters" message="Clear a filter or widen the origin selection." action={<Button onClick={() => { setFacets([]); setQ(''); }}>Clear filters</Button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-5)' }}>
          {rows.map((l) => <ListingCard key={l.title} {...l} onOpen={() => onNavigate('listing')} />)}
        </div>
      )}
      <Pagination page={1} pageCount={25} onPageChange={() => {}} totalLabel={'Showing 1–' + rows.length + ' of 148 lots'} />
      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters"
        footer={<><Button variant="text" onClick={() => setFacets([])}>Reset</Button><Button onClick={() => setFiltersOpen(false)}>Show {rows.length} lots</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Field label="Origin"><Combobox options={['Ethiopia', 'Colombia', 'Kenya', 'Brazil', 'Rwanda']} onChange={() => {}} /></Field>
          <Field label="Process"><Select placeholder="Any process" options={['Washed', 'Natural', 'Honey', 'Anaerobic']} /></Field>
          <Field label="Grade"><Select placeholder="Any grade" options={['G1', 'AA', 'Supremo 17/18', 'NY2 17/18']} /></Field>
          <Field label="Minimum quantity" hint="Bags of 60kg"><Select placeholder="Any quantity" options={['50+', '100+', '250+', '500+']} /></Field>
          <Field label="Warehouse"><Select placeholder="Any location" options={['Jebel Ali, Dubai', 'Damietta, Egypt', 'Antwerp']} /></Field>
        </div>
      </Drawer>
    </div>
  );
}

Object.assign(window, { Marketplace });
