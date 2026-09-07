const { Button, ListingCard, StatusBadge, Card, Icon, InlineAlert } = window.HillsCoffeeDesignSystem_ca006d;

const LOTS = [
  { title: 'Yirgacheffe Kochere Lot 14', origin: 'Ethiopia', region: 'Yirgacheffe', grade: 'G1', process: 'Washed', harvest: '2025/26', quantity: '320 bags · 60kg', price: 'USD 4.80 / kg', seller: 'hills' },
  { title: 'Huila Pitalito Lot 07', origin: 'Colombia', region: 'Huila', grade: 'Supremo 17/18', process: 'Washed', harvest: '2025/26', quantity: '180 bags · 70kg', price: 'USD 5.15 / kg', seller: 'verified', sellerName: 'Andes Green SAS' },
  { title: 'Nyeri AA Karatina', origin: 'Kenya', region: 'Nyeri', grade: 'AA', process: 'Washed', harvest: '2025/26', quantity: '96 bags · 60kg', priceLocked: true, seller: 'hills' },
];

function Home({ onNavigate }) {
  return (
    <>
      <section style={{ position: 'relative', background: 'var(--gradient-editorial)', color: 'var(--brand-cream)', padding: 'clamp(64px,9vw,140px) var(--gutter-page)' }}>
        <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(280px,.85fr)', gap: 'var(--space-16)', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-on-dark)' }}>Green coffee sourcing & trading</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-hero)', lineHeight: 'var(--lh-display)', letterSpacing: 'var(--tracking-display)', fontWeight: 'var(--weight-bold)', margin: 0, color: 'var(--brand-cream)' }}>Beyond the origin</h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', lineHeight: 'var(--lh-body)', color: 'rgba(238,228,209,.88)', maxWidth: 560, margin: 0, textWrap: 'pretty' }}>
              Traceable lots from producing regions, held in bonded warehouses and contracted directly with roasters and importers. Every lot carries its origin, grade, process and available quantity.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button size="lg" onClick={() => onNavigate('marketplace')} iconRight={<Icon name="arrow-right" size={18} />} style={{ background: 'var(--brand-cream)', color: 'var(--brand-forest)' }}>Browse green coffee</Button>
              <Button size="lg" variant="outline" style={{ color: 'var(--brand-cream)', borderColor: 'rgba(238,228,209,.5)' }}>Apply as seller</Button>
            </div>
          </div>
          <ImagePlaceholder ratio="4 / 5" label="Full-bleed hero photography: harvest or warehouse, documentary editorial, natural light. No image assets were supplied with the brand kit." style={{ background: 'rgba(9,15,13,.35)', border: '1px solid rgba(238,228,209,.24)' }} />
        </div>
      </section>

      <Section eyebrow="Live offers" title="Lots available now" lead="Hills-owned lots and lots from verified sellers, side by side. Contract pricing shows once your buyer account is approved."
        tone="page">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-5)' }}>
          {LOTS.map((l) => <ListingCard key={l.title} {...l} onOpen={() => onNavigate('listing')} status={l.priceLocked ? <StatusBadge status="live" size="sm" /> : null} />)}
        </div>
        <Button variant="secondary" onClick={() => onNavigate('marketplace')} style={{ alignSelf: 'flex-start' }}>See all 148 lots</Button>
      </Section>

      <Section eyebrow="Origins" title="Where the coffee comes from" tone="cream"
        lead="Origin profiles tie each producing region to the lots currently in stock.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-5)' }}>
          {[['Ethiopia', '42 lots'], ['Colombia', '31 lots'], ['Kenya', '18 lots'], ['Rwanda', '12 lots'], ['Brazil', '26 lots']].map(([name, lots]) => (
            <div key={name} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ImagePlaceholder ratio="3 / 2" label={name + ' origin imagery'} style={{ borderRadius: 0 }} />
              <div style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{lots} in stock</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="How trading works" title="Verified on both sides">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 'var(--space-5)' }}>
          {[['shield-check', 'KYB before trading', 'Buyers and sellers complete company verification before any commercial action is enabled.'],
            ['file-text', 'Documented lots', 'Specs, origin, grade, process and warehouse location on every offer, with documents attached.'],
            ['truck', 'Shipment visibility', 'From requested to delivered, with proof of delivery and shipping documents in one place.'],
            ['scale', 'Clear settlement', 'Seller settlements separate gross sale, Hills fee and net payout — no hidden arithmetic.']].map(([icon, title, body]) => (
            <Card key={title}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <Icon name={icon} size={24} color="var(--accent-text)" />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{title}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{body}</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="cream">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,420px)', gap: 'var(--space-12)', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: 0 }}>Start trading with Hills</h2>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-muted)', margin: 0, lineHeight: 'var(--lh-body)', textWrap: 'pretty' }}>
              Choose one track. Buyers source and order; sellers list and settle. Both need company verification first — it takes one session and a set of documents.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button size="lg">Apply as buyer</Button>
              <Button size="lg" variant="outline">Apply as seller</Button>
            </div>
          </div>
          <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Guests can browse, not buy">
            Public lots and specifications are open. Ordering, pricing and documents unlock after buyer approval.
          </InlineAlert>
        </div>
      </Section>
    </>
  );
}

Object.assign(window, { Home });
