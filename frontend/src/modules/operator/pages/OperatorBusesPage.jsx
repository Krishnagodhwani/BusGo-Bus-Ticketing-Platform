import { useEffect, useMemo, useState } from 'react';
import {
  cloneBus,
  createBus,
  deleteBus,
  getAdminBusTypes,
  getMyBuses,
  updateBus,
  updateBusStatus,
} from '../services/operatorService';
import './OperatorWorkspace.css';

const initialForm = {
  bus_type_id: '',
  name: '',
  reg_number: '',
  internal_code: '',
  operational_status: 'ACTIVE',
  amenities: '',
  notes: '',
  is_active: true,
};

export default function OperatorBusesPage() {
  const [buses, setBuses] = useState([]);
  const [busTypes, setBusTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [busesRes, typesRes] = await Promise.all([getMyBuses(), getAdminBusTypes()]);
      setBuses(busesRes.data);
      setBusTypes(typesRes.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load bus management data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredBuses = useMemo(() => {
    return buses.filter((bus) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [bus.name, bus.reg_number, bus.internal_code, bus.bus_type_name]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || bus.status_tag === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [buses, search, statusFilter]);

  const openCreate = () => {
    setEditingBus(null);
    setForm(initialForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (bus) => {
    setEditingBus(bus);
    setForm({
      bus_type_id: bus.bus_type_id,
      name: bus.name,
      reg_number: bus.reg_number,
      internal_code: bus.internal_code || '',
      operational_status: bus.operational_status || 'ACTIVE',
      amenities: (bus.amenities || []).join(', '),
      notes: bus.notes || '',
      is_active: bus.is_active,
    });
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBus(null);
    setForm(initialForm);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        bus_type_id: Number(form.bus_type_id),
        amenities: form.amenities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };

      if (editingBus) {
        await updateBus(editingBus.id, payload);
      } else {
        await createBus(payload);
      }

      closeModal();
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save bus changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (bus, operationalStatus, isActive = true) => {
    try {
      await updateBusStatus(bus.id, { operational_status: operationalStatus, is_active: isActive });
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to update bus status.');
    }
  };

  const handleClone = async (busId) => {
    try {
      await cloneBus(busId);
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to clone bus.');
    }
  };

  const handleDelete = async (bus) => {
    const confirmed = window.confirm(
      `${bus.name} will be deleted if unused, otherwise safely archived. Continue?`
    );
    if (!confirmed) return;
    try {
      await deleteBus(bus.id, true);
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to delete or archive bus.');
    }
  };

  const statusTone = (status) => {
    if (status === 'ACTIVE') return 'active';
    if (status === 'SCHEDULED') return 'info';
    if (status === 'MAINTENANCE') return 'warning';
    return 'danger';
  };

  const fleetReady = buses.filter((bus) => bus.status_tag === 'ACTIVE' || bus.status_tag === 'SCHEDULED').length;

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">My Buses</h1>
          <div className="operator-page-subtitle">
            This panel is now designed as a practical fleet workspace: search fast, see bus readiness, open quick actions,
            and manage maintenance or inactivity without losing operational history.
          </div>
        </div>
        <div className="operator-action-row">
          <button className="operator-primary-btn" onClick={openCreate}>Register New Bus</button>
        </div>
      </div>

      <div className="operator-kpi-grid">
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Total Fleet</div>
          <div className="operator-kpi-value">{buses.length}</div>
          <div className="operator-kpi-meta">All buses created under this operator account</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Ready to Schedule</div>
          <div className="operator-kpi-value">{fleetReady}</div>
          <div className="operator-kpi-meta">Active or already planned for service</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">In Maintenance</div>
          <div className="operator-kpi-value">{buses.filter((bus) => bus.status_tag === 'MAINTENANCE').length}</div>
          <div className="operator-kpi-meta">Temporarily hidden from new schedules</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Scheduled Usage</div>
          <div className="operator-kpi-value">{buses.reduce((sum, bus) => sum + (bus.upcoming_trip_count || 0), 0)}</div>
          <div className="operator-kpi-meta">Upcoming departures assigned to fleet</div>
        </div>
      </div>

      <div className="operator-panel-card">
        <div className="operator-toolbar">
          <div className="operator-toolbar-group">
            <input
              className="form-input operator-search"
              placeholder="Search by bus name, plate, code, or type"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="MAINTENANCE">Under Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
            Quick actions are intentionally placed beside each record so operators do not need to open extra pages for common tasks.
          </div>
        </div>
      </div>

      {error && (
        <div className="operator-panel-card" style={{ color: 'var(--red-400)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="operator-empty-card">Loading fleet workspace...</div>
      ) : filteredBuses.length === 0 ? (
        <div className="operator-empty-card">
          <div className="operator-empty-title">{buses.length === 0 ? 'Create your first bus' : 'No buses match your filters'}</div>
          <div className="operator-empty-copy">
            Start with one real vehicle. After that, you can clone similar buses, mark maintenance periods, and schedule trips directly.
          </div>
          {buses.length === 0 && <button className="operator-primary-btn" onClick={openCreate}>Register First Bus</button>}
        </div>
      ) : (
        <div className="operator-list">
          {filteredBuses.map((bus) => (
            <div className="operator-record" key={bus.id}>
              <div className="operator-record-main">
                <div>
                  <div className="operator-record-title">{bus.name}</div>
                  <div className="operator-record-subtitle">
                    {bus.reg_number} {bus.internal_code ? `| Internal ID: ${bus.internal_code}` : ''} | {bus.bus_type_name}
                  </div>
                </div>

                <div className="operator-chip-row">
                  <span className={`operator-chip ${statusTone(bus.status_tag)}`}>{bus.status_tag}</span>
                  {bus.bus_layout && <span className="operator-chip route">Layout {bus.bus_layout}</span>}
                  {bus.has_ac && <span className="operator-chip">AC</span>}
                  {bus.has_sleeper ? <span className="operator-chip">Sleeper</span> : <span className="operator-chip">Seater</span>}
                  {(bus.amenities || []).slice(0, 3).map((item) => (
                    <span key={item} className="operator-chip">{item}</span>
                  ))}
                </div>

                <div className="operator-record-stats">
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Assigned Trips</div>
                    <div className="operator-stat-box-value">{bus.assigned_trip_count || 0}</div>
                  </div>
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Upcoming</div>
                    <div className="operator-stat-box-value">{bus.upcoming_trip_count || 0}</div>
                  </div>
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Next Trip</div>
                    <div className="operator-stat-box-value">
                      {bus.next_trip_at
                        ? new Date(bus.next_trip_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Not assigned'}
                    </div>
                  </div>
                </div>

                {bus.notes && (
                  <div className="operator-record-subtitle">
                    Notes: {bus.notes}
                  </div>
                )}
              </div>

              <div className="operator-record-actions">
                <button className="operator-secondary-btn" onClick={() => openEdit(bus)}>Edit</button>
                <button className="operator-secondary-btn" onClick={() => handleClone(bus.id)}>Clone</button>
                <button className="operator-secondary-btn" onClick={() => handleStatusAction(bus, 'MAINTENANCE', true)}>Mark Maintenance</button>
                <button className="operator-secondary-btn" onClick={() => handleStatusAction(bus, 'ACTIVE', true)}>Set Active</button>
                <button className="operator-secondary-btn" onClick={() => handleStatusAction(bus, 'INACTIVE', false)}>Deactivate</button>
                <button className="operator-ghost-btn" onClick={() => handleDelete(bus)}>Delete / Archive</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <div className="modal-title">{editingBus ? 'Edit Bus' : 'Register Bus'}</div>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
                <div className="operator-grid-two">
                  <div>
                    <label className="operator-record-subtitle">Bus Name</label>
                    <input className="form-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                  </div>
                  <div>
                    <label className="operator-record-subtitle">Registration Number</label>
                    <input className="form-input" value={form.reg_number} onChange={(event) => setForm({ ...form, reg_number: event.target.value.toUpperCase() })} required />
                  </div>
                </div>

                <div className="operator-grid-two">
                  <div>
                    <label className="operator-record-subtitle">Master Bus Type</label>
                    <select className="form-input" value={form.bus_type_id} onChange={(event) => setForm({ ...form, bus_type_id: event.target.value })} required>
                      <option value="" disabled>Select type</option>
                      {busTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.name} | {type.layout}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="operator-record-subtitle">Internal Bus ID / Code</label>
                    <input className="form-input" value={form.internal_code} onChange={(event) => setForm({ ...form, internal_code: event.target.value })} placeholder="Optional operator code" />
                  </div>
                </div>

                <div className="operator-grid-two">
                  <div>
                    <label className="operator-record-subtitle">Operational Status</label>
                    <select className="form-input" value={form.operational_status} onChange={(event) => setForm({ ...form, operational_status: event.target.value })}>
                      <option value="ACTIVE">Active</option>
                      <option value="MAINTENANCE">Under Maintenance</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="operator-record-subtitle">Amenities</label>
                    <input className="form-input" value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} placeholder="WiFi, Charging, Water Bottle" />
                  </div>
                </div>

                <div>
                  <label className="operator-record-subtitle">Internal Notes</label>
                  <textarea className="form-input" rows="4" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Maintenance reminders, assigned crew, or internal remarks" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="operator-secondary-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="operator-primary-btn" disabled={saving}>
                  {saving ? 'Saving...' : editingBus ? 'Save Bus Changes' : 'Register Bus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
