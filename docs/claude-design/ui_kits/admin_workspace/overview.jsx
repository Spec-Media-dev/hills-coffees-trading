const { KpiCard, Card, Icon, StatusBadge } = window.HillsCoffeeDesignSystem_ca006d;

const ACTIVITY = [
  ['DELETE', 'site_pages', 'Sep 5, 2026, 12:06 PM'],
  ['INSERT', 'site_pages', 'Sep 5, 2026, 12:02 PM'],
  ['DELETE', 'site_pages', 'Sep 5, 2026, 12:01 PM'],
  ['INSERT', 'site_pages', 'Sep 5, 2026, 11:57 AM'],
  ['DELETE', 'site_pages', 'Sep 5, 2026, 11:51 AM'],
  ['INSERT', 'site_pages', 'Sep 5, 2026, 11:47 AM'],
  ['DELETE', 'site_pages', 'Sep 5, 2026, 11:14 AM'],
  ['DELETE', 'articles', 'Sep 5, 2026, 11:14 AM'],
];

function AdminOverview() {
  return (
    <>
      <PageHead title="Operations overview"
        subtitle="A focused view of coffee identities, warehouse offers, and customer demand."
        note="Live counts from the Hills Coffee database. No estimated or sample figures." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-5)' }}>
        <KpiCard onDark icon={<Icon name="coffee" size={22} />} value="3" label="Products" />
        <KpiCard onDark icon={<Icon name="package" size={22} />} value="865" label="Available bags" />
        <KpiCard onDark icon={<Icon name="triangle-alert" size={22} />} value="1" label="Low-stock offers" />
        <KpiCard onDark icon={<Icon name="clipboard-list" size={22} />} value="51" label="Open inquiries" />
      </div>
      <div style={{ marginTop: 'var(--space-6)', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)' }}><span className="hc-label">Recent activity</span></div>
        <div>
          {ACTIVITY.map(([action, table, when], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', letterSpacing: '.04em', color: 'var(--text-strong)', width: 90 }}>{action}</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', color: 'var(--gold-on-dark)' }}>{table}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{when}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { AdminOverview });
