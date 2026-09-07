const { Button, Card, Icon, Breadcrumbs, StatusBadge, ListingCard, SearchField, Field, Input, Textarea, Select, Combobox, CountryField, PhoneField, Checkbox, InlineAlert, Tabs, EmptyState, DocumentRow, Timeline } = window.HillsCoffeeDesignSystem_ca006d;

/* ---------- Origins hub ---------- */
const ORIGINS = [
  { name: 'Ethiopia', lots: 42, regions: 'Yirgacheffe · Guji · Sidamo · Limu · Harrar', harvest: 'Oct – Feb', note: 'Washed and natural heirloom lots from smallholder deliveries.' },
  { name: 'Colombia', lots: 31, regions: 'Huila · Nariño · Tolima · Cauca', harvest: 'Apr – Jun / Oct – Dec', note: 'Two harvests a year, mostly washed Caturra and Castillo.' },
  { name: 'Kenya', lots: 18, regions: 'Nyeri · Kirinyaga · Embu', harvest: 'Oct – Dec', note: 'SL28 and SL34, auction and direct lots.' },
  { name: 'Rwanda', lots: 12, regions: 'Nyamasheke · Huye', harvest: 'Mar – Jun', note: 'Bourbon washing-station lots, washed and honey.' },
  { name: 'Brazil', lots: 26, regions: 'Cerrado · Sul de Minas', harvest: 'May – Sep', note: 'Natural and pulped natural, volume contracts.' },
];

function OriginsHub({ onNavigate }) {
  const [q, setQ] = React.useState('');
  const rows = ORIGINS.filter((o) => (o.name + o.regions).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Section eyebrow="Coffee origins" title="Where the coffee comes from"
        lead="Each origin profile ties the producing regions, harvest calendar and grading conventions to the lots Hills currently holds.">
        <SearchField value={q} onChange={setQ} icon={<Icon name="search" size={16} />} placeholder="Search origin or region" style={{ maxWidth: 340 }} />
        {rows.length === 0
          ? <EmptyState icon={<Icon name="search-x" size={24} />} title="No origin matches" message="Try a region name such as Huila or Nyeri." />
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 'var(--space-5)' }}>
              {rows.map((o) => (
                <article key={o.name} onClick={() => onNavigate('origin')} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                  <ImagePlaceholder ratio="3 / 2" label={o.name + ' origin imagery'} style={{ borderRadius: 0 }} />
                  <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{o.name}</h3>
                      <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-bold)', color: 'var(--accent-text)' }}>{o.lots} lots</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{o.regions}</span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-body)', lineHeight: 'var(--lh-snug)' }}>{o.note}</span>
                    <span style={{ marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>Harvest {o.harvest}</span>
                  </div>
                </article>
              ))}
            </div>}
      </Section>
    </>
  );
}

