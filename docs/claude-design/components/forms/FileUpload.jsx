import React from 'react';

export function FileUpload({ label = 'Drop a file or browse', hint = 'PDF, JPG or PNG · up to 10 MB', files = [], onRemove, required = false, state = 'idle', icon, style, ...rest }) {
  const [over, setOver] = React.useState(false);
  const border = state === 'error' ? 'var(--danger)' : state === 'success' ? 'var(--success)' : over ? 'var(--primary)' : 'var(--border-strong)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...style }} {...rest}>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); }}
        style={{ border: '1.5px dashed ' + border, background: over ? 'var(--sand-100)' : 'var(--surface-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'var(--transition-control)', cursor: 'pointer' }}>
        <span style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>{icon}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{hint}</span>
        </span>
      </div>
      {files.map((file) => (
        <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{file.size}</span>
          {file.progress != null && file.progress < 100 && (
            <span style={{ width: 90, height: 4, borderRadius: 999, background: 'var(--sand-300)', overflow: 'hidden' }}><span style={{ display: 'block', width: file.progress + '%', height: '100%', background: 'var(--accent)' }} /></span>
          )}
          {onRemove && <button type="button" onClick={() => onRemove(file)} aria-label={'Remove ' + file.name} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>}
        </div>
      ))}
    </div>
  );
}
