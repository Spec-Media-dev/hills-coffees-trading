import React from 'react';

export function DocumentRow({ name, kind, issuedOn, amount, status, icon, onDownload, onPreview, downloadLabel = 'Download', previewLabel = 'Preview', style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', background: hovered ? 'var(--surface-subtle)' : 'transparent', borderBottom: '1px solid var(--border-subtle)', transition: 'background var(--dur-fast) var(--ease-standard)', ...style }} {...rest}>
      <span style={{ color: 'var(--primary)', display: 'inline-flex', flex: '0 0 auto' }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{[kind, issuedOn].filter(Boolean).join(' · ')}</span>
      </div>
      {amount && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{amount}</span>}
      {status}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {onPreview && <button type="button" onClick={onPreview} style={{ height: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{previewLabel}</button>}
        {onDownload && <button type="button" onClick={onDownload} style={{ height: 36, padding: '0 12px', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', color: 'var(--primary)' }}>{downloadLabel}</button>}
      </div>
    </div>
  );
}
