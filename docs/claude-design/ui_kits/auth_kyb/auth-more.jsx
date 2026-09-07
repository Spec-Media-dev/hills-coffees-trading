const { Field, Input, Button, InlineAlert, Icon, Card, StatusBadge, Timeline, Checkbox } = window.HillsCoffeeDesignSystem_ca006d;

function EmailVerification({ onNavigate }) {
  const [state, setState] = React.useState('sent');
  return (
    <div style={{ width: 'min(100%, 460px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>Verify your work email</h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', margin: 0 }}>We sent a six-digit code to ops@niletraders.example.</p>
      </div>
      {state === 'sent' && <InlineAlert tone="info" icon={<Icon name="mail" size={18} />} title="Code sent">It expires in 15 minutes. Check spam before requesting a new one.</InlineAlert>}
      {state === 'error' && <InlineAlert tone="danger" icon={<Icon name="triangle-alert" size={18} />} title="That code did not match">Request a new code or check you are using the most recent email.</InlineAlert>}
      {state === 'verified' && <InlineAlert tone="success" icon={<Icon name="check" size={18} />} title="Email verified">Next: company verification (KYB).</InlineAlert>}
      <Field label="Verification code" required hint="Six digits"><Input inputMode="numeric" placeholder="000000" style={{ letterSpacing: '.4em', fontFamily: 'var(--font-mono)' }} /></Field>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Button size="lg" onClick={() => setState('verified')}>Verify email</Button>
        <Button size="lg" variant="text" onClick={() => setState('sent')}>Resend code</Button>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => setState('error')}>Show error state</Button>
        {state === 'verified' && <Button size="sm" onClick={() => onNavigate('kyb')}>Continue to KYB</Button>}
      </div>
      <div style={{ paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border)' }}>
        <Button variant="text" onClick={() => onNavigate('login')}>Use a different email</Button>
      </div>
    </div>
  );
}

function ForgotPassword({ onNavigate }) {
  const [stage, setStage] = React.useState('request');
  return (
    <div style={{ width: 'min(100%, 460px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', margin: 0 }}>
          {stage === 'request' ? 'Reset your password' : stage === 'sent' ? 'Check your email' : 'Choose a new password'}
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-small)', color: 'var(--text-muted)', margin: 0 }}>
          {stage === 'request' ? 'We will email a reset link to the work address on your account.' : stage === 'sent' ? 'The link is valid for 30 minutes.' : 'At least 12 characters. You will be signed out of other devices.'}
        </p>
      </div>
      {stage === 'request' && <>
        <Field label="Work email" required><Input type="email" placeholder="ops@company.com" /></Field>
        <Button size="lg" onClick={() => setStage('sent')}>Send reset link</Button>
      </>}
      {stage === 'sent' && <>
        <InlineAlert tone="success" icon={<Icon name="mail" size={18} />} title="Reset link sent">If nothing arrives in five minutes, check spam or contact the trade desk.</InlineAlert>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button size="lg" onClick={() => setStage('reset')}>I have the link</Button>
          <Button size="lg" variant="text" onClick={() => setStage('request')}>Send again</Button>
        </div>
      </>}
      {stage === 'reset' && <>
        <Field label="New password" required hint="At least 12 characters"><Input type="password" /></Field>
        <Field label="Confirm new password" required><Input type="password" /></Field>
        <Checkbox label="Sign out of all other devices" checked />
        <Button size="lg" onClick={() => onNavigate('login')}>Set password & sign in</Button>
      </>}
      <div style={{ paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border)' }}>
        <Button variant="text" onClick={() => onNavigate('login')}>Back to sign in</Button>
      </div>
    </div>
  );
}

Object.assign(window, { EmailVerification, ForgotPassword });
