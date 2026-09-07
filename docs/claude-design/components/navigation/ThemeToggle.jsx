import React from 'react';

export function ThemeToggle({ theme = 'light', onChange, variant = 'onDark', style, ...rest }) {
  const next = theme === 'light' ? 'dark' : 'light';
  const dark = variant === 'onDark';
  return (
    <button type="button" onClick={() => onChange && onChange(next)} aria-label={'Switch to ' + next + ' theme'} title={'Switch to ' + next + ' theme'}
      style={{ width: 'var(--control-h)', height: 'var(--control-h)', display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-pill)', cursor: 'pointer', background: dark ? 'rgba(238,228,209,.08)' : 'var(--surface-card)', color: dark ? 'var(--brand-cream)' : 'var(--text-strong)', border: '1px solid ' + (dark ? 'rgba(238,228,209,.18)' : 'var(--border)'), transition: 'var(--transition-control)', fontSize: 16, ...style }} {...rest}>
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