/* ---------- Origin detail ---------- */
function OriginDetail({ onNavigate }) {
  return (
    <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: 'var(--space-8) var(--gutter-page) var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <Breadcrumbs onNavigate={() => onNavigate('origins')} items={[{ key: 'origins', label: 'Origins' }, { label: 'Ethiopia' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,.8fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span className="hc-eyebrow">Origin profile</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h1)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: 0 }}>Ethiopia</h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body-lg)', color: 'var(--text-muted)', margin: 0, maxWidth: 640, textWrap: 'pretty' }}>
              Smallholder deliveries to washing stations across the southern highlands, graded G1 to G5 on defect count. Hills contracts at station level so each lot keeps its delivery records.
            </p>
          </div>
          <ImagePlaceholder ratio="16 / 9" label="Origin imagery: highland landscape, washing station, raised drying beds. Documentary editorial, natural light." />
          <Card>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-5)' }}>
              {[['Harvest', 'October – February'], ['Shipment window', 'January – May'], ['Grades', 'G1 · G2 · G3'], ['Processes', 'Washed · Natural · Honey'], ['Varieties', 'Heirloom landraces'], ['Altitude', '1,700 – 2,200 m']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{k}</dt>
                  <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Producing regions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-4)' }}>
              {[['Yirgacheffe', '14 lots · washed, floral'], ['Guji', '11 lots · natural, fruit-forward'], ['Sidamo', '9 lots · washed and natural'], ['Limu', '5 lots · washed, balanced'], ['Harrar', '3 lots · natural, longberry']].map(([n, d]) => (
                <Card key={n} padding="sm">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{n}</span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{d}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Lots from this origin</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 'var(--space-5)' }}>
              <ListingCard title="Yirgacheffe Kochere Lot 14" origin="Ethiopia" region="Yirgacheffe" grade="G1" process="Washed" harvest="2025/26" quantity="320 bags · 60kg" price="USD 4.80 / kg" seller="hills" onOpen={() => onNavigate('listing')} />
              <ListingCard title="Guji Hambela Natural" origin="Ethiopia" region="Guji" grade="G1" process="Natural" harvest="2025/26" quantity="140 bags · 60kg" priceLocked seller="verified" sellerName="Abyssinia Exports" onOpen={() => onNavigate('listing')} />
            </div>
            <Button variant="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => onNavigate('marketplace')}>See all 42 Ethiopian lots</Button>
          </div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', position: 'sticky', top: 'calc(var(--header-h) + var(--space-5))' }}>
          <Card header={<span className="hc-label">Harvest calendar</span>}>
            <Timeline items={[
              { label: 'Harvest', timestamp: 'Oct – Feb' },
              { label: 'Processing & drying', timestamp: 'Nov – Mar' },
              { label: 'Milling & grading', timestamp: 'Dec – Apr' },
              { label: 'Shipment', state: 'current', timestamp: 'Jan – May' },
            ]} />
          </Card>
          <Card header={<span className="hc-label">Request an offer list</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>Approved buyers receive the full Ethiopian offer list with contract prices.</span>
              <Button size="sm">Apply as buyer</Button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Knowledge hub ---------- */
const ARTICLES = [
  { title: 'Reading a green coffee spec sheet', cat: 'Sourcing fundamentals', read: '6 min', lead: 'Grade, screen size, moisture and process each answer a different question about a lot.' },
  { title: 'How KYB works for buyers', cat: 'Trading with Hills', read: '4 min', lead: 'What documents you need, what the reviewer checks, and how long each state lasts.' },
  { title: 'Incoterms for green coffee', cat: 'Logistics', read: '7 min', lead: 'Who owns the risk at each handover, and what CIF actually covers on a coffee contract.' },
  { title: 'Storing green coffee without losing cup quality', cat: 'Logistics', read: '5 min', lead: 'Moisture, temperature and packaging decisions that set your holding window.' },
  { title: 'Grading systems across origins', cat: 'Sourcing fundamentals', read: '8 min', lead: 'Why G1 in Ethiopia and AA in Kenya are not the same measurement.' },
  { title: 'Settlement and commission, explained', cat: 'Trading with Hills', read: '3 min', lead: 'How gross sale, Hills fee and seller net appear on a settlement statement.' },
];

function KnowledgeHub({ onNavigate }) {
  const [cat, setCat] = React.useState('all');
  const rows = ARTICLES.filter((a) => cat === 'all' || a.cat === cat);
  return (
    <Section eyebrow="Knowledge hub" title="Sourcing, trading and logistics, explained for B2B buyers"
      lead="Practical material for people who buy and move green coffee. No brewing guides.">
      <Tabs variant="pill" value={cat} onChange={setCat} tabs={[{ value: 'all', label: 'All' }, { value: 'Sourcing fundamentals', label: 'Sourcing fundamentals' }, { value: 'Trading with Hills', label: 'Trading with Hills' }, { value: 'Logistics', label: 'Logistics' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-5)' }}>
        {rows.map((a) => (
          <article key={a.title} onClick={() => onNavigate('article')} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
            <ImagePlaceholder ratio="16 / 9" label="Article lead image" style={{ borderRadius: 0 }} />
            <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
              <span className="hc-eyebrow">{a.cat} · {a.read} read</span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0, lineHeight: 'var(--lh-heading)' }}>{a.title}</h3>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{a.lead}</span>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ---------- About ---------- */
function About({ onNavigate }) {
  return (
    <>
      <Section eyebrow="About Hills Coffee" title="A green coffee trading house, not a coffee shop"
        lead="Hills Coffee sources green coffee at origin and contracts it to roasters and importers. We hold stock in bonded warehouses, carry the paperwork, and stay accountable for what is in the bag.">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,1fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 'var(--container-narrow)' }}>
            {[['What we do', 'We buy at station and mill level, grade and hold the coffee, and sell it forward on contract. Verified sellers list their own lots alongside ours, under the same data and document requirements.'],
              ['Why traceability', 'A lot without records is a lot you cannot defend to your own customers. Every Hills lot carries origin, region, station, grade, process, harvest and warehouse position.'],
              ['Where we operate', 'Trading and operations run from Dubai and Egypt, with bonded storage in Jebel Ali, Damietta and at origin.']].map(([h, b]) => (
              <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{h}</h2>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', color: 'var(--text-body)', lineHeight: 'var(--lh-relaxed)', margin: 0, textWrap: 'pretty' }}>{b}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <ImagePlaceholder ratio="4 / 5" label="Brand imagery: warehouse or quality inspection. No photography was supplied with the brand kit." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              {[['5', 'Producing origins'], ['148', 'Lots listed'], ['3', 'Bonded warehouses'], ['2', 'Trading offices']].map(([n, l]) => (
                <Card key={l} padding="sm">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{l}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </Section>
      <Section tone="cream" title="Trade with us">
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button size="lg" onClick={() => onNavigate('marketplace')}>Browse green coffee</Button>
          <Button size="lg" variant="outline">Apply as buyer</Button>
          <Button size="lg" variant="text" onClick={() => onNavigate('contact')}>Talk to the trade desk</Button>
        </div>
      </Section>
    </>
  );
}

/* ---------- Contact ---------- */
function Contact() {
  const [sent, setSent] = React.useState(false);
  return (
    <Section eyebrow="Contact" title="Talk to the trade desk"
      lead="Sourcing enquiries, sample requests and seller applications. We answer during Gulf and Cairo business hours.">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,.8fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
        <Card>
          {sent
            ? <InlineAlert tone="success" title="Message sent" icon={<Icon name="check" size={18} />}>We reply to trade enquiries within one business day. Your reference is CT-2026-0912.</InlineAlert>
            : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
                <Field label="Company" required><Input placeholder="Company name" /></Field>
                <Field label="Country" required><CountryField /></Field>
                <Field label="Your name" required><Input placeholder="Full name" /></Field>
                <Field label="Work email" required><Input type="email" placeholder="ops@company.com" /></Field>
                <Field label="Phone" optional><PhoneField dialCode="+971" /></Field>
                <Field label="Enquiry type" required><Select options={['Buying green coffee', 'Selling green coffee', 'Sample request', 'Shipping & storage', 'Something else']} /></Field>
                <div style={{ gridColumn: '1 / -1' }}><Field label="What do you need?" required><Textarea rows={5} placeholder="Origins, volumes, grades and timing if you know them" /></Field></div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <Checkbox label="I agree to the privacy policy" description="We use your details only to answer this enquiry." />
                  <Button size="lg" style={{ alignSelf: 'flex-start' }} onClick={() => setSent(true)}>Send enquiry</Button>
                </div>
              </div>}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {[['Dubai', 'Trading & operations', '+971 50 123 4567', 'Jebel Ali Free Zone, Dubai, UAE'],
            ['Egypt', 'Trading & warehousing', '+20 10 1234 5678', 'Damietta, Egypt']].map(([city, role, phone, addr]) => (
            <Card key={city} header={<span className="hc-label">{city}</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{role}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}><Icon name="phone" size={16} />{phone}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-body)' }}><Icon name="map-pin" size={16} />{addr}</span>
                <Button size="sm" variant="outline" iconLeft={<Icon name="message-circle" size={16} />}>WhatsApp</Button>
              </div>
            </Card>
          ))}
          <ImagePlaceholder ratio="4 / 3" label="Map or location imagery for the two offices" />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Shipping & storage ---------- */
function Shipping({ onNavigate }) {
  return (
    <>
      <Section eyebrow="Shipping & storage" title="How the coffee reaches you"
        lead="Two fulfilment routes, one document trail. Choose at checkout; change it before the order is paid.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-5)' }}>
          {[['truck', 'Ship to your warehouse', 'Hills arranges the shipment against your incoterm, shares the bill of lading and packing list, and records proof of delivery on arrival.'],
            ['warehouse', 'Store with Hills', 'The lot stays in bonded storage under your contract. Request scheduled releases as you need them; storage terms apply per period.']].map(([ic, h, b]) => (
            <Card key={h}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <Icon name={ic} size={24} color="var(--accent-text)" />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{h}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>{b}</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <Section tone="cream" title="Shipment states you will see" lead="The same states appear in your portal, on the shipment card and in the documents.">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,1fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
          <Card>
            <Timeline items={[
              { label: 'Requested', description: 'Delivery requested against a paid order.' },
              { label: 'Confirmed', description: 'Warehouse capacity and pickup slot agreed.' },
              { label: 'Reserved', description: 'Quantity held for this delivery.' },
              { label: 'Picking', description: 'Bags pulled and staged.' },
              { label: 'Dispatched', state: 'current', description: 'In transit with carrier reference.' },
              { label: 'Delivered', state: 'todo', description: 'Proof of delivery attached.' },
            ]} />
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card padding="none" header={<span className="hc-label">Documents you receive</span>}>
              <DocumentRow name="Proforma invoice" kind="At order placement" icon={<Icon name="file-text" size={18} />} />
              <DocumentRow name="Final / tax invoice" kind="After payment confirmation" icon={<Icon name="file-text" size={18} />} />
              <DocumentRow name="Packing list" kind="At picking" icon={<Icon name="clipboard-list" size={18} />} />
              <DocumentRow name="Bill of lading" kind="At dispatch" icon={<Icon name="ship" size={18} />} />
              <DocumentRow name="Proof of delivery" kind="On arrival" icon={<Icon name="image" size={18} />} />
            </Card>
            <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="Storage and freight terms">
              Rates and free-storage periods are quoted per contract. Ask the trade desk for the current schedule.
            </InlineAlert>
            <Button variant="outline" onClick={() => onNavigate('contact')} style={{ alignSelf: 'flex-start' }}>Ask about a route</Button>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ---------- Help / FAQ ---------- */
const FAQ = [
  ['Trading', 'Do I need an account to see prices?', 'Guests see specifications and availability. Contract pricing appears once your buyer account is approved through KYB.'],
  ['Trading', 'What is the minimum order?', 'Set per lot — most are 20 bags of 60kg. The minimum is shown on every listing.'],
  ['Trading', 'Can one account both buy and sell?', 'No. In this release an account is either a buyer or a seller. Choose at registration.'],
  ['Verification', 'How long does KYB take?', 'Most applications are reviewed within three business days. If something is missing you will see exactly which items and a direct link to fix them.'],
  ['Verification', 'What documents do you need?', 'Trade licence, commercial registration, tax certificate, ownership and signatory evidence, and banking evidence for sellers.'],
  ['Payments', 'How do I pay?', 'Bank transfer against the proforma invoice, using the payment reference shown on the invoice. Terms are confirmed per contract.'],
  ['Payments', 'When is VAT applied?', 'VAT display follows the final commercial policy for your jurisdiction. The proforma always states what is included.'],
  ['Shipping', 'Can I leave coffee in your warehouse?', 'Yes — choose "Store with Hills" at checkout and request releases later.'],
  ['Selling', 'When do I get paid?', 'After the buyer payment clears and delivery is accepted. Your settlement shows gross sale, Hills fee and net.'],
];

function HelpFaq({ onNavigate }) {
  const [cat, setCat] = React.useState('all');
  const [open, setOpen] = React.useState(0);
  const rows = FAQ.filter((r) => cat === 'all' || r[0] === cat);
  return (
    <Section eyebrow="Help & FAQ" title="Questions we get most" lead="If your question is not here, the trade desk answers within one business day.">
      <Tabs variant="pill" value={cat} onChange={setCat} tabs={[{ value: 'all', label: 'All' }, { value: 'Trading', label: 'Trading' }, { value: 'Verification', label: 'Verification' }, { value: 'Payments', label: 'Payments' }, { value: 'Shipping', label: 'Shipping' }, { value: 'Selling', label: 'Selling' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {rows.map(([c, q, a], i) => (
            <div key={q} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', flex: 1 }}>{q}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{c}</span>
                <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={16} color="var(--text-muted)" />
              </button>
              {open === i && <div style={{ padding: '0 var(--space-5) var(--space-5)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)', maxWidth: 640 }}>{a}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card header={<span className="hc-label">Still stuck?</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', lineHeight: 'var(--lh-snug)' }}>Send the trade desk your origins, volumes and timing and we will come back with an offer list.</span>
              <Button size="sm" onClick={() => onNavigate('contact')}>Contact us</Button>
            </div>
          </Card>
          <Card header={<span className="hc-label">Related</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Button size="sm" variant="text" onClick={() => onNavigate('shipping')}>Shipping & storage</Button>
              <Button size="sm" variant="text" onClick={() => onNavigate('legal')}>Terms, privacy & returns</Button>
              <Button size="sm" variant="text" onClick={() => onNavigate('knowledge')}>Knowledge hub</Button>
            </div>
          </Card>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Legal (terms / privacy / cookies / returns) ---------- */
function Legal() {
  const [doc, setDoc] = React.useState('terms');
  const DOCS = {
    terms: { title: 'Terms of trade', updated: 'Pending legal approval', sections: [['Scope', 'These terms govern the use of the Hills Coffee B2B platform by verified buyers and sellers. Final wording is subject to Owner and Legal approval and is not yet published.'], ['Contracts', 'Each order forms a separate contract for the lot, quantity and price stated on the proforma invoice.'], ['Verification', 'Trading functions are enabled only after successful company verification (KYB) and may be suspended if documents expire.']] },
    privacy: { title: 'Privacy policy', updated: 'Pending legal approval', sections: [['What we hold', 'Company registration data, authorised contact details and the documents you upload during verification.'], ['Why we hold it', 'To verify your company, execute contracts, and meet trade and tax obligations.'], ['Retention', 'Verification records are retained for the period required by the relevant jurisdiction.']] },
    cookies: { title: 'Cookies', updated: 'Pending legal approval', sections: [['Essential', 'Session and security cookies required to keep you signed in.'], ['Analytics', 'Aggregate usage measurement on public pages only.']] },
    returns: { title: 'Returns & refunds', updated: 'Pending commercial decision', sections: [['Position', 'Green coffee is a contracted commodity; the returns position is being finalised with Owner, Finance and Legal.'], ['Disputes', 'Quantity or quality disputes are raised on the order and handled through the Disputed state with documented evidence.'], ['Refunds', 'Where a refund is agreed, a credit note is issued against the original invoice and the order moves to Refunded.']] },
  };
  const d = DOCS[doc];
  return (
    <Section eyebrow="Legal" title={d.title}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,240px) minmax(0,1fr)', gap: 'var(--space-8)', alignItems: 'start' }}>
        <Card padding="sm">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[['terms', 'Terms of trade'], ['privacy', 'Privacy policy'], ['cookies', 'Cookies'], ['returns', 'Returns & refunds']].map(([k, l]) => (
              <button key={k} onClick={() => setDoc(k)} style={{ minHeight: 44, padding: '0 var(--space-3)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'start', background: doc === k ? 'color-mix(in oklab, var(--primary) 8%, transparent)' : 'transparent', color: 'var(--text-strong)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: doc === k ? 'var(--weight-bold)' : 'var(--weight-medium)' }}>{l}</button>
            ))}
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 'var(--container-narrow)' }}>
          <InlineAlert tone="warning" icon={<Icon name="triangle-alert" size={18} />} title={'Status: ' + d.updated}>
            This page is a design placeholder. Legal and accounting wording is not fixed until Owner, Finance and Legal sign off.
          </InlineAlert>
          {d.sections.map(([h, b]) => (
            <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{h}</h2>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', color: 'var(--text-body)', lineHeight: 'var(--lh-relaxed)', margin: 0, textWrap: 'pretty' }}>{b}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { OriginsHub, OriginDetail, KnowledgeHub, About, Contact, Shipping, HelpFaq, Legal });
