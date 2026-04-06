import { useEffect, useMemo, useState } from 'react';
import {
  cancelTripSeries,
  cloneTrip,
  createTrip,
  createTripSchedule,
  deleteTrip,
  getMyBuses,
  getMyRoutes,
  getMyTrips,
  getTripOperationsSummary,
  updateTrip,
  updateTripStatus,
} from '../services/operatorService';
import './OperatorWorkspace.css';

const WEEKDAYS = [
  { label: 'Mon', value: 0 },
  { label: 'Tue', value: 1 },
  { label: 'Wed', value: 2 },
  { label: 'Thu', value: 3 },
  { label: 'Fri', value: 4 },
  { label: 'Sat', value: 5 },
  { label: 'Sun', value: 6 },
];

const blankForm = () => ({
  bus_id: '',
  route_id: '',
  schedule_type: 'ONE_TIME',
  departure_time: '',
  start_date: '',
  end_date: '',
  departure_clock: '',
  weekdays: [1, 2, 3, 4, 5],
  every_x_days: 2,
  status: 'SCHEDULED',
});

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not scheduled';

const tone = (status) => ({
  SCHEDULED: 'active',
  COMPLETED: 'active',
  RUNNING: 'route',
  DELAYED: 'warning',
  DRAFT: 'info',
}[status] || 'danger');

