import React from 'react';
import { controlBase } from './Field.jsx';

const DIALS = [
  { value: '+971', label: 'UAE +971' }, { value: '+20', label: 'Egypt +20' },
  { value: '+251', label: 'Ethiopia +251' }, { value: '+57', label: 'Colombia +57' },
  { value: '+55', label: 'Brazil +55' }, { value: '+254', label: 'Kenya +254' },
];

export function PhoneField({ dialCode = '+971', onDialCodeChange, dialCodes = DIALS, error = false, disabled = false, style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ ...controlBase({ focused, error, disabled }), display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 0, overflow: 'hidden', ...style }}>
      <select value={dialCode} disabled={disabled} onChange={(e) => onDialCodeChange && onDialCodeChange(e.target.value)}
        style={{ height: '100%', border: 'none', borderInlineEnd: '1px solid var(--border)', background: 'var(--surface-subtle)', font: 'inherit', color: 'var(--text-strong)', padding: '0 var(--space-3)', cursor: 'pointer', outline: 'none' }}>
        {dialCodes.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <input type="tel" inputMode="tel" dir="ltr" disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'inherit', height: '100%', padding: '0 var(--space-3)' }} {...rest} />
    </div>
  );
}
