import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function RemoteState({ kind, message, onRetry }: { kind: 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'; message?: string; onRetry?: () => void }) {
  const content = {
    loading: ['progress_activity', 'Loading workspace', message || 'Your latest records are being prepared.'],
    empty: ['inbox', 'Nothing here yet', message || 'New records will appear here when they are available.'],
    error: ['error', 'Couldn’t load this section', message || 'Check your connection and try again.'],
    denied: ['lock', 'Access restricted', message || 'Your account does not have permission to use this workspace.'],
    unavailable: ['schedule', 'Coming soon', message || 'This workflow is not available yet.'],
  }[kind];
  return <Card hoverable={false}><div className={`remote-state remote-state--${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-busy={kind === 'loading'}>
    <span className="material-symbols-outlined" aria-hidden="true">{content[0]}</span><div><strong>{content[1]}</strong><p>{content[2]}</p></div>
    {onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : null}
  </div></Card>;
}
