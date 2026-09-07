import React from 'react';
import { controlBase } from './Field.jsx';

export function Input({ error = false, disabled = false, prefix, suffix, size = 'md', style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  const box = { ...controlBase({ focused, error, disabled }), height: size === 'sm' ? 'var(--control-h-sm)' : 'var(--control-h)' };
  if (prefix || suffix) {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-3)', ...style }}>
        {prefix && <span style={{ color: 'var(--text-muted)', display: 'inline-flex', fontSize: 'var(--text-small)' }}>{prefix}</span>}
        <input disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', font: 'inherit', color: 'inherit', height: '100%' }} {...rest} />
        {suffix && <span style={{ color: 'var(--text-muted)', display: 'inline-flex', fontSize: 'var(--text-small)' }}>{suffix}</span>}
      </div>
    );
  }
  return <input disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ ...box, ...style }} {...rest} />;
}
