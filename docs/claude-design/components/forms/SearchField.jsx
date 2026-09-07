import React from 'react';
import { controlBase } from './Field.jsx';

export function SearchField({ value, onChange, onClear, placeholder = 'Search', icon, size = 'md', style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ ...controlBase({ focused }), height: size === 'sm' ? 'var(--control-h-sm)' : 'var(--control-h)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-3)', borderRadius: 'var(--radius-pill)', ...style }}>
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{icon}</span>
      <input type="search" value={value} placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'inherit', height: '100%' }} {...rest} />
      {value ? (
        <button type="button" onClick={() => { onChange && onChange(''); onClear && onClear(); }} aria-label="Clear search"
          style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      ) : null}
    </div>
  );
}
