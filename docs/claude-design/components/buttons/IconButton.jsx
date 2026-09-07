import React from 'react';

const SIZES = { sm: 36, md: 44, lg: 52 };

export function IconButton({ icon, label, variant = 'ghost', size = 'md', disabled = false, active = false, style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  const d = SIZES[size] || SIZES.md;
  const skins = {
    ghost: { background: hovered || active ? 'color-mix(in oklab, var(--primary) 8%, transparent)' : 'transparent', color: 'var(--text-strong)', border: '1px solid transparent' },
    outline: { background: hovered ? 'var(--sand-100)' : 'var(--surface-card)', color: 'var(--text-strong)', border: '1px solid var(--border)' },
    solid: { background: hovered ? 'var(--primary-hover)' : 'var(--primary)', color: 'var(--primary-contrast)', border: '1px solid transparent' },
    onDark: { background: hovered || active ? 'rgba(238,228,209,.12)' : 'transparent', color: 'var(--brand-cream)', border: '1px solid rgba(238,228,209,.18)' },
  };
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: d, height: d, display: 'inline-grid', placeItems: 'center', borderRadius: 'var(--radius-sm)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'var(--transition-control)', ...skins[variant], ...style }}
      {...rest}>{icon}</button>
  );
}
