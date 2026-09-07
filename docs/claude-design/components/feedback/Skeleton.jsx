import React from 'react';

export function Skeleton({ variant = 'text', width, height, lines = 3, radius, style, ...rest }) {
  const base = { background: 'linear-gradient(90deg, var(--sand-200) 25%, var(--sand-100) 37%, var(--sand-200) 63%)', backgroundSize: '400% 100%', animation: 'hcshimmer 1400ms linear infinite' };
  if (variant === 'text') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: width || '100%', ...style }} {...rest}>
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} style={{ ...base, height: height || 12, borderRadius: radius || 'var(--radius-xs)', width: i === lines - 1 ? '62%' : '100%' }} />
        ))}
        <style>{'@keyframes hcshimmer{from{background-position:100% 0}to{background-position:0 0}}'}</style>
      </div>
    );
  }
  return <span style={{ ...base, display: 'block', width: width || '100%', height: height || (variant === 'card' ? 160 : 44), borderRadius: radius || (variant === 'circle' ? '50%' : 'var(--radius-md)'), ...style }} {...rest} />;
}
