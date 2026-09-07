import React from 'react';

/* Desktop table that collapses to a card list on narrow viewports (§15).
   Pass responsive={false} to keep the table at all widths. */
export function DataTable({ columns = [], rows = [], selectable = false, selected = [], onSelect, onRowClick, emptyState, dense = false, responsive = true, style, ...rest }) {
  const [narrow, setNarrow] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!responsive || !ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setNarrow(entries[0].contentRect.width < 640));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [responsive]);

  const cellPad = dense ? 'var(--space-3) var(--space-4)' : 'var(--space-4) var(--space-5)';
  if (rows.length === 0 && emptyState) return <div ref={ref} style={style}>{emptyState}</div>;

  return (
    <div ref={ref} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }} {...rest}>
      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((row, i) => (
            <div key={row.id ?? i} onClick={() => onRowClick && onRowClick(row)}
              style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', cursor: onRowClick ? 'pointer' : 'default' }}>
              {columns.map((c) => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{c.header}</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-strong)', textAlign: 'end' }}>{c.render ? c.render(row) : row[c.key]}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <table style={{ width: '100%', fontFamily: 'var(--font-ui)' }}>
          <thead>
            <tr style={{ background: 'var(--surface-subtle)' }}>
              {selectable && <th style={{ width: 44, padding: cellPad }} />}
              {columns.map((c) => (
                <th key={c.key} style={{ textAlign: c.align || 'start', padding: cellPad, fontSize: 'var(--text-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i} onClick={() => onRowClick && onRowClick(row)}
                style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border-subtle)', cursor: onRowClick ? 'pointer' : 'default', background: selected.includes(row.id) ? 'color-mix(in oklab, var(--primary) 5%, var(--surface-card))' : 'transparent' }}>
                {selectable && (
                  <td style={{ padding: cellPad }}>
                    <input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => { e.stopPropagation(); onSelect && onSelect(row.id, e.target.checked); }} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || 'start', padding: cellPad, fontSize: 'var(--text-small)', color: 'var(--text-body)', fontVariantNumeric: c.numeric ? 'tabular-nums' : 'normal', whiteSpace: c.nowrap ? 'nowrap' : 'normal' }}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
