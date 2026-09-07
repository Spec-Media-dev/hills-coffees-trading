const { Button, StatusBadge, Card, Tabs, InlineAlert, DocumentRow, Icon, Breadcrumbs, Input, Field } = window.HillsCoffeeDesignSystem_ca006d;

function ListingDetail({ onNavigate }) {
  const [tab, setTab] = React.useState('specs');
  return (
    <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: 'var(--space-8) var(--gutter-page) var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <Breadcrumbs onNavigate={() => onNavigate('marketplace')} items={[{ key: 'marketplace', label: 'Green coffee' }, { key: 'et', label: 'Ethiopia' }, { label: 'Yirgacheffe Kochere Lot 14' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(300px,.7fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <ImagePlaceholder ratio="16 / 10" label="Lot photography: green beans, bags in warehouse, quality inspection. Documentary editorial, natural light." />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {[0, 1, 2, 3].map((i) => <ImagePlaceholder key={i} ratio="1 / 1" label="" style={{ width: 84, borderRadius: 'var(--radius-sm)' }} />)}
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'specs', label: 'Specifications' }, { value: 'origin', label: 'Origin & traceability' }, { value: 'docs', label: 'Documents', count: 3 }]} />
          {tab === 'specs' && (
            <Card>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 'var(--space-5)' }}>
                {[['Grade', 'G1'], ['Process', 'Washed'], ['Variety', 'Heirloom'], ['Screen size', '15+'], ['Moisture', '10.4%'], ['Harvest', '2025/26'], ['Cupping score', '86.5'], ['Packaging', 'GrainPro in jute, 60kg'], ['Warehouse', 'Jebel Ali, Dubai'], ['Certifications', 'None declared']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</dt>
                    <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {tab === 'origin' && (
            <Card>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)', margin: 0, maxWidth: 640, textWrap: 'pretty' }}>
                Kochere sits in the Gedeo zone of southern Ethiopia, at 1,900–2,100 m. This lot was collected from smallholder deliveries to the Kochere washing station, fully washed on raised beds and dried for 12 days. Full station and delivery records are available to approved buyers.
              </p>
            </Card>
          )}
          {tab === 'docs' && (
            <Card padding="none">
              <DocumentRow name="lot-14-spec-sheet.pdf" kind="Specification sheet" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} onPreview={() => {}} onDownload={() => {}} />
              <DocumentRow name="lot-14-cupping-notes.pdf" kind="Cupping notes" issuedOn="1 Sep 2026" icon={<Icon name="file-text" size={18} />} onPreview={() => {}} onDownload={() => {}} />
              <DocumentRow name="warehouse-holding-cert.pdf" kind="Warehouse certificate" issuedOn="28 Aug 2026" icon={<Icon name="warehouse" size={18} />} status={<StatusBadge status="approved" size="sm" />} />
            </Card>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', position: 'sticky', top: 'calc(var(--header-h) + var(--space-5))' }}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--forest-100)', color: 'var(--brand-forest)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Hills Coffee</span>
                <StatusBadge status="live" size="sm" />
              </div>
              <span className="hc-label">Ethiopia · Yirgacheffe</span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Yirgacheffe Kochere Lot 14</h1>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>USD 4.80</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>/ kg · ex-warehouse</span>
              </div>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>320 bags available · 60kg each · minimum 20 bags</span>
              <Field label="Quantity (bags)"><Input type="number" defaultValue="40" suffix="bags" /></Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Button size="lg" fullWidth iconLeft={<Icon name="shopping-cart" size={18} />}>Add to cart</Button>
                <Button variant="outline" fullWidth>Request sample</Button>
              </div>
              <InlineAlert tone="info" icon={<Icon name="info" size={16} />}>Commercial actions require an approved buyer account. Signing in keeps this lot in your cart.</InlineAlert>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ListingDetail });
