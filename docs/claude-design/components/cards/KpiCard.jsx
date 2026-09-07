import React from 'react';

/* KPI tile from the live admin overview: icon top-left, huge display figure, quiet label. */
export function KpiCard({ icon, value, label, delta, deltaTone = 'neutral', hint, onDark = false, style, ...rest }) {
  const tone = { up: 'var(--success)', down: 'var(--danger)', neutral: 'var(--text-muted)' }[deltaTone];
  return (
    <div style={{ background: onDark ? 'rgba(255,255,255,.03)' : 'var(--surface-card)', border: '1px solid ' + (onDark ? 'rgba(238,228,209,.12)' : 'var(--border)'), borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0, boxShadow: onDark ? 'none' : 'var(--shadow-xs)', ...style }} {...rest}>
      {icon && <span style={{ color: onDark ? 'var(--gold-on-dark)' : 'var(--accent-text)', display: 'inline-flex' }}>{icon}</span>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,1.4rem + 1.6vw,3rem)', fontWeight: 'var(--weight-bold)', lineHeight: 1, letterSpacing: 'var(--tracking-display)', color: onDark ? 'var(--brand-cream)' : 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {delta && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: tone }}>{delta}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: onDark ? '#A7B8AF' : 'var(--text-muted)' }}>{label}</span>
        {hint && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: onDark ? '#8FA398' : 'var(--text-muted)' }}>{hint}</span>}
      </div>
    </div>
  );
}
