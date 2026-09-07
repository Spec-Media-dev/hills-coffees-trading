import React from 'react';
import { controlBase } from './Field.jsx';

export function Select({ options = [], error = false, disabled = false, placeholder, style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ position: 'relative', ...style }}>
      <select disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ ...controlBase({ focused, error, disabled }), appearance: 'none', paddingRight: 'var(--space-10)', cursor: disabled ? 'not-allowed' : 'pointer' }} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', insetInlineEnd: 'var(--space-4)', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: 11 }}>▾</span>
    </div>
  );
}
