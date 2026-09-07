const { Button, Card, Icon, Breadcrumbs, StatusBadge } = window.HillsCoffeeDesignSystem_ca006d;

function Knowledge({ onNavigate }) {
  return (
    <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: 'var(--space-8) var(--gutter-page) var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <Breadcrumbs onNavigate={() => onNavigate('knowledge')} items={[{ key: 'knowledge', label: 'Knowledge' }, { label: 'Reading a green coffee spec sheet' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(260px,320px)', gap: 'var(--space-12)', alignItems: 'start' }}>
        <article style={{ maxWidth: 'var(--container-narrow)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <span className="hc-eyebrow">Sourcing fundamentals · 6 min read</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h1)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', lineHeight: 'var(--lh-heading)', color: 'var(--text-strong)', margin: 0 }}>Reading a green coffee spec sheet</h1>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-muted)', lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>
            Grade, screen size, moisture and process each answer a different question about a lot. Read together, they tell you how the coffee will behave in your roastery and what it will cost you to hold.
          </p>
          <ImagePlaceholder ratio="16 / 9" label="Article lead image: quality inspection or sample table. No editorial imagery was supplied with the brand kit." />
          {[['Grade is a claim about defects', 'A grade describes the defect count in a standard sample, measured against the producing country\u2019s own scale. G1 in Ethiopia and AA in Kenya are not the same measurement, so compare within an origin before comparing across origins.'],
            ['Screen size is about uniformity', 'Screen size tells you how evenly the beans will take heat. A tight screen range roasts predictably; a wide one needs a slower approach to first crack.'],
            ['Moisture sets your holding window', 'Between 9.5% and 12% is the working range for most contracts. Below that the coffee is already drying out; above it you are buying storage risk.']].map(([h, body]) => (
            <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{h}</h2>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', color: 'var(--text-body)', lineHeight: 'var(--lh-relaxed)', margin: 0, textWrap: 'pretty' }}>{body}</p>
            </div>
          ))}
        </article>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', position: 'sticky', top: 'calc(var(--header-h) + var(--space-5))' }}>
          <Card header={<span className="hc-label">Related lots</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[['Yirgacheffe Kochere Lot 14', 'G1 · Washed'], ['Nyeri AA Karatina', 'AA · Washed']].map(([t, s]) => (
                <button key={t} onClick={() => onNavigate('listing')} style={{ textAlign: 'start', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{t}</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{s}</span>
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => onNavigate('marketplace')}>Browse all lots</Button>
            </div>
          </Card>
          <Card header={<span className="hc-label">Need a quote?</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>Approved buyers see contract pricing and can request an RFQ on any lot.</span>
              <Button size="sm">Apply as buyer</Button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { Knowledge });
