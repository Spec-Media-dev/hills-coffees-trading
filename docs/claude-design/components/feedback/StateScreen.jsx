import React from 'react';

/* Full-page access and error states: unauthorized, suspended, pending review, offline, 404. */
const PRESETS = {
  unauthorized: { title: 'You do not have access to this page', message: 'Your role does not include this workspace. Switch account or contact the Hills Coffee team.', tone: 'danger' },
  suspended: { title: 'This account is suspended', message: 'Trading functions are paused while we review your account. Existing orders remain visible.', tone: 'danger' },
  pending: { title: 'Verification under review', message: 'We are checking your company documents. You can browse listings while you wait.', tone: 'warning' },
  offline: { title: 'You are offline', message: 'We could not reach the server. Nothing was lost — retry when the connection is back.', tone: 'info' },
  notFound: { title: 'We could not find that page', message: 'The link may be out of date. Go back to your dashboard or the marketplace.', tone: 'info' },
  error: { title: 'Something went wrong on our side', message: 'Retry in a moment. If it keeps happening, send us the reference below.', tone: 'danger' },
};

export function StateScreen({ state = 'error', title, message, icon, action, secondaryAction, reference, style, ...rest }) {
  const p = PRESETS[state] || PRESETS.error;
  const tone = { danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' }[p.tone];
  const surface = { danger: 'var(--danger-surface)', warning: 'var(--warning-surface)', info: 'var(--info-surface)' }[p.tone];
  return (
    <div style={{ minHeight: 420, display: 'grid', placeItems: 'center', padding: 'var(--space-12) var(--gutter-page)', ...style }} {...rest}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--space-5)', maxWidth: 520 }}>
        <span style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: surface, color: tone, display: 'grid', placeItems: 'center' }}>{icon}</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>{title || p.title}</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)', color: 'var(--text-muted)', margin: 0, lineHeight: 'var(--lh-body)' }}>{message || p.message}</p>
        {(action || secondaryAction) && <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>{action}{secondaryAction}</div>}
        {reference && <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>{reference}</code>}
      </div>
    </div>
  );
}
