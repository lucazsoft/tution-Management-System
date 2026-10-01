import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { errorMessage } from '../services/api/client';
import { janitorTaskService, type JanitorTask } from '../features/janitor/janitorTaskService';
import '../features/janitor/janitorTasks.css';

type Filter = 'open' | 'overdue' | 'completed';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function StaffTasksPage() {
  const { showToast } = useToast();
  const location = useLocation();
  const isSecurity = location.hash === '#security';
  const [tasks, setTasks] = useState<JanitorTask[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const knownTaskIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) setFailure(null);
    try {
      const nextTasks = await janitorTaskService.listMine();
      if (knownTaskIds.current) {
        const assigned = nextTasks.filter((task) => !knownTaskIds.current!.has(task.id));
        if (assigned.length) { setFilter('open'); showToast(assigned.length === 1 ? `New task assigned: ${assigned[0].classroomId}` : `${assigned.length} new maintenance tasks assigned.`, 'info'); }
      }
      knownTaskIds.current = new Set(nextTasks.map((task) => task.id));
      setTasks(nextTasks);
    } catch (error) {
      if (!quiet) setFailure(errorMessage(error));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 5000); return () => window.clearInterval(timer); }, [load]);

  const counts = useMemo(() => ({
    open: tasks.filter((task) => task.status !== 'COMPLETED').length,
    overdue: tasks.filter((task) => task.overdue).length,
    completed: tasks.filter((task) => task.status === 'COMPLETED').length,
  }), [tasks]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (filter === 'completed') return task.status === 'COMPLETED';
    if (filter === 'overdue') return task.overdue;
    return task.status !== 'COMPLETED';
  }), [filter, tasks]);

  async function markDone(task: JanitorTask) {
    setCompletingId(task.id);
    try {
      await janitorTaskService.markDone(task.id);
      await load();
      showToast(`${task.classroomId} task marked done. Completion details were recorded.`, 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <main className="janitor-page" aria-labelledby="janitor-title">
      <header className="janitor-hero">
        <div>
          <p className="janitor-eyebrow">Maintenance workspace</p>
          <h1 id="janitor-title">My assigned tasks</h1>
          <p>Complete classroom and facility work assigned to you. Overdue work stays visible until it is finished.</p>
        </div>
        <span className="janitor-secure"><span className="material-symbols-outlined" aria-hidden="true">shield_lock</span>Task-only access</span>
      </header>

      {isSecurity ? (
        <section className="janitor-page-panel">
          <div className="janitor-head">
            <div><h2>Security Settings</h2><p>Manage your account password and security settings.</p></div>
          </div>
          <div style={{ padding: '24px' }}>
            <ChangePasswordForm className="janitor-state" />
          </div>
        </section>
      ) : (
        <>
          <section className="janitor-summary" aria-label="Task summary">
            <article><span className="material-symbols-outlined" aria-hidden="true">assignment</span><div><strong>{counts.open}</strong><span>Open tasks</span></div></article>
            <article className={counts.overdue ? 'is-overdue' : ''}><span className="material-symbols-outlined" aria-hidden="true">schedule</span><div><strong>{counts.overdue}</strong><span>Overdue</span></div></article>
            <article><span className="material-symbols-outlined" aria-hidden="true">task_alt</span><div><strong>{counts.completed}</strong><span>Completed</span></div></article>
          </section>

          <section className="janitor-queue" aria-labelledby="queue-title">
            <div className="janitor-queue-head">
              <div><h2 id="queue-title">Task queue</h2><p>Showing work assigned to your account only.</p></div>
              <button className="janitor-refresh" type="button" onClick={() => void load()} disabled={loading}>
                <span className="material-symbols-outlined" aria-hidden="true">refresh</span>{loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <div className="janitor-filters" role="tablist" aria-label="Filter maintenance tasks">
              {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id]}</span></button>)}
            </div>

            {failure ? <div className="janitor-state is-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">cloud_off</span><h3>Tasks could not be loaded</h3><p>{failure}</p><button type="button" onClick={() => void load()}>Try again</button></div>
              : loading ? <div className="janitor-task-list" aria-busy="true" aria-label="Loading tasks">{[1, 2, 3].map((item) => <div className="janitor-skeleton" key={item} />)}</div>
              : visibleTasks.length === 0 ? <div className="janitor-state"><span className="material-symbols-outlined" aria-hidden="true">done_all</span><h3>No {filter} tasks</h3><p>{filter === 'open' ? 'You are all caught up. New assigned work will appear here.' : `There are no ${filter} tasks to show.`}</p></div>
              : <div className="janitor-task-list">{visibleTasks.map((task) => (
                <article className={`janitor-task ${task.overdue ? 'is-overdue' : ''}`} key={task.id}>
                  <div className="janitor-task-icon"><span className="material-symbols-outlined" aria-hidden="true">cleaning_services</span></div>
                  <div className="janitor-task-body">
                    <div className="janitor-task-title"><div><p>{task.location}</p><h3>{task.classroomId}</h3></div><span className={`janitor-status ${task.status.toLowerCase()}`}>{task.overdue ? 'Overdue' : task.status === 'COMPLETED' ? 'Completed' : 'Due'}</span></div>
                    <p className="janitor-description">{task.description}</p>
                    <div className="janitor-meta"><span><span className="material-symbols-outlined" aria-hidden="true">event</span>{task.status === 'COMPLETED' && task.completionTimestamp ? `Completed ${formatDate(task.completionTimestamp)}` : `Due ${formatDate(task.dueAt)}`}</span>{task.completedBy ? <span><span className="material-symbols-outlined" aria-hidden="true">person</span>By {task.completedBy.name}</span> : null}</div>
                  </div>
                  {task.status !== 'COMPLETED' ? <button className="janitor-done" type="button" onClick={() => void markDone(task)} disabled={completingId !== null} aria-label={`Mark ${task.classroomId} task done`}><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>{completingId === task.id ? 'Saving…' : 'Mark Done'}</button> : null}
                </article>
              ))}</div>}
          </section>
        </>
      )}
    </main>
  );
}
