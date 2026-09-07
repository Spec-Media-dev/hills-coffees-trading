import React from 'react';
import { controlBase } from './Field.jsx';

export function Combobox({ options = [], value, onChange, placeholder = 'Start typing…', error = false, disabled = false, emptyText = 'No matches', style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const shown = list.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const label = list.find((o) => o.value === value)?.label ?? '';
  return (
    <div style={{ position: 'relative', ...style }} {...rest}>
      <input value={open ? query : label} placeholder={placeholder} disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); setQuery(''); }}
        onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 120); }}
        role="combobox" aria-expanded={open}
        style={controlBase({ focused, error, disabled })} />
      {open && !disabled && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 'var(--z-overlay)', insetInline: 0, top: 'calc(var(--control-h) + 6px)', margin: 0, padding: 'var(--space-1)', listStyle: 'none', maxHeight: 220, overflowY: 'auto', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)' }}>
          {shown.length === 0 && <li style={{ padding: 'var(--space-3)', fontSize: 'var(--text-small)', color: 'var(--text-muted)' }}>{emptyText}</li>}
          {shown.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}
              onMouseDown={() => { onChange && onChange(o.value); setOpen(false); }}
              style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-small)', cursor: 'pointer', color: 'var(--text-body)', background: o.value === value ? 'var(--sand-100)' : 'transparent', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <span>{o.label}</span>{o.meta && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-meta)' }}>{o.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
