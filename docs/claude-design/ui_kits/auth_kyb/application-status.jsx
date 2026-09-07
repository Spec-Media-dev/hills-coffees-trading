const { KybCard, StatusBadge, Timeline, Button, Card, InlineAlert, Icon, StateScreen } = window.HillsCoffeeDesignSystem_ca006d;

function ApplicationStatus({ onNavigate }) {
  const [state, setState] = React.useState('moreInfo');
  return (
    <div style={{ width: 'min(100%, 720px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="hc-eyebrow">Application status</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Buyer verification</h1>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {[['submitted', 'Submitted'], ['review', 'Under review'], ['moreInfo', 'More info'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended']].map(([k, l]) => (
          <Button key={k} size="sm" variant={state === k ? 'primary' : 'outline'} onClick={() => setState(k)}>{l}</Button>
        ))}
      </div>
      {state === 'suspended'
        ? <StateScreen state="suspended" icon={<Icon name="octagon-alert" size={28} />} action={<Button>Contact Hills Coffee</Button>} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }} />
        : <KybCard companyName="Nile Traders LLC" role="Buyer"
            progress={state === 'approved' ? 100 : 80}
            status={<StatusBadge status={state} />}
            submittedOn="2 Sep 2026"
            expiresOn={state === 'approved' ? '30 Apr 2027' : undefined}
            missingItems={state === 'moreInfo' ? ['Certified trade licence — the copy on file expired in June 2026', 'Authorised signatory specimen'] : []}
            action={state === 'moreInfo'
              ? <Button onClick={() => onNavigate('kyb')}>Fix the two items</Button>
              : state === 'approved'
                ? <Button onClick={() => onNavigate('login')}>Go to marketplace</Button>
                : state === 'rejected'
                  ? <Button variant="outline">Start a new application</Button>
                  : <Button variant="outline" disabled>Nothing to do yet</Button>} />}
      <Card header={<span className="hc-label">History</span>}>
        <Timeline items={[
          { label: 'Draft created', timestamp: '30 Aug 2026, 16:02' },
          { label: 'Submitted for review', timestamp: '2 Sep 2026, 10:13' },
          { label: 'Under review by compliance', timestamp: '3 Sep 2026, 09:20' },
          { label: 'More information requested', state: state === 'moreInfo' ? 'current' : 'done', timestamp: '4 Sep 2026, 11:48', description: 'Trade licence expired; signatory specimen missing.' },
          { label: 'Decision', state: state === 'approved' || state === 'rejected' ? 'done' : 'todo' },
        ]} />
      </Card>
      <InlineAlert tone="info" icon={<Icon name="info" size={18} />} title="While you wait">
        You can browse public lots and specifications. Pricing, cart and ordering unlock on approval.
      </InlineAlert>
    </div>
  );
}

Object.assign(window, { ApplicationStatus });
