import React from 'react';
import { controlBase } from './Field.jsx';

export function DatePicker({ error = false, disabled = false, range = false, icon, style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ ...controlBase({ focused, error, disabled }), display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-3)', ...style }}>
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{icon}</span>
      <input type="date" disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'inherit', height: '100%' }} {...rest} />
      {range && <>
        <span style={{ color: 'var(--text-muted)' }}>–</span>
        <input type="date" disabled={disabled} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'inherit', height: '100%' }} />
      </>}
    </div>
  );
}
