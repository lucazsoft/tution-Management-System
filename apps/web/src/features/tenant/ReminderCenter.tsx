import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../components/ui/Toast';
import { api, type AutomationStatus, type ReminderTaskName } from '../../services/api';
import { ApiError, errorMessage } from '../../services/api/client';
import './reminderCenter.css';

interface TaskInfo {
  title: string;
  icon: string;
  description: string;
  audience: string;
  /** Asked before running because it texts parents or changes student access. */
  confirm?: string;
}

const TASKS: Record<ReminderTaskName, TaskInfo> = {
  'fee-reminder-sms': {
    title: 'Fee reminders',
    icon: 'sms',
    description: 'Texts the parents of every student with overdue fees, with the amount owed and the branch to pay at.',
    audience: 'Parents · SMS',
    confirm: 'This sends an SMS to every parent listed above right now.',
  },
  'monthly-due-verification': {
    title: 'Overdue fee check',
    icon: 'rule',
    description: 'Marks unpaid invoices past their due date as overdue and blocks class access until they are paid. Run this before sending fee reminders.',
    audience: 'Student access',
    confirm: 'Students with overdue invoices will lose class access until they pay.',
  },
  'leave-escalation': {
    title: 'Leave escalation alerts',
    icon: 'event_busy',
    description: 'Alerts Tenant Admins about staff leave requests their branch has not answered for 48 hours.',
    audience: 'Tenant Admins · app',
  },
  'salary-reminder': {
    title: 'Payroll reminder',
    icon: 'payments',
    description: "Reminds Tenant Admins to calculate this month's payroll.",
    audience: 'Tenant Admins · app',
  },
  'financial-anomaly-alerts': {
    title: 'Expense anomaly alerts',
    icon: 'monitoring',
    description: "Compares each branch's spending with its usual pattern and alerts admins about unusual expenses.",
    audience: 'Admins · app',
  },
  'task-escalation': {
    title: 'Maintenance escalation',
    icon: 'build',
    description: 'Escalates maintenance tasks that are past their allowed time so they get attention.',
    audience: 'Maintenance tasks',
  },
};

const ORDER: ReminderTaskName[] = [
  'monthly-due-verification',
  'fee-reminder-sms',
  'leave-escalation',
  'salary-reminder',
  'financial-anomaly-alerts',
  'task-escalation',
];

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const npr = (value: number) => `NPR ${Math.round(value).toLocaleString('en-IN')}`;

export function ReminderCenter() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [running, setRunning] = useState<ReminderTaskName | null>(null);
  const [confirming, setConfirming] = useState<{ task: ReminderTaskName; force: boolean; note?: string } | null>(null);
  const [results, setResults] = useState<Partial<Record<ReminderTaskName, string>>>({});

  const load = useCallback(async () => {
    setLoadError('');
    try { setStatus(await api.automation.getStatus()); }
    catch (cause) { setLoadError(errorMessage(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (task: ReminderTaskName, force = false) => {
    setRunning(task);
    setConfirming(null);
    try {
      const result = await api.automation.run(task, force);
      const summary = result.executionLogs.join(' ');
      setResults((current) => ({ ...current, [task]: summary }));
      showToast(`${TASKS[task].title} finished.`, 'success');
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.body.code === 'RECENTLY_SENT') {
        const at = String(cause.body.lastRunAt ?? '');
        setConfirming({ task, force: true, note: `Fee reminders were already sent ${at ? timeAgo(at) : 'recently'}. Parents would get a second SMS.` });
      } else {
        showToast(errorMessage(cause), 'error');
      }
    } finally {
      setRunning(null);
    }
  };

  const start = (task: ReminderTaskName) => {
    if (TASKS[task].confirm) setConfirming({ task, force: false });
    else void run(task);
  };

  if (loadError) {
    return <Card hoverable={false}><p role="alert">{loadError}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></Card>;
  }
  if (!status) return <Card hoverable={false}><p aria-busy="true">Loading reminders…</p></Card>;

  const lastRuns = new Map(status.tasks.map((task) => [task.taskName, task.lastRun]));
  const preview = status.feeReminderPreview;

  return (
    <div className="reminder-center">
      <p className="reminder-center__intro">
        Send reminders and run alert checks for the whole institution. Each run is recorded with who started it.
      </p>
      <div className="reminder-center__grid">
        {ORDER.map((task) => {
          const info = TASKS[task];
          const last = lastRuns.get(task) ?? null;
          const isConfirming = confirming?.task === task;
          const nothingToSend = task === 'fee-reminder-sms' && preview.parentNumbers === 0;
          return (
            <Card key={task} hoverable={false}>
              <article className="reminder-card" aria-labelledby={`reminder-${task}`}>
                <header className="reminder-card__head">
                  <span className="material-symbols-outlined reminder-card__icon" aria-hidden="true">{info.icon}</span>
                  <div>
                    <h3 id={`reminder-${task}`}>{info.title}</h3>
                    <StatusBadge variant="info">{info.audience}</StatusBadge>
                  </div>
                </header>
                <p className="reminder-card__text">{info.description}</p>

                {task === 'fee-reminder-sms' ? (
                  <dl className="reminder-card__preview">
                    <div><dt>Students overdue</dt><dd>{preview.students}</dd></div>
                    <div><dt>Parent numbers</dt><dd>{preview.parentNumbers}</dd></div>
                    <div><dt>Total overdue</dt><dd>{npr(preview.totalOverdue)}</dd></div>
                    {preview.withoutPhone || preview.withoutGuardian ? (
                      <div className="reminder-card__gap">
                        <dt>Can't be texted</dt>
                        <dd>
                          {[
                            preview.withoutPhone ? `${preview.withoutPhone} parent${preview.withoutPhone === 1 ? '' : 's'} without a mobile number` : '',
                            preview.withoutGuardian ? `${preview.withoutGuardian} student${preview.withoutGuardian === 1 ? '' : 's'} with no parent linked` : '',
                          ].filter(Boolean).join(' · ')}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                <p className="reminder-card__last">
                  {last ? <>Last run {timeAgo(last.at)} by {last.by}</> : 'Never run'}
                </p>
                {results[task] ? <p className="reminder-card__result" role="status">{results[task]}</p>
                  : last ? <p className="reminder-card__summary">{last.summary}</p> : null}

                {isConfirming ? (
                  <div className="reminder-card__confirm" role="alertdialog" aria-labelledby={`confirm-${task}`}>
                    <p id={`confirm-${task}`}>{confirming?.note ?? info.confirm}</p>
                    <div className="reminder-card__actions">
                      <Button variant="danger" disabled={running === task} onClick={() => void run(task, confirming?.force ?? false)}>
                        {confirming?.force ? 'Send again' : 'Yes, run now'}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="reminder-card__actions">
                    <Button disabled={running !== null || nothingToSend} aria-busy={running === task} onClick={() => start(task)}>
                      {running === task ? 'Running…' : task === 'fee-reminder-sms'
                        ? (nothingToSend ? 'No one to remind' : `Send ${preview.parentNumbers} SMS`)
                        : 'Run now'}
                    </Button>
                  </div>
                )}
              </article>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
