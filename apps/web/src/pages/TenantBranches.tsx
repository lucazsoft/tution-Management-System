import { Link } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LucideIcon } from '../components/ui/LucideIcon';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { api } from '../services/api';
import './tenantBranches.css';

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

/**
 * A branch left at 0,0 is the Null Island default, not a real location — the
 * geofence can never match there, so the card flags it rather than printing
 * coordinates that read as configured.
 */
function hasGeofence(branch: BranchItem) {
  return (
    Number.isFinite(branch.latitude) &&
    Number.isFinite(branch.longitude) &&
    (Math.abs(branch.latitude) > 0.0001 || Math.abs(branch.longitude) > 0.0001)
  );
}

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
    <div className="branches-page">
      <Card hoverable={false} className="branches-header">
        <div className="branches-header-row">
          <div>
            <h2>Branch Network</h2>
            <p>Manage every center from one account — add branches as you expand to new locations.</p>
          </div>
          <div className="branches-header-actions">
            <Button variant="outline" onClick={() => void loadBranches()} disabled={isLoading}>
              <LucideIcon name="refresh-cw" size={17} />
              Refresh
            </Button>
            <Button onClick={startCreate}>
              <LucideIcon name="plus" size={17} />
              Add Branch
            </Button>
          </div>
        </div>
      </Card>

      {errorMsg ? <StatusBadge variant="error">{errorMsg}</StatusBadge> : null}

      {showForm ? (
        <Card hoverable={false} className="branch-form-card">
          <h3>{editingId ? 'Edit Branch' : 'New Branch'}</h3>
          <form onSubmit={handleSubmit} className="branch-form">
            <div className="branch-form-grid">
              <div className="branch-form-field">
                <label htmlFor="branch-name">Branch Name</label>
                <input id="branch-name" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Birtamod Center" required />
              </div>
              <div className="branch-form-field">
                <label htmlFor="branch-address">Address</label>
                <input id="branch-address" value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Street, City, District" required />
              </div>
              <div className="branch-form-field">
                <label htmlFor="branch-latitude">Latitude</label>
                <input id="branch-latitude" value={form.latitude} onChange={(e) => setField('latitude', e.target.value)} placeholder="26.6586" inputMode="decimal" required />
              </div>
              <div className="branch-form-field">
                <label htmlFor="branch-longitude">Longitude</label>
                <input id="branch-longitude" value={form.longitude} onChange={(e) => setField('longitude', e.target.value)} placeholder="87.7025" inputMode="decimal" required />
              </div>
              <div className="branch-form-field">
                <label htmlFor="branch-radius">Geofence Radius (meters)</label>
                <input id="branch-radius" value={form.radiusMeters} onChange={(e) => setField('radiusMeters', e.target.value)} inputMode="numeric" />
              </div>
              <div className="branch-form-field">
                <label htmlFor="branch-grace">Attendance Grace (minutes)</label>
                <input id="branch-grace" value={form.gracePeriodMinutes} onChange={(e) => setField('gracePeriodMinutes', e.target.value)} inputMode="numeric" />
              </div>
              <div className="branch-form-field">
                <label htmlFor="branch-admission-fee">Admission Fee (NPR)</label>
                <input
                  id="branch-admission-fee"
                  value={form.admissionFee}
                  onChange={(e) => setField('admissionFee', e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-describedby="branch-admission-fee-help"
                  required
                />
                <small id="branch-admission-fee-help">
                  Student and parent logins activate only after this branch-specific amount is paid.
                </small>
              </div>
            </div>
            <p className="branch-form-note">
              <LucideIcon name="locate-fixed" size={16} />
              <span>
                Latitude/longitude power the teacher attendance geofence — staff can only mark in within the radius of the branch location.
              </span>
            </p>
            <div className="branch-form-actions">
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

      {isLoading && branches.length === 0 ? (
        <div className="branches-grid">
          {[0, 1].map((key) => (
            <Card key={key} hoverable={false} className="branch-card-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </Card>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Card hoverable={false} className="branches-empty">
          <span className="branches-empty-mark">
            <LucideIcon name="building" size={26} />
          </span>
          <h3>No branches yet</h3>
          <p>Add your first center to start assigning staff, courses and attendance geofences.</p>
          <Button onClick={startCreate}>
            <LucideIcon name="plus" size={17} />
            Add Branch
          </Button>
        </Card>
      ) : (
        <div className="branches-grid">
          {branches.map((branch) => {
            const geofenced = hasGeofence(branch);

            return (
              <Card key={branch.id} hoverable={false} className="branch-card">
                <div className="branch-card-head">
                  <span className="branch-card-mark">
                    <LucideIcon name="building" size={21} />
                  </span>
                  <div className="branch-card-ident">
                    <h3>{branch.name}</h3>
                    <p className="branch-card-address">
                      <LucideIcon name="map-pin" size={14} />
                      {branch.address}
                    </p>
                  </div>
                  <StatusBadge status={geofenced ? 'success' : 'warning'}>
                    {geofenced ? 'Active' : 'Setup needed'}
                  </StatusBadge>
                </div>

                <div className={`branch-geofence${geofenced ? '' : ' is-unset'}`}>
                  <div className="branch-geofence-main">
                    <span className="branch-geofence-icon">
                      <LucideIcon name={geofenced ? 'locate-fixed' : 'triangle-alert'} size={18} />
                    </span>
                    <span>
                      <span className="branch-geofence-label">Attendance geofence</span>
                      <span className="branch-geofence-value">
                        {geofenced
                          ? `${branch.latitude.toFixed(4)}, ${branch.longitude.toFixed(4)}`
                          : 'No coordinates set — staff cannot mark in'}
                      </span>
                    </span>
                  </div>
                  <span className="branch-geofence-radius">{branch.radiusMeters} m</span>
                </div>

                <div className="branch-metrics">
                  <div className="branch-metric">
                    <span className="branch-metric-label">
                      <LucideIcon name="timer" size={13} />
                      Grace
                    </span>
                    <span className="branch-metric-value">
                      {branch.gracePeriodMinutes}
                      <span className="branch-metric-unit">min</span>
                    </span>
                  </div>
                  <div className="branch-metric">
                    <span className="branch-metric-label">
                      <LucideIcon name="users" size={13} />
                      Staff
                    </span>
                    <span className="branch-metric-value">{branch.staffCount ?? 0}</span>
                  </div>
                  <div className="branch-metric">
                    <span className="branch-metric-label">
                      <LucideIcon name="book-open" size={13} />
                      Courses
                    </span>
                    <span className="branch-metric-value">{branch.courseCount ?? 0}</span>
                  </div>
                </div>

                <div className="branch-fee">
                  <span className="branch-fee-label">
                    <LucideIcon name="banknote" size={16} />
                    Admission fee
                  </span>
                  <span className="branch-fee-amount">NPR {Number(branch.admissionFee ?? 0).toLocaleString()}</span>
                </div>

                <div className="branch-card-actions">
                  <Button variant="secondary" onClick={() => startEdit(branch)}>
                    <LucideIcon name="square-pen" size={16} />
                    Edit Branch
                  </Button>
                  <Link
                    className="branch-payment-link"
                    to={`/tenant/payment-settings?branchId=${encodeURIComponent(branch.id)}`}
                  >
                    <LucideIcon name="credit-card" size={16} />
                    Payments
                    <LucideIcon name="chevron-right" size={15} />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
