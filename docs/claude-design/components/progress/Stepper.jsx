import React from 'react';

/* KYB / Create-listing / Checkout wizard progress. Steps carry their own state so
   "more info required" can point at one specific step. */
export function Stepper({ steps = [], current = 0, orientation = 'horizontal', onStepClick, style, ...rest }) {
  const vertical = orientation === 'vertical';
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 'var(--space-1)' : 'var(--space-2)', ...style }} {...rest}>
      {steps.map((s, i) => {
        const state = s.state || (i < current ? 'done' : i === current ? 'current' : 'todo');
        const color = { done: 'var(--success)', current: 'var(--primary)', todo: 'var(--border-strong)', error: 'var(--danger)' }[state];
        const fill = state === 'todo' ? 'var(--surface-card)' : color;
        return (
          <li key={s.key || s.label} style={{ flex: vertical ? '0 0 auto' : 1, display: 'flex', flexDirection: vertical ? 'row' : 'column', gap: vertical ? 'var(--space-3)' : 'var(--space-3)', alignItems: vertical ? 'flex-start' : 'stretch', minWidth: 0 }}>
            {!vertical && <span style={{ height: 4, borderRadius: 999, background: state === 'todo' ? 'var(--sand-300)' : color, transition: 'background var(--dur-base) var(--ease-standard)' }} />}
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', cursor: onStepClick ? 'pointer' : 'default' }} onClick={() => onStepClick && onStepClick(i)}>
              <span style={{ width: 26, height: 26, flex: '0 0 auto', borderRadius: '50%', border: '1.5px solid ' + color, background: fill, color: state === 'todo' ? 'var(--text-muted)' : '#FFFFFF', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-bold)' }}>
                {state === 'done' ? '✓' : state === 'error' ? '!' : i + 1}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', fontWeight: state === 'current' ? 'var(--weight-bold)' : 'var(--weight-medium)', color: state === 'todo' ? 'var(--text-muted)' : 'var(--text-strong)' }}>{s.label}</span>
                {s.hint && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-meta)', color: state === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>{s.hint}</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
