import React from 'react';

const SIZES = {
  sm: { height: 'var(--control-h-sm)', padding: '0 14px', fontSize: 'var(--text-small)', gap: 'var(--space-2)', radius: 'var(--radius-sm)' },
  md: { height: 'var(--control-h)', padding: '0 20px', fontSize: 'var(--text-small)', gap: 'var(--space-2)', radius: 'var(--radius-sm)' },
  lg: { height: 'var(--control-h-lg)', padding: '0 28px', fontSize: 'var(--text-body)', gap: 'var(--space-3)', radius: 'var(--radius-md)' },
};

function skin(variant, hovered, pressed) {
  switch (variant) {
    case 'secondary':
      return { background: hovered ? 'var(--sand-200)' : 'var(--surface-card)', color: 'var(--text-strong)', border: '1px solid var(--border-strong)', boxShadow: pressed ? 'none' : 'var(--shadow-xs)' };
    case 'outline':
      return { background: hovered ? 'color-mix(in oklab, var(--primary) 8%, transparent)' : 'transparent', color: 'var(--primary)', border: '1.5px solid var(--primary)' };
    case 'text':
      return { background: hovered ? 'color-mix(in oklab, var(--primary) 7%, transparent)' : 'transparent', color: 'var(--primary)', border: '1px solid transparent' };
    case 'accent':
      return { background: hovered ? 'var(--accent-hover)' : 'var(--accent)', color: 'var(--text-on-accent)', border: '1px solid transparent' };
    case 'destructive':
      return { background: hovered ? 'color-mix(in oklab, var(--danger) 88%, black)' : 'var(--danger)', color: '#FFFFFF', border: '1px solid transparent' };
    default:
      return { background: pressed ? 'var(--primary-active)' : hovered ? 'var(--primary-hover)' : 'var(--primary)', color: 'var(--primary-contrast)', border: '1px solid transparent' };
  }
}

export function Button({ variant = 'primary', size = 'md', iconLeft, iconRight, loading = false, disabled = false, fullWidth = false, selected = false, children, style, ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const off = disabled || loading;
  return (
    <button type="button" disabled={off}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      aria-busy={loading || undefined} aria-pressed={selected || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
        height: s.height, padding: s.padding, minWidth: fullWidth ? '100%' : undefined, width: fullWidth ? '100%' : undefined,
        fontFamily: 'var(--font-ui)', fontSize: s.fontSize, fontWeight: 'var(--weight-semibold)', letterSpacing: '.005em',
        borderRadius: s.radius, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1,
        transform: pressed && !off ? 'translateY(1px)' : 'none',
        transition: 'var(--transition-control)', whiteSpace: 'nowrap',
        ...skin(selected ? 'primary' : variant, hovered && !off, pressed && !off), ...style,
      }} {...rest}>
      {loading && <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'hcspin 700ms linear infinite' }} />}
      {!loading && iconLeft}
      {children}
      {iconRight}
      <style>{'@keyframes hcspin{to{transform:rotate(360deg)}}'}</style>
    </button>
  );
}
