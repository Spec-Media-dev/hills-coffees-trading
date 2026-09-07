import React from 'react';
import { controlBase } from './Field.jsx';

export function Textarea({ error = false, disabled = false, rows = 4, style, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  return <textarea rows={rows} disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={{ ...controlBase({ focused, error, disabled }), height: 'auto', padding: 'var(--space-3) var(--space-4)', lineHeight: 'var(--lh-body)', resize: 'vertical', ...style }} {...rest} />;
}
