import React from 'react';

/* One status vocabulary for Orders, Shipments, KYB applications and Listings (§12/§13).
   Status is never colour-only — the label always ships with the dot. */
const MAP = {
  draft: ['Draft', 'var(--status-draft)', 'var(--status-draft-surface)'],
  quoted: ['Awaiting confirmation', 'var(--status-review)', 'var(--status-review-surface)'],
  submitted: ['Submitted', 'var(--status-review)', 'var(--status-review-surface)'],
  review: ['Under review', 'var(--status-review)', 'var(--status-review-surface)'],
  moreInfo: ['More info required', 'var(--status-pending)', 'var(--status-pending-surface)'],
  paymentPending: ['Payment pending', 'var(--status-pending)', 'var(--status-pending-surface)'],
  paid: ['Paid', 'var(--status-paid)', 'var(--status-paid-surface)'],
  processing: ['Processing', 'var(--status-review)', 'var(--status-review-surface)'],
  reserved: ['Reserved', 'var(--status-review)', 'var(--status-review-surface)'],
  picking: ['Picking', 'var(--status-pending)', 'var(--status-pending-surface)'],
  dispatched: ['Dispatched', 'var(--status-transit)', 'var(--status-transit-surface)'],
  inTransit: ['In transit', 'var(--status-transit)', 'var(--status-transit-surface)'],
  delivered: ['Delivered', 'var(--status-complete)', 'var(--status-complete-surface)'],
  completed: ['Completed', 'var(--status-complete)', 'var(--status-complete-surface)'],
  live: ['Live', 'var(--status-paid)', 'var(--status-paid-surface)'],
  approved: ['Approved', 'var(--status-paid)', 'var(--status-paid-surface)'],
  sold: ['Sold', 'var(--status-complete)', 'var(--status-complete-surface)'],
  cancelled: ['Cancelled', 'var(--status-cancelled)', 'var(--status-cancelled-surface)'],
  refunded: ['Refunded', 'var(--status-cancelled)', 'var(--status-cancelled-surface)'],
  failed: ['Failed', 'var(--status-danger)', 'var(--status-danger-surface)'],
  rejected: ['Rejected', 'var(--status-danger)', 'var(--status-danger-surface)'],
  suspended: ['Suspended', 'var(--status-danger)', 'var(--status-danger-surface)'],
  disputed: ['Disputed', 'var(--status-danger)', 'var(--status-danger-surface)'],
};

export function StatusBadge({ status = 'draft', label, size = 'md', style, ...rest }) {
  const [fallback, color, surface] = MAP[status] || MAP.draft;
  const sm = size === 'sm';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: sm ? '3px 9px' : '5px 12px', borderRadius: 'var(--radius-pill)', background: surface, color, border: '1px solid color-mix(in oklab, ' + color + ' 22%, transparent)', fontFamily: 'var(--font-ui)', fontSize: sm ? 'var(--text-micro)' : 'var(--text-meta)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap', ...style }} {...rest}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
      {label || fallback}
    </span>
  );
}
