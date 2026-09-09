import { Link } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';

interface BranchItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  gracePeriodMinutes: number;
  admissionFee: number;
  createdAt: string;
  staffCount: number;
  courseCount: number;
}

interface BranchFormState {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  gracePeriodMinutes: string;
  admissionFee: string;
}

const EMPTY_FORM: BranchFormState = {
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: '100',
  gracePeriodMinutes: '15',
  admissionFee: '0',
};

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(21, 96, 189, 0.14)',
  background: '#FFFFFF',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-ui)',
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--color-text)',
};

export function TenantBranches() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadBranches = async () => {
    setIsLoading(true);
    setErrorMsg('');

    try {
      const list = (await api.branches.list()) as BranchItem[];
      setBranches(list);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to load branches.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, []);

  const setField = (field: keyof BranchFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('');
    setShowForm(true);
  };

  const startEdit = (branch: BranchItem) => {
    setForm({
      name: branch.name,
      address: branch.address,
      latitude: String(branch.latitude),
      longitude: String(branch.longitude),
      radiusMeters: String(branch.radiusMeters),
      gracePeriodMinutes: String(branch.gracePeriodMinutes),
      admissionFee: String(branch.admissionFee),
    });
    setEditingId(branch.id);
    setShowForm(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (!form.name.trim() || !form.address.trim()) {
      showToast('Branch name and address are required.', 'error');
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      showToast('Enter valid latitude and longitude for the attendance geofence.', 'error');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        latitude,
        longitude,
        radiusMeters: Number(form.radiusMeters) || 100,
        gracePeriodMinutes: Number(form.gracePeriodMinutes) || 15,
        admissionFee: Math.max(0, Math.round(Number(form.admissionFee) || 0)),
      };

      if (editingId) {
        await api.branches.update(editingId, payload);
        showToast('Branch updated.', 'success');
      } else {
        await api.branches.create(payload);
        showToast('Branch created.', 'success');
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId('');
      await loadBranches();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to save the branch.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Card hoverable={false} style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>Branch Network</h3>
            <p style={{ marginTop: '4px', color: 'rgba(44, 62, 80, 0.7)', fontSize: '13px' }}>
              Manage every center from one account — add branches as you expand to new locations.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="outline" onClick={() => void loadBranches()} disabled={isLoading} style={{ height: '40px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
              Refresh
            </Button>
            <Button onClick={startCreate} style={{ height: '40px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_business</span>
              Add Branch
            </Button>
          </div>
        </div>
      </Card>

      {errorMsg ? <StatusBadge variant="error">{errorMsg}</StatusBadge> : null}

      {showForm ? (
        <Card hoverable={false}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '18px' }}>
            {editingId ? 'Edit Branch' : 'New Branch'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Branch Name</label>
                <input style={inputStyle} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Birtamod Center" required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Address</label>
                <input style={inputStyle} value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Street, City, District" required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Latitude</label>
                <input style={inputStyle} value={form.latitude} onChange={(e) => setField('latitude', e.target.value)} placeholder="26.6586" inputMode="decimal" required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Longitude</label>
                <input style={inputStyle} value={form.longitude} onChange={(e) => setField('longitude', e.target.value)} placeholder="87.7025" inputMode="decimal" required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Geofence Radius (meters)</label>
                <input style={inputStyle} value={form.radiusMeters} onChange={(e) => setField('radiusMeters', e.target.value)} inputMode="numeric" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Attendance Grace (minutes)</label>
                <input style={inputStyle} value={form.gracePeriodMinutes} onChange={(e) => setField('gracePeriodMinutes', e.target.value)} inputMode="numeric" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="branch-admission-fee" style={labelStyle}>Admission Fee (NPR)</label>
                <input
                  id="branch-admission-fee"
                  style={inputStyle}
                  value={form.admissionFee}
                  onChange={(e) => setField('admissionFee', e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-describedby="branch-admission-fee-help"
                  required
                />
                <small id="branch-admission-fee-help" style={{ color: 'var(--text-muted-foreground)' }}>
                  Student and parent logins activate only after this branch-specific amount is paid.
                </small>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(44, 62, 80, 0.6)' }}>
              Latitude/longitude power the teacher attendance geofence — staff can only mark in within the radius of the branch location.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Branch'}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
        {branches.length === 0 && !isLoading ? (
          <Card hoverable={false}>
            <p style={{ color: 'rgba(44, 62, 80, 0.64)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
              No branches yet. Add your first center to get started.
            </p>
          </Card>
        ) : (
          branches.map((branch) => (
            <Card key={branch.id} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{branch.name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted-foreground)', marginTop: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>location_on</span>
                    {branch.address}
                  </p>
                </div>
                <StatusBadge status="success" />
              </div>

              {/* GPS Geofence Visualizer Box */}
              <div style={{
                background: 'var(--color-surface)',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(243, 156, 18, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>radar</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)' }}>GPS Geofence</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted-foreground)' }}>
                      Lat: {branch.latitude?.toFixed(4)}, Long: {branch.longitude?.toFixed(4)}
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: '20px',
                  background: 'rgba(15, 76, 138, 0.1)',
                  color: 'var(--color-primary)'
                }}>
                  {branch.radiusMeters}m Radius
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', marginBottom: '16px' }}>
                <div style={{ background: 'var(--color-surface)', padding: '10px', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-muted-foreground)', display: 'block', fontSize: '11px' }}>Grace Period</span>
                  <strong>{branch.gracePeriodMinutes} mins</strong>
                </div>
                <div style={{ background: 'var(--color-surface)', padding: '10px', borderRadius: '8px' }}>
                  <span style={{ color: 'var(--text-muted-foreground)', display: 'block', fontSize: '11px' }}>Staff & Courses</span>
                  <strong>{branch.staffCount ?? 0} Staff · {branch.courseCount ?? 0} Courses</strong>
                </div>
                <div style={{ background: 'var(--color-surface)', padding: '10px', borderRadius: '8px', gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--text-muted-foreground)', display: 'block', fontSize: '11px' }}>Admission Fee</span>
                  <strong>NPR {Number(branch.admissionFee ?? 0).toLocaleString()}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Button variant="secondary" onClick={() => startEdit(branch)} style={{ flex: 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>edit</span>
                  Edit Branch
                </Button>
                <Link to={`/tenant/payment-settings?branchId=${encodeURIComponent(branch.id)}`}>Payment settings</Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
