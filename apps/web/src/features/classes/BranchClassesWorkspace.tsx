import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { api, type AcademicClass, type AcademicClassEnrollment, type ClassDependencies } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import './branchClassesWorkspace.css';

type Branch = { id: string; name: string };
type Grade = { id: string; name: string };
type Person = { id: string; name: string; roles: Array<{ role: string; branchId: string | null }> };
type EligibleStudent = { studentId: string; studentName: string; studentEmail: string };
type Operation = 'create' | 'save' | 'add' | 'move' | 'remove' | 'archive' | 'delete' | null;
type DialogState = { kind: 'archive' | 'delete' } | { kind: 'remove'; enrollment: AcademicClassEnrollment } | { kind: 'move' } | null;

const emptyCreate = { branchId: '', gradeId: '', name: 'A', subject: '', kind: 'REGULAR' as 'REGULAR' | 'EXTRA', monthlyFee: '0', teacherId: '', sourceClassId: '', studentIds: [] as string[] };

export function BranchClassesWorkspace() {
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligible, setEligible] = useState<EligibleStudent[]>([]);
  const [studentToAdd, setStudentToAdd] = useState('');
  const [moveStudentIds, setMoveStudentIds] = useState<string[]>([]);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [edit, setEdit] = useState({ name: '', teacherId: '' });
  const [create, setCreate] = useState(emptyCreate);
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dependencies, setDependencies] = useState<ClassDependencies | null>(null);
  const listController = useRef<AbortController | null>(null);
  const dependencyController = useRef<AbortController | null>(null);

  const selected = classes.find((item) => item.id === selectedId);
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleClasses = classes.filter((item) => (showArchived || !item.archivedAt)
    && (!normalizedFilter || [item.name, item.courseName, item.branchName, item.gradeName]
      .some((field) => (field || '').toLowerCase().includes(normalizedFilter))));
  const editDirty = Boolean(selected && (edit.name.trim() !== selected.name || edit.teacherId !== (selected.teacherId || '')));
  const teachers = people.filter((person) => person.roles.some((role) => role.role === 'Teacher' && role.branchId === create.branchId));
  const selectedTeachers = people.filter((person) => person.roles.some((role) => role.role === 'Teacher' && role.branchId === selected?.branchId));
  const sourceClasses = classes.filter((item) => !item.archivedAt && item.courseType === 'REGULAR' && item.branchId === create.branchId && item.gradeId === create.gradeId);
  const sourceStudents = sourceClasses.find((item) => item.id === create.sourceClassId)?.enrollments || [];
  const moveTargets = classes.filter((item) => !item.archivedAt && item.id !== selected?.id && item.branchId === selected?.branchId && item.gradeId === selected?.gradeId);

  const load = useCallback(async (preferredId?: string) => {
    listController.current?.abort();
    const controller = new AbortController(); listController.current = controller;
    setLoading(true); setError('');
    try {
      const [classList, branchList, gradeList, personList] = await Promise.all([
        api.academics.listClasses({ includeArchived: true, signal: controller.signal }),
        api.branches.list(), api.grades.list(), api.people.list(),
      ]);
      if (controller.signal.aborted) return;
      setClasses(classList); setBranches(branchList); setGrades(gradeList); setPeople(personList);
      setCreate((current) => ({ ...current, branchId: current.branchId || branchList[0]?.id || '', gradeId: current.gradeId || gradeList[0]?.id || '' }));
      setSelectedId((current) => { const wanted = preferredId || current; return classList.some((item) => item.id === wanted) ? wanted : ''; });
    } catch (cause) {
      if (!isAbort(cause)) setError(cause instanceof Error ? cause.message : 'Classes could not be loaded.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => { void load(); return () => listController.current?.abort(); }, [load]);
  useEffect(() => {
    setStudentToAdd(''); setMoveStudentIds([]); setMoveTargetId(''); setEligible([]); setError('');
    if (!selected || selected.archivedAt || selected.courseType !== 'REGULAR') return;
    const controller = new AbortController(); setEligibleLoading(true);
    void api.academics.listEligibleClassStudents(selected.id, controller.signal).then(setEligible).catch((cause) => { if (!isAbort(cause)) setError(cause instanceof Error ? cause.message : 'Eligible students could not be loaded.'); }).finally(() => { if (!controller.signal.aborted) setEligibleLoading(false); });
    return () => controller.abort();
  }, [selected]);

  const run = async (kind: Exclude<Operation, null>, work: () => Promise<void>, success: string) => {
    setOperation(kind); setError(''); setMessage('');
    try { await work(); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The action could not be completed.'); }
    finally { setOperation(null); }
  };
  const chooseClass = (item: AcademicClass) => { setSelectedId(item.id); setCreating(false); setEdit({ name: item.name, teacherId: item.teacherId || '' }); setMessage(''); };
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];

  const submitCreate = (event: FormEvent) => {
    event.preventDefault(); const grade = grades.find((item) => item.id === create.gradeId);
    const className = create.kind === 'REGULAR' ? `${grade?.name || 'Grade'} - Section ${create.name}` : create.name.trim();
    void run('create', async () => {
      const result = await api.academics.setupClass({ branchId: create.branchId, gradeId: create.gradeId, courseName: create.subject.trim(), courseType: create.kind === 'REGULAR' ? 'REGULAR' : 'SHORT_TERM', className, monthlyBase: Number(create.monthlyFee), teacherId: create.teacherId || null, studentIds: create.kind === 'EXTRA' ? create.studentIds : [] });
      setCreating(false); setCreate((current) => ({ ...emptyCreate, branchId: current.branchId, gradeId: current.gradeId })); await load(result.class.id);
    }, 'Class created.');
  };
  const submitEdit = (event: FormEvent) => { event.preventDefault(); if (!selected || !editDirty) return; void run('save', async () => { await api.academics.updateClass(selected.id, { name: edit.name.trim(), teacherId: edit.teacherId || null }); await load(selected.id); }, 'Changes saved.'); };
  const addStudent = () => { if (!selected || !studentToAdd) return; void run('add', async () => { await api.academics.enroll(studentToAdd, selected.courseId, selected.id); await load(selected.id); }, 'Student added.'); };
  const openLifecycle = (kind: 'archive' | 'delete') => {
    if (!selected) return; dependencyController.current?.abort(); const controller = new AbortController(); dependencyController.current = controller;
    setDependencies(null); setDialog({ kind });
    void api.academics.getClassDependencies(selected.id, controller.signal).then(setDependencies).catch((cause) => { if (!isAbort(cause)) { setDialog(null); setError(cause instanceof Error ? cause.message : 'Dependencies could not be loaded.'); } });
  };
  const archive = () => { if (!selected || !dependencies || (!dependencies.archived && !dependencies.canArchive)) return; void run('archive', async () => { await api.academics.setClassArchived(selected.id, !dependencies.archived); setDialog(null); await load(selected.id); }, dependencies.archived ? 'Class restored.' : 'Class archived.'); };
  const remove = (enrollment: AcademicClassEnrollment) => { if (!selected) return; void run('remove', async () => { await api.academics.unenroll(enrollment.id); setDialog(null); await load(selected.id); }, 'Student removed; history preserved.'); };
  const move = () => { if (!selected || !moveTargetId || !moveStudentIds.length) return; const count = moveStudentIds.length; void run('move', async () => { await api.academics.moveClassStudents(selected.id, moveTargetId, moveStudentIds); setDialog(null); await load(selected.id); }, `${count} student${count === 1 ? '' : 's'} moved.`); };
  const permanentlyDelete = () => { if (!selected || !dependencies?.canDelete) return; void run('delete', async () => { await api.academics.deleteClass(selected.id); setDialog(null); setSelectedId(''); await load(); }, 'Class permanently deleted.'); };

  return <main className="branch-classes">
    <header><h1>Branch classes</h1><p>Create classes, manage rosters, and preserve their academic history.</p></header>
    <div className="branch-classes__toolbar"><Button onClick={() => { setCreating(true); setSelectedId(''); }}>Create class</Button><a href="/branch/timetable">Open timetable</a><label className="branch-classes__filter">Filter by branch or class<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="e.g. branch-123" aria-label="Filter classes by branch or class name" /></label><label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived</label></div>
    <Feedback error={error} message={message} onRetry={() => void load(selectedId)} />
    {creating ? <CreateClassForm value={create} setValue={setCreate} branches={branches} grades={grades} teachers={teachers} sourceClasses={sourceClasses} sourceStudents={sourceStudents} busy={operation === 'create'} onSubmit={submitCreate} onCancel={() => setCreating(false)} toggleStudent={(id) => setCreate((current) => ({ ...current, studentIds: toggle(current.studentIds, id) }))} /> : null}
    {loading ? <ClassSkeleton /> : !creating ? <div className="branch-classes__grid">
      <Card hoverable={false}><h2>{showArchived ? 'All classes' : 'Active classes'}</h2>{visibleClasses.length ? <div className="branch-classes__list">{visibleClasses.map((item) => <button type="button" key={item.id} aria-pressed={selectedId === item.id} className={item.archivedAt ? 'is-archived' : ''} onClick={() => chooseClass(item)}><strong>{item.name}</strong>{item.archivedAt ? <span>Archived</span> : null}<small>{item.courseName} · {item.enrollmentCount} students</small></button>)}</div> : <EmptyClasses archived={showArchived} onCreate={() => setCreating(true)} />}</Card>
      {selected ? <ClassDetails selected={selected} edit={edit} setEdit={setEdit} teachers={selectedTeachers} editDirty={editDirty} operation={operation} eligible={eligible} eligibleLoading={eligibleLoading} studentToAdd={studentToAdd} setStudentToAdd={setStudentToAdd} addStudent={addStudent} moveStudentIds={moveStudentIds} toggleMove={(id) => setMoveStudentIds((current) => toggle(current, id))} moveTargetId={moveTargetId} setMoveTargetId={setMoveTargetId} moveTargets={moveTargets} submitEdit={submitEdit} openLifecycle={openLifecycle} openRemove={(enrollment) => setDialog({ kind: 'remove', enrollment })} openMove={() => setDialog({ kind: 'move' })} /> : <Card hoverable={false} className="branch-classes__empty-detail">Select a class to manage it.</Card>}
    </div> : null}
    <LifecycleDialog state={dialog} dependencies={dependencies} selected={selected} moveCount={moveStudentIds.length} targetName={moveTargets.find((item) => item.id === moveTargetId)?.name} operation={operation} onClose={() => setDialog(null)} onArchive={archive} onDelete={permanentlyDelete} onRemove={remove} onMove={move} />
  </main>;
}

type CreateState = typeof emptyCreate;
function CreateClassForm({ value, setValue, branches, grades, teachers, sourceClasses, sourceStudents, busy, onSubmit, onCancel, toggleStudent }: { value: CreateState; setValue: Dispatch<SetStateAction<CreateState>>; branches: Branch[]; grades: Grade[]; teachers: Person[]; sourceClasses: AcademicClass[]; sourceStudents: AcademicClassEnrollment[]; busy: boolean; onSubmit: (event: FormEvent) => void; onCancel: () => void; toggleStudent: (id: string) => void }) {
  return <Card hoverable={false}><h2>Create class</h2><form className="branch-classes__form" onSubmit={onSubmit} aria-busy={busy}><div className="branch-classes__fields">
    <Field label="Class type"><select value={value.kind} onChange={(e) => setValue({ ...value, kind: e.target.value as 'REGULAR' | 'EXTRA', name: e.target.value === 'REGULAR' ? 'A' : '', sourceClassId: '', studentIds: [] })}><option value="REGULAR">Regular class</option><option value="EXTRA">Extra class</option></select></Field>
    <Field label="Branch"><select required value={value.branchId} onChange={(e) => setValue({ ...value, branchId: e.target.value, teacherId: '', sourceClassId: '', studentIds: [] })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Grade"><select required value={value.gradeId} onChange={(e) => setValue({ ...value, gradeId: e.target.value, sourceClassId: '', studentIds: [] })}><option value="">Select grade</option>{grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label={value.kind === 'REGULAR' ? 'Section' : 'Class name'}>{value.kind === 'REGULAR' ? <select value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })}>{['A', 'B', 'C', 'D'].map((name) => <option key={name} value={name}>Section {name}</option>)}</select> : <input required maxLength={160} value={value.name} placeholder="Robotics Club" onChange={(e) => setValue({ ...value, name: e.target.value })} />}</Field>
    <Field label="Subject or activity"><input required maxLength={160} value={value.subject} placeholder="Mathematics or Robotics" onChange={(e) => setValue({ ...value, subject: e.target.value })} /></Field>
    <Field label="Monthly fee (NPR)"><input required inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" value={value.monthlyFee} onChange={(e) => setValue({ ...value, monthlyFee: e.target.value })} /></Field>
    <Field label="Teacher"><select value={value.teacherId} onChange={(e) => setValue({ ...value, teacherId: e.target.value })}><option value="">Assign later</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
  </div>{value.kind === 'EXTRA' ? <fieldset><legend>Initial roster ({value.studentIds.length})</legend><Field label="Source regular class"><select required value={value.sourceClassId} onChange={(e) => setValue({ ...value, sourceClassId: e.target.value, studentIds: [] })}><option value="">Select a class</option>{sourceClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>{sourceStudents.map((student) => <label className="branch-classes__check" key={student.studentId}><input type="checkbox" checked={value.studentIds.includes(student.studentId)} onChange={() => toggleStudent(student.studentId)} />{student.studentName}</label>)}</fieldset> : null}<div className="branch-classes__actions"><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create class'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div></form></Card>;
}

function ClassDetails({ selected, edit, setEdit, teachers, editDirty, operation, eligible, eligibleLoading, studentToAdd, setStudentToAdd, addStudent, moveStudentIds, toggleMove, moveTargetId, setMoveTargetId, moveTargets, submitEdit, openLifecycle, openRemove, openMove }: { selected: AcademicClass; edit: { name: string; teacherId: string }; setEdit: (value: { name: string; teacherId: string }) => void; teachers: Person[]; editDirty: boolean; operation: Operation; eligible: EligibleStudent[]; eligibleLoading: boolean; studentToAdd: string; setStudentToAdd: (id: string) => void; addStudent: () => void; moveStudentIds: string[]; toggleMove: (id: string) => void; moveTargetId: string; setMoveTargetId: (id: string) => void; moveTargets: AcademicClass[]; submitEdit: (event: FormEvent) => void; openLifecycle: (kind: 'archive' | 'delete') => void; openRemove: (enrollment: AcademicClassEnrollment) => void; openMove: () => void }) {
  return <Card hoverable={false}><div className="branch-classes__detail-head"><div><StatusBadge variant={selected.archivedAt ? 'warning' : selected.courseType === 'REGULAR' ? 'info' : 'success'}>{selected.archivedAt ? 'Archived' : selected.courseType === 'REGULAR' ? 'Regular' : 'Extra'}</StatusBadge><h2>{selected.name}</h2><p>{selected.gradeName} · {selected.courseName} · {selected.branchName}</p></div><div className="branch-classes__actions"><Button variant="outline" onClick={() => openLifecycle('archive')}>{selected.archivedAt ? 'Restore' : 'Archive'}</Button><Button variant="danger" onClick={() => openLifecycle('delete')}>Delete</Button></div></div>
    <form className="branch-classes__form" onSubmit={submitEdit} aria-busy={operation === 'save'}><div className="branch-classes__fields"><Field label="Class name"><input required maxLength={160} disabled={Boolean(selected.archivedAt)} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="Assigned teacher"><select disabled={Boolean(selected.archivedAt)} value={edit.teacherId} onChange={(e) => setEdit({ ...edit, teacherId: e.target.value })}><option value="">Unassigned</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><Button type="submit" disabled={Boolean(selected.archivedAt) || !editDirty || operation === 'save'}>{operation === 'save' ? 'Saving…' : 'Save changes'}</Button></form>
    {selected.archivedAt ? <p className="branch-classes__note">Archived classes are read-only. Restore this class to manage it.</p> : <section className="branch-classes__roster"><h3>Students ({selected.enrollments.length})</h3>{selected.courseType === 'REGULAR' ? <div className="branch-classes__inline"><select aria-label="Eligible student" value={studentToAdd} disabled={eligibleLoading || operation === 'add'} onChange={(e) => setStudentToAdd(e.target.value)}><option value="">{eligibleLoading ? 'Loading students…' : 'Select an eligible student'}</option>{eligible.map((item) => <option key={item.studentId} value={item.studentId}>{item.studentName} · {item.studentEmail}</option>)}</select><Button disabled={!studentToAdd || operation === 'add'} onClick={addStudent}>{operation === 'add' ? 'Adding…' : 'Add student'}</Button></div> : null}{selected.enrollments.length ? <><div className="branch-classes__students">{selected.enrollments.map((item) => <div key={item.id}><label className="branch-classes__student"><input type="checkbox" checked={moveStudentIds.includes(item.studentId)} onChange={() => toggleMove(item.studentId)} aria-label={`Select ${item.studentName} to move`} /><span><strong>{item.studentName}</strong><small>{item.studentEmail}</small></span></label><Button variant="outline" disabled={operation === 'remove'} onClick={() => openRemove(item)}>Remove</Button></div>)}</div><div className="branch-classes__inline"><select aria-label="Target class" value={moveTargetId} onChange={(e) => setMoveTargetId(e.target.value)}><option value="">Move selected to…</option>{moveTargets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.courseName}</option>)}</select><Button variant="outline" disabled={!moveTargetId || !moveStudentIds.length || operation === 'move'} onClick={openMove}>Review move ({moveStudentIds.length})</Button></div></> : <p className="branch-classes__note">No active students. This class can now be archived.</p>}</section>}
  </Card>;
}

function LifecycleDialog({ state, dependencies, selected, moveCount, targetName, operation, onClose, onArchive, onDelete, onRemove, onMove }: { state: DialogState; dependencies: ClassDependencies | null; selected?: AcademicClass; moveCount: number; targetName?: string; operation: Operation; onClose: () => void; onArchive: () => void; onDelete: () => void; onRemove: (item: AcademicClassEnrollment) => void; onMove: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); useEffect(() => { if (state && !ref.current?.open) ref.current?.showModal(); else if (!state && ref.current?.open) ref.current.close(); }, [state]);
  if (!state) return <dialog ref={ref} />;
  const close = () => { ref.current?.close(); onClose(); };
  return <dialog ref={ref} className="branch-classes__dialog" onClose={onClose}><h2>{state.kind === 'delete' ? 'Delete permanently?' : state.kind === 'archive' ? `${selected?.archivedAt ? 'Restore' : 'Archive'} class?` : state.kind === 'remove' ? `Remove ${state.enrollment.studentName}?` : `Move ${moveCount} student${moveCount === 1 ? '' : 's'}?`}</h2>{state.kind === 'archive' || state.kind === 'delete' ? !dependencies ? <p aria-busy="true">Checking dependencies…</p> : <><DependencyList value={dependencies} />{state.kind === 'archive' && !dependencies.archived && !dependencies.canArchive ? <p role="alert">Move or remove active students first.</p> : null}{state.kind === 'delete' && !dependencies.canDelete ? <p role="alert">This class has history and cannot be permanently deleted. Archive it instead.</p> : null}</> : state.kind === 'remove' ? <p>The active enrollment will close, but its history will remain.</p> : <p>Current enrollments will close and new ones will be created in <strong>{targetName}</strong>.</p>}<div className="branch-classes__actions">{state.kind === 'archive' ? <Button disabled={!dependencies || (!dependencies.archived && !dependencies.canArchive) || operation === 'archive'} onClick={onArchive}>{operation === 'archive' ? 'Updating…' : dependencies?.archived ? 'Restore' : 'Archive'}</Button> : state.kind === 'delete' ? <Button variant="danger" disabled={!dependencies?.canDelete || operation === 'delete'} onClick={onDelete}>{operation === 'delete' ? 'Deleting…' : 'Delete permanently'}</Button> : state.kind === 'remove' ? <Button variant="danger" disabled={operation === 'remove'} onClick={() => onRemove(state.enrollment)}>{operation === 'remove' ? 'Removing…' : 'Remove student'}</Button> : <Button disabled={operation === 'move'} onClick={onMove}>{operation === 'move' ? 'Moving…' : 'Confirm move'}</Button>}<Button variant="outline" onClick={close}>Cancel</Button></div></dialog>;
}

function DependencyList({ value }: { value: ClassDependencies }) { const labels = { activeEnrollments: 'Active students', enrollmentHistory: 'Enrollment records', sessions: 'Sessions', attendanceRecords: 'Attendance records', homework: 'Homework', syllabi: 'Syllabi', resultDefinitions: 'Result definitions' }; return <dl className="branch-classes__dependencies">{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{value.dependencies[key as keyof typeof value.dependencies]}</dd></div>)}</dl>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="branch-classes__field"><span>{label}</span>{children}</label>; }
function Feedback({ error, message, onRetry }: { error: string; message: string; onRetry: () => void }) { if (!error && !message) return null; return <div className={error ? 'branch-classes__feedback is-error' : 'branch-classes__feedback'} role={error ? 'alert' : 'status'}>{error || message}{error ? <Button variant="outline" onClick={onRetry}>Try again</Button> : null}</div>; }
function EmptyClasses({ archived, onCreate }: { archived: boolean; onCreate: () => void }) { return <div className="branch-classes__empty"><strong>{archived ? 'No classes yet' : 'No active classes'}</strong><p>{archived ? 'Create the first class for this branch.' : 'Show archived classes or create a new one.'}</p><Button variant="outline" onClick={onCreate}>Create class</Button></div>; }
function ClassSkeleton() { return <div className="branch-classes__grid" aria-label="Loading classes" aria-busy="true"><div className="branch-classes__skeleton" /><div className="branch-classes__skeleton" /></div>; }
function isAbort(cause: unknown) { return cause instanceof DOMException && cause.name === 'AbortError'; }
