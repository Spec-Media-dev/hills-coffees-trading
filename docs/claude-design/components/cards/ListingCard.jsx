import React from 'react';

/* Green-coffee offer card. Hills-owned lots are visually distinct from verified-seller lots
   without turning the marketplace into a consumer storefront. */
export function ListingCard({ imageSrc, title, origin, region, grade, process, harvest, quantity, price, priceLocked = false, seller = 'hills', sellerName, status, onOpen, style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  const hills = seller === 'hills';
  return (
    <article onClick={onOpen} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: 'var(--surface-card)', border: '1px solid ' + (hovered ? 'var(--border-strong)' : 'var(--border)'), borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: onOpen ? 'pointer' : 'default', boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-xs)', transform: hovered ? 'translateY(-2px)' : 'none', transition: 'var(--transition-control)', ...style }} {...rest}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--forest-800)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {imageSrc
          ? <img src={imageSrc} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'rgba(238,228,209,.6)', textAlign: 'center', padding: 'var(--space-4)' }}>Origin / lot photography</span>}
        <span style={{ position: 'absolute', insetInlineStart: 'var(--space-3)', top: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: hills ? 'var(--brand-cream)' : 'rgba(23,60,50,.82)', color: hills ? 'var(--brand-forest)' : 'var(--brand-cream)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          {hills ? 'Hills Coffee' : 'Verified seller'}
        </span>
        {status && <span style={{ position: 'absolute', insetInlineEnd: 'var(--space-3)', top: 'var(--space-3)' }}>{status}</span>}
      </div>
      <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--accent-text)' }}>{[origin, region].filter(Boolean).join(' · ')}</span>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0, lineHeight: 'var(--lh-heading)' }}>{title}</h3>
        </div>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--space-2) var(--space-4)' }}>
          {[['Grade', grade], ['Process', process], ['Harvest', harvest], ['Available', quantity]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
              <dt style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', color: 'var(--text-muted)' }}>{k}</dt>
              <dd style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{v}</dd>
            </div>
          ))}
        </dl>
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          {priceLocked
            ? <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)' }}>Sign in to view price</span>
            : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{price}</span>}
          {sellerName && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sellerName}</span>}
        </div>
      </div>
    </article>
  );
}