export default function OperatorTripsPage() {
  const [trips, setTrips] = useState([]);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [saving, setSaving] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scheduleFilter, setScheduleFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('UPCOMING');
  const [form, setForm] = useState(blankForm());
  const [opsTrip, setOpsTrip] = useState(null);
  const [opsSummary, setOpsSummary] = useState(null);
  const [delayForm, setDelayForm] = useState({ delay_mins: 15, ops_notes: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [tripRes, busRes, routeRes] = await Promise.all([getMyTrips(), getMyBuses(), getMyRoutes()]);
      setTrips(tripRes.data);
      setBuses(busRes.data);
      setRoutes(routeRes.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load scheduler data.');
    } finally {
      setLoading(false);
    }
  };

  const activeBuses = buses.filter((bus) => bus.is_active && bus.operational_status === 'ACTIVE');
  const activeRoutes = routes.filter((route) => route.is_active);
  const selectedBus = buses.find((bus) => bus.id === Number(form.bus_id));
  const selectedRoute = routes.find((route) => route.id === Number(form.route_id));

  const previewDates = useMemo(() => {
    if (editingTrip || form.schedule_type === 'ONE_TIME') {
      return form.departure_time ? [form.departure_time] : [];
    }
    if (!form.start_date || !form.end_date || !form.departure_clock) return [];
    const start = new Date(`${form.start_date}T00:00:00`);
    const end = new Date(`${form.end_date}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const [hours, minutes] = form.departure_clock.split(':').map(Number);
    const items = [];
    const cursor = new Date(start);
    while (cursor <= end && items.length < 60) {
      let include = false;
      if (form.schedule_type === 'DAILY') include = true;
      if (form.schedule_type === 'SELECTED_WEEKDAYS') include = form.weekdays.includes((cursor.getDay() + 6) % 7);
      if (form.schedule_type === 'EVERY_X_DAYS') {
        const diff = Math.floor((cursor - start) / (1000 * 60 * 60 * 24));
        include = diff % Math.max(Number(form.every_x_days) || 1, 1) === 0;
      }
      if (include) {
        const tripDate = new Date(cursor);
        tripDate.setHours(hours || 0, minutes || 0, 0, 0);
        items.push(tripDate.toISOString());
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return items;
  }, [editingTrip, form]);

  const filteredTrips = useMemo(() => {
    const now = new Date();
    return trips.filter((trip) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || [
        trip.route_name,
        trip.route_code,
        trip.bus_name,
        trip.bus_reg_number,
        trip.series_code,
        trip.recurrence_label,
      ].filter(Boolean).some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || trip.status === statusFilter;
      const recurring = Boolean(trip.series_code);
      const matchesSchedule = scheduleFilter === 'ALL' || (scheduleFilter === 'RECURRING' ? recurring : !recurring);
      const departure = new Date(trip.departure_time);
      const matchesTime = timeFilter === 'ALL' || (timeFilter === 'UPCOMING' ? departure >= now : departure < now);
      return matchesSearch && matchesStatus && matchesSchedule && matchesTime;
    });
  }, [trips, search, statusFilter, scheduleFilter, timeFilter]);

  const upcomingTrips = trips.filter((trip) => new Date(trip.departure_time) >= new Date() && ['SCHEDULED', 'RUNNING', 'DELAYED'].includes(trip.status)).length;
  const recurringSeries = new Set(trips.filter((trip) => trip.series_code).map((trip) => trip.series_code)).size;
  const draftTrips = trips.filter((trip) => trip.status === 'DRAFT').length;
  const cancelledTrips = trips.filter((trip) => trip.status === 'CANCELLED').length;

  const routeTimeline = selectedRoute?.stops ? [...selectedRoute.stops].sort((a, b) => a.stop_sequence - b.stop_sequence) : [];
  const smartNotice = !activeBuses.length
    ? 'Add an active bus before scheduling trips.'
    : !activeRoutes.length
      ? 'Create an active route before scheduling trips.'
      : selectedBus?.status_tag === 'MAINTENANCE'
        ? 'Selected bus is under maintenance and cannot be assigned.'
        : selectedBus?.status_tag === 'INACTIVE'
          ? 'Selected bus is inactive and should be reactivated.'
          : !selectedRoute?.is_active && selectedRoute
            ? 'Selected route is archived. Activate it before creating schedules.'
            : '';

  const resetModal = () => {
    setShowModal(false);
    setEditingTrip(null);
    setForm(blankForm());
    setError('');
  };

  const openCreate = () => {
    setEditingTrip(null);
    setForm(blankForm());
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const openEdit = (trip) => {
    setEditingTrip(trip);
    setForm({
      ...blankForm(),
      bus_id: trip.bus_id,
      route_id: trip.route_id,
      departure_time: trip.departure_time ? trip.departure_time.slice(0, 16) : '',
      status: trip.status,
    });
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const toggleWeekday = (value) => setForm((current) => ({
    ...current,
    weekdays: current.weekdays.includes(value)
      ? current.weekdays.filter((item) => item !== value)
      : [...current.weekdays, value].sort((a, b) => a - b),
  }));

  const submitSchedule = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingTrip) {
        await updateTrip(editingTrip.id, {
          bus_id: Number(form.bus_id),
          route_id: Number(form.route_id),
          departure_time: form.departure_time,
          status: form.status,
        });
      } else if (form.schedule_type === 'ONE_TIME') {
        await createTrip({
          bus_id: Number(form.bus_id),
          route_id: Number(form.route_id),
          departure_time: form.departure_time,
          status: form.status,
        });
      } else {
        await createTripSchedule({
          bus_id: Number(form.bus_id),
          route_id: Number(form.route_id),
          schedule_type: form.schedule_type,
          start_date: form.start_date,
          end_date: form.end_date,
          departure_clock: form.departure_clock,
          weekdays: form.weekdays,
          every_x_days: Number(form.every_x_days) || 1,
          status: form.status,
        });
      }
      resetModal();
      setSuccess(editingTrip ? 'Trip updated successfully.' : 'Schedule saved successfully.');
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save trip schedule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (trip) => {
    if (!window.confirm(`Delete trip on ${formatDateTime(trip.departure_time)}? If bookings exist, it will be cancelled instead.`)) return;
    try {
      await deleteTrip(trip.id);
      setSuccess('Trip updated successfully.');
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to delete trip.');
    }
  };

  const handleStatus = async (tripId, status) => {
    try {
      await updateTripStatus(tripId, { status });
      setSuccess(`Trip marked as ${status}.`);
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to update trip status.');
    }
  };

  const openOperations = async (trip) => {
    try {
      setOpsLoading(true);
      const response = await getTripOperationsSummary(trip.id);
      setOpsTrip(trip);
      setOpsSummary(response.data);
      setDelayForm({ delay_mins: trip.delay_mins || 15, ops_notes: trip.ops_notes || '' });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to load live trip operations.');
    } finally {
      setOpsLoading(false);
    }
  };

  const applyOpsStatus = async (status, extra = {}) => {
    if (!opsTrip) return;
    try {
      await updateTripStatus(opsTrip.id, { status, ...extra });
      setSuccess(`Trip marked as ${status}.`);
      setOpsTrip(null);
      setOpsSummary(null);
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to update live trip status.');
    }
  };

  const handleClone = async (tripId, daysOffset) => {
    try {
      await cloneTrip(tripId, { days_offset: daysOffset });
      setSuccess(daysOffset === 7 ? 'Trip cloned for next week.' : 'Trip duplicated successfully.');
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to clone trip.');
    }
  };

  const handleSeriesCancel = async (seriesCode) => {
    if (!window.confirm('Cancel all upcoming trips in this recurring series?')) return;
    try {
      await cancelTripSeries(seriesCode);
      setSuccess('Upcoming recurring series trips cancelled.');
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to cancel recurring series.');
    }
  };

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">Schedule Trips</h1>
          <div className="operator-page-subtitle">
            Create one-time departures, build recurring schedules, preview the generated trips, and use cloning or
            safe cancellation tools instead of repeating the same manual work every day.
          </div>
        </div>
        <div className="operator-action-row">
          <button className="operator-secondary-btn" onClick={() => setTimeFilter('UPCOMING')}>Upcoming Focus</button>
          <button className="operator-primary-btn" onClick={openCreate}>Create Schedule</button>
        </div>
      </div>

      <div className="operator-kpi-grid">
        <div className="operator-kpi-card"><div className="operator-kpi-label">Upcoming Trips</div><div className="operator-kpi-value">{upcomingTrips}</div><div className="operator-kpi-meta">Trips still needing dispatch attention</div></div>
        <div className="operator-kpi-card"><div className="operator-kpi-label">Recurring Series</div><div className="operator-kpi-value">{recurringSeries}</div><div className="operator-kpi-meta">Reusable patterns already scheduled</div></div>
        <div className="operator-kpi-card"><div className="operator-kpi-label">Draft Trips</div><div className="operator-kpi-value">{draftTrips}</div><div className="operator-kpi-meta">Services still not finalized</div></div>
        <div className="operator-kpi-card"><div className="operator-kpi-label">Cancelled Trips</div><div className="operator-kpi-value">{cancelledTrips}</div><div className="operator-kpi-meta">Operational exceptions tracked here</div></div>
      </div>

      <div className="operator-grid-two">
        <div className="operator-panel-card">
          <div className="operator-section-heading">Smart Scheduling Workflow</div>
          <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
            Choose bus, choose route, select a repeat pattern, preview departures, then save in bulk. Operators no longer
            need to create the same trip manually for every day of the week.
          </div>
          <div className="operator-checklist" style={{ marginTop: '18px' }}>
            <div className="operator-checklist-item"><span className="operator-checklist-dot done"></span><span>One-time trips for special services</span></div>
            <div className="operator-checklist-item"><span className="operator-checklist-dot done"></span><span>Recurring trips for fixed weekly operations</span></div>
            <div className="operator-checklist-item"><span className="operator-checklist-dot done"></span><span>Clone next week in one click</span></div>
            <div className="operator-checklist-item"><span className="operator-checklist-dot done"></span><span>Cancel future series trips safely</span></div>
          </div>
        </div>

        <div className="operator-panel-card">
          <div className="operator-section-heading">Readiness Check</div>
          <div className="operator-record-stats" style={{ marginTop: '18px' }}>
            <div className="operator-stat-box"><div className="operator-stat-box-label">Active Buses</div><div className="operator-stat-box-value">{activeBuses.length}</div></div>
            <div className="operator-stat-box"><div className="operator-stat-box-label">Active Routes</div><div className="operator-stat-box-value">{activeRoutes.length}</div></div>
            <div className="operator-stat-box"><div className="operator-stat-box-label">Ready to Schedule</div><div className="operator-stat-box-value">{activeBuses.length && activeRoutes.length ? 'Yes' : 'Not yet'}</div></div>
          </div>
        </div>
      </div>

      <div className="operator-panel-card">
        <div className="operator-toolbar">
          <div className="operator-toolbar-group">
            <input className="form-input operator-search" placeholder="Search route, bus, registration, series code" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="DELAYED">Delayed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="DRAFT">Draft</option>
            </select>
            <select className="form-input" value={scheduleFilter} onChange={(event) => setScheduleFilter(event.target.value)}>
              <option value="ALL">All schedules</option>
              <option value="ONE_TIME">One-time only</option>
              <option value="RECURRING">Recurring only</option>
            </select>
            <select className="form-input" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}>
              <option value="UPCOMING">Upcoming only</option>
              <option value="PAST">Past only</option>
              <option value="ALL">All dates</option>
            </select>
          </div>
          <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
            Deleting a booked trip safely cancels it, and recurring series can be stopped for future trips only.
          </div>
        </div>
      </div>

      {error && <div className="operator-alert error">{error}</div>}
      {success && <div className="operator-alert success">{success}</div>}

      {loading ? (
        <div className="operator-empty-card">Loading trip scheduler...</div>
      ) : filteredTrips.length === 0 ? (
        <div className="operator-empty-card">
          <div className="operator-empty-title">{trips.length === 0 ? 'Create your first trip schedule' : 'No trips match your filters'}</div>
          <div className="operator-empty-copy">Use one-time scheduling for special departures or recurring schedules for buses that run the same service pattern every week.</div>
          {trips.length === 0 && <button className="operator-primary-btn" onClick={openCreate}>Start Scheduling</button>}
        </div>
      ) : (
        <div className="operator-list">
          {filteredTrips.map((trip) => (
            <div className="operator-record" key={trip.id}>
              <div className="operator-record-main">
                <div>
                  <div className="operator-record-title">{trip.route_name} {trip.route_code ? `(${trip.route_code})` : ''}</div>
                  <div className="operator-record-subtitle">{trip.bus_name} ({trip.bus_reg_number}) • Departure {formatDateTime(trip.departure_time)}</div>
                </div>
                <div className="operator-chip-row">
                  <span className={`operator-chip ${tone(trip.status)}`}>{trip.status}</span>
                  {trip.recurrence_label && <span className="operator-chip info">{trip.recurrence_label}</span>}
                  {trip.series_code && <span className="operator-chip route">{trip.series_code}</span>}
                  {trip.bus_status_tag && <span className="operator-chip">{trip.bus_status_tag}</span>}
                </div>
                <div className="operator-record-stats">
                  <div className="operator-stat-box"><div className="operator-stat-box-label">Arrival</div><div className="operator-stat-box-value">{formatDateTime(trip.arrival_time)}</div></div>
                  <div className="operator-stat-box"><div className="operator-stat-box-label">Stops Covered</div><div className="operator-stat-box-value">{trip.total_stops}</div></div>
                  <div className="operator-stat-box"><div className="operator-stat-box-label">Schedule Type</div><div className="operator-stat-box-value">{trip.series_code ? 'Recurring' : 'One-time'}</div></div>
                </div>
              </div>
              <div className="operator-record-actions">
                <button className="operator-primary-btn" onClick={() => openOperations(trip)}>Live Ops</button>
                <button className="operator-secondary-btn" onClick={() => openEdit(trip)}>Edit Trip</button>
                <button className="operator-secondary-btn" onClick={() => handleClone(trip.id, 1)}>Duplicate +1 Day</button>
                <button className="operator-secondary-btn" onClick={() => handleClone(trip.id, 7)}>Clone Next Week</button>
                {trip.series_code ? (
                  <button className="operator-secondary-btn" onClick={() => handleSeriesCancel(trip.series_code)}>Cancel Series</button>
                ) : (
                  <button className="operator-secondary-btn" onClick={() => handleStatus(trip.id, trip.status === 'CANCELLED' ? 'SCHEDULED' : 'CANCELLED')}>
                    {trip.status === 'CANCELLED' ? 'Restore to Scheduled' : 'Cancel Trip'}
                  </button>
                )}
                <button className="operator-ghost-btn" onClick={() => handleDelete(trip)}>Delete / Safe Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {opsTrip && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '980px' }}>
            <div className="modal-header">
              <div className="modal-title">Live Trip Operations</div>
              <button className="modal-close" onClick={() => { setOpsTrip(null); setOpsSummary(null); }}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '18px' }}>
              {opsLoading || !opsSummary ? (
                <div className="operator-inline-note">Loading trip operations...</div>
              ) : (
                <>
                  <div className="operator-panel-shell">
                    <div className="operator-section-heading">{opsSummary.trip.route_name} {opsSummary.trip.route_code ? `(${opsSummary.trip.route_code})` : ''}</div>
                    <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
                      {opsSummary.trip.bus_name} ({opsSummary.trip.bus_reg_number}) • Departure {formatDateTime(opsSummary.trip.departure_time)}
                    </div>
                    <div className="operator-chip-row">
                      <span className={`operator-chip ${tone(opsSummary.trip.status)}`}>{opsSummary.trip.status}</span>
                      {opsSummary.trip.delay_mins > 0 && <span className="operator-chip warning">{opsSummary.trip.delay_mins} min delay</span>}
                      {opsSummary.trip.actual_start_time && <span className="operator-chip info">Started {formatDateTime(opsSummary.trip.actual_start_time)}</span>}
                    </div>
                  </div>

                  <div className="operator-kpi-grid">
                    <div className="operator-kpi-card"><div className="operator-kpi-label">Booked Passengers</div><div className="operator-kpi-value">{opsSummary.booked_passengers}</div><div className="operator-kpi-meta">{opsSummary.booked_seats} seats sold</div></div>
                    <div className="operator-kpi-card"><div className="operator-kpi-label">Available Seats</div><div className="operator-kpi-value">{opsSummary.available_seats}</div><div className="operator-kpi-meta">{opsSummary.occupancy_percent}% occupancy</div></div>
                    <div className="operator-kpi-card"><div className="operator-kpi-label">Boarding Pending</div><div className="operator-kpi-value">{opsSummary.boarding_pending}</div><div className="operator-kpi-meta">{opsSummary.no_show_count} marked no-show</div></div>
                    <div className="operator-kpi-card"><div className="operator-kpi-label">Collections</div><div className="operator-kpi-value">Rs. {Math.round(opsSummary.collected_amount)}</div><div className="operator-kpi-meta">Refunded Rs. {Math.round(opsSummary.refunded_amount)}</div></div>
                  </div>

                  <div className="operator-grid-two operator-grid-balanced">
                    <div className="operator-panel-shell">
                      <div className="operator-section-heading">Trip Control</div>
                      <div className="operator-action-row">
                        <button className="operator-primary-btn" onClick={() => applyOpsStatus('RUNNING')}>Start Trip</button>
                        <button className="operator-secondary-btn" onClick={() => applyOpsStatus('COMPLETED')}>Complete Trip</button>
                        <button className="operator-secondary-btn" onClick={() => applyOpsStatus('SCHEDULED', { delay_mins: 0, ops_notes: '' })}>Clear Delay</button>
                      </div>
                      <div className="operator-form-grid">
                        <div>
                          <label className="operator-field-label">Delay Minutes</label>
                          <input className="form-input" type="number" min="0" value={delayForm.delay_mins} onChange={(event) => setDelayForm({ ...delayForm, delay_mins: event.target.value })} />
                        </div>
                        <div>
                          <label className="operator-field-label">Ops Note</label>
                          <input className="form-input" value={delayForm.ops_notes} onChange={(event) => setDelayForm({ ...delayForm, ops_notes: event.target.value })} placeholder="Traffic, crew delay, replacement bus..." />
                        </div>
                      </div>
                      <button className="operator-secondary-btn" onClick={() => applyOpsStatus('DELAYED', { delay_mins: Number(delayForm.delay_mins) || 0, ops_notes: delayForm.ops_notes })}>
                        Mark Delayed
                      </button>
                    </div>

                    <div className="operator-panel-shell">
                      <div className="operator-section-heading">Operational Timeline</div>
                      <div className="operator-preview-list">
                        <div className="operator-preview-row"><span>Planned Departure</span><span>{formatDateTime(opsSummary.trip.departure_time)}</span></div>
                        <div className="operator-preview-row"><span>Expected Arrival</span><span>{formatDateTime(opsSummary.trip.arrival_time)}</span></div>
                        <div className="operator-preview-row"><span>Actual Start</span><span>{formatDateTime(opsSummary.trip.actual_start_time)}</span></div>
                        <div className="operator-preview-row"><span>Actual End</span><span>{formatDateTime(opsSummary.trip.actual_end_time)}</span></div>
                        <div className="operator-preview-row"><span>Current Notes</span><span>{opsSummary.trip.ops_notes || 'No live ops note yet'}</span></div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1080px' }}>
            <div className="modal-header">
              <div className="modal-title">{editingTrip ? 'Edit Scheduled Trip' : 'Create Smart Schedule'}</div>
              <button className="modal-close" onClick={resetModal}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '18px' }}>
              <div className="operator-stepper">
                <div className="operator-step active">1. Select bus</div>
                <div className="operator-step active">2. Select route</div>
                <div className="operator-step active">{editingTrip ? '3. Update trip' : '3. Choose repeat rule'}</div>
                <div className="operator-step active">4. Preview</div>
              </div>

              <div className="operator-grid-two operator-grid-balanced">
                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Trip Setup</div>
                  <div className="operator-form-grid">
                    <div>
                      <label className="operator-field-label">Bus</label>
                      <select className="form-input" value={form.bus_id} onChange={(event) => setField('bus_id', event.target.value)}>
                        <option value="">Select available bus</option>
                        {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name} ({bus.reg_number}) {bus.status_tag !== 'ACTIVE' ? `- ${bus.status_tag}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="operator-field-label">Route</label>
                      <select className="form-input" value={form.route_id} onChange={(event) => setField('route_id', event.target.value)}>
                        <option value="">Select route template</option>
                        {routes.map((route) => <option key={route.id} value={route.id}>{route.name} {route.route_code ? `(${route.route_code})` : ''} {!route.is_active ? '- ARCHIVED' : ''}</option>)}
                      </select>
                    </div>
                    {!editingTrip && (
                      <div>
                        <label className="operator-field-label">Schedule Type</label>
                        <select className="form-input" value={form.schedule_type} onChange={(event) => setField('schedule_type', event.target.value)}>
                          <option value="ONE_TIME">One-time trip</option>
                          <option value="DAILY">Daily recurring</option>
                          <option value="SELECTED_WEEKDAYS">Selected weekdays</option>
                          <option value="EVERY_X_DAYS">Every X days</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="operator-field-label">Trip Status</label>
                      <select className="form-input" value={form.status} onChange={(event) => setField('status', event.target.value)}>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="DRAFT">Draft</option>
                        <option value="DELAYED">Delayed</option>
                        {editingTrip && <>
                          <option value="RUNNING">Running</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </>}
                      </select>
                    </div>
                  </div>

                  {(editingTrip || form.schedule_type === 'ONE_TIME') ? (
                    <div className="operator-form-grid">
                      <div>
                        <label className="operator-field-label">Departure Date & Time</label>
                        <input className="form-input" type="datetime-local" value={form.departure_time} onChange={(event) => setField('departure_time', event.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <div className="operator-form-grid">
                      <div>
                        <label className="operator-field-label">Start Date</label>
                        <input className="form-input" type="date" value={form.start_date} onChange={(event) => setField('start_date', event.target.value)} />
                      </div>
                      <div>
                        <label className="operator-field-label">End Date</label>
                        <input className="form-input" type="date" value={form.end_date} onChange={(event) => setField('end_date', event.target.value)} />
                      </div>
                      <div>
                        <label className="operator-field-label">Departure Clock</label>
                        <input className="form-input" type="time" value={form.departure_clock} onChange={(event) => setField('departure_clock', event.target.value)} />
                      </div>
                      {form.schedule_type === 'EVERY_X_DAYS' && (
                        <div>
                          <label className="operator-field-label">Repeat Every</label>
                          <input className="form-input" type="number" min="1" value={form.every_x_days} onChange={(event) => setField('every_x_days', event.target.value)} />
                        </div>
                      )}
                    </div>
                  )}

                  {!editingTrip && form.schedule_type === 'SELECTED_WEEKDAYS' && (
                    <div>
                      <label className="operator-field-label">Choose Weekdays</label>
                      <div className="operator-chip-toggle-row">
                        {WEEKDAYS.map((weekday) => (
                          <button key={weekday.value} type="button" className={`operator-chip-toggle ${form.weekdays.includes(weekday.value) ? 'active' : ''}`} onClick={() => toggleWeekday(weekday.value)}>
                            {weekday.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {smartNotice && <div className="operator-inline-note">{smartNotice}</div>}

                  <div className="operator-mini-summary">
                    <div className="operator-mini-summary-item"><span>Selected bus</span><strong>{selectedBus ? `${selectedBus.name} (${selectedBus.reg_number})` : 'Not selected'}</strong></div>
                    <div className="operator-mini-summary-item"><span>Selected route</span><strong>{selectedRoute ? selectedRoute.name : 'Not selected'}</strong></div>
                    <div className="operator-mini-summary-item"><span>Generated departures</span><strong>{previewDates.length || 0}</strong></div>
                  </div>
                </div>

                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Route Preview & Generated Trips</div>
                  {selectedRoute ? (
                    <>
                      <div className="operator-preview-list">
                        {routeTimeline.map((stop) => (
                          <div key={`${stop.route_id}-${stop.stop_sequence}`} className="operator-preview-row">
                            <span>{stop.stop_sequence}. {stop.city_name}{stop.allows_boarding ? ' • Boarding' : ''}{stop.allows_dropping ? ' • Dropping' : ''}</span>
                            <span>+{stop.time_offset_mins} mins</span>
                          </div>
                        ))}
                      </div>
                      <div className="operator-section-heading" style={{ marginTop: '18px' }}>Departure Preview</div>
                      {previewDates.length ? (
                        <div className="operator-preview-list">
                          {previewDates.slice(0, 8).map((value) => (
                            <div className="operator-preview-row" key={value}>
                              <span>{formatDateTime(value)}</span>
                              <span>{selectedRoute.estimated_duration_mins ? `${selectedRoute.estimated_duration_mins} mins route` : `${selectedRoute.stop_count} stops`}</span>
                            </div>
                          ))}
                          {previewDates.length > 8 && <div className="operator-inline-note">+{previewDates.length - 8} more departures will also be created.</div>}
                        </div>
                      ) : (
                        <div className="operator-inline-note">Choose a schedule pattern to preview generated trips before saving.</div>
                      )}
                    </>
                  ) : (
                    <div className="operator-inline-note">Choose a route to preview stop order, timings, and generated departures.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="operator-secondary-btn" type="button" onClick={resetModal}>Cancel</button>
              <button className="operator-primary-btn" type="button" disabled={saving || !form.bus_id || !form.route_id || !previewDates.length || Boolean(smartNotice)} onClick={submitSchedule}>
                {saving ? 'Saving...' : editingTrip ? 'Save Trip Changes' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
