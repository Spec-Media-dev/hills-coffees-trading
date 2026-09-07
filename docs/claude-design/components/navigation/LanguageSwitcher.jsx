import React from 'react';

export function LanguageSwitcher({ lang = 'en', onChange, variant = 'onDark', style, ...rest }) {
  const next = lang === 'en' ? 'ar' : 'en';
  const dark = variant === 'onDark';
  return (
    <button type="button" onClick={() => onChange && onChange(next)}
      aria-label={next === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
      style={{ height: 'var(--control-h)', minWidth: 'var(--control-h)', padding: '0 var(--space-4)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-bold)', letterSpacing: '.06em', background: dark ? 'rgba(238,228,209,.08)' : 'var(--surface-card)', color: dark ? 'var(--brand-cream)' : 'var(--text-strong)', border: '1px solid ' + (dark ? 'rgba(238,228,209,.18)' : 'var(--border)'), transition: 'var(--transition-control)', ...style }} {...rest}>
      {next === 'ar' ? 'AR' : 'EN'}
    </button>
  );
}
