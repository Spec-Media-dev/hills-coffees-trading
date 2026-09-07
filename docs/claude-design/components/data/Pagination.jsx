import React from 'react';

export function Pagination({ page = 1, pageCount = 1, onPageChange, totalLabel, style, ...rest }) {
  const pages = [];
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  const btn = (content, key, opts = {}) => (
    <button key={key} type="button" disabled={opts.disabled} onClick={opts.onClick}
      style={{ minWidth: 36, height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', cursor: opts.disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums', background: opts.active ? 'var(--primary)' : 'var(--surface-card)', color: opts.active ? 'var(--primary-contrast)' : 'var(--text-strong)', border: '1px solid ' + (opts.active ? 'var(--primary)' : 'var(--border)'), opacity: opts.disabled ? 0.4 : 1 }}>{content}</button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', ...style }} {...rest}>
      {totalLabel && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{totalLabel}</span>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginInlineStart: 'auto' }}>
        {btn('‹', 'prev', { disabled: page <= 1, onClick: () => onPageChange && onPageChange(page - 1) })}
        {pages.map((p, i) => (p === '…'
          ? <span key={'e' + i} style={{ alignSelf: 'center', color: 'var(--text-muted)', padding: '0 4px' }}>…</span>
          : btn(p, p, { active: p === page, onClick: () => onPageChange && onPageChange(p) })))}
        {btn('›', 'next', { disabled: page >= pageCount, onClick: () => onPageChange && onPageChange(page + 1) })}
      </div>
    </div>
  );
}
