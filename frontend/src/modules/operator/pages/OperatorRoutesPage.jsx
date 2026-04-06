import { useEffect, useMemo, useState } from 'react';
import {
  cloneRoute,
  createRoute,
  deleteRoute,
  getAdminCities,
  getMyRoutes,
  updateRoute,
} from '../services/operatorService';
import './OperatorWorkspace.css';

const createStop = (sequence, offset = 0) => ({
  id: Date.now() + Math.random(),
  city_id: '',
  stop_sequence: sequence,
  time_offset_mins: offset,
  allows_boarding: true,
  allows_dropping: true,
});

const blankRouteForm = () => ({
  name: '',
  route_code: '',
  estimated_distance_km: '',
  estimated_duration_mins: '',
  is_active: true,
  stops: [createStop(1, 0), createStop(2, 180)],
  pricing: [],
});

export default function OperatorRoutesPage() {
  const [routes, setRoutes] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState(blankRouteForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [routeRes, cityRes] = await Promise.all([getMyRoutes(), getAdminCities()]);
      setRoutes(routeRes.data);
      setCities(cityRes.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load route network.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) => {
      const query = search.trim().toLowerCase();
      const routeLine = (route.stops || []).map((stop) => stop.city_name).join(' ');
      const matchesSearch =
        !query ||
        [route.name, route.route_code, routeLine]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? route.is_active : !route.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [routes, search, statusFilter]);

  const getCityName = (cityId) => cities.find((city) => city.id === Number(cityId))?.name || 'Select city';

  const resetBuilder = () => {
    setForm(blankRouteForm());
    setEditingRoute(null);
    setStep(1);
    setError('');
  };

  const openCreate = () => {
    resetBuilder();
    setShowModal(true);
  };

  const openEdit = (route) => {
    setEditingRoute(route);
    setForm({
      name: route.name,
      route_code: route.route_code || '',
      estimated_distance_km: route.estimated_distance_km || '',
      estimated_duration_mins: route.estimated_duration_mins || '',
      is_active: route.is_active,
      stops: (route.stops || []).map((stop) => ({ ...stop, id: stop.id || Date.now() + Math.random() })),
      pricing: (route.pricing || []).map((price) => ({ ...price })),
    });
    setStep(1);
    setError('');
    setShowModal(true);
  };

  const updateStop = (id, field, value) => {
    setForm((current) => ({
      ...current,
      stops: current.stops.map((stop) => (stop.id === id ? { ...stop, [field]: value } : stop)),
    }));
  };

  const resequenceStops = (stops) => stops.map((stop, index) => ({ ...stop, stop_sequence: index + 1 }));

  const addStop = () => {
    setForm((current) => ({
      ...current,
      stops: [
        ...current.stops,
        createStop(current.stops.length + 1, Number(current.stops[current.stops.length - 1]?.time_offset_mins || 0) + 60),
      ],
    }));
  };

  const moveStop = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.stops.length) return;
    const cloned = [...form.stops];
    [cloned[index], cloned[nextIndex]] = [cloned[nextIndex], cloned[index]];
    setForm((current) => ({ ...current, stops: resequenceStops(cloned) }));
  };

  const removeStop = (id) => {
    if (form.stops.length <= 2) return;
    setForm((current) => ({ ...current, stops: resequenceStops(current.stops.filter((stop) => stop.id !== id)) }));
  };

  const generatePricing = () => {
    const selectedCityIds = form.stops.map((stop) => Number(stop.city_id));
    if (selectedCityIds.some((id) => !id)) {
      setError('Select a city for each stop before generating route pricing.');
      return;
    }
    if (new Set(selectedCityIds).size !== selectedCityIds.length) {
      setError('Duplicate stops are not allowed in one route.');
      return;
    }

    const prices = [];
    for (let i = 0; i < form.stops.length; i += 1) {
      for (let j = i + 1; j < form.stops.length; j += 1) {
        const origin = Number(form.stops[i].city_id);
        const destination = Number(form.stops[j].city_id);
        const existing = form.pricing.find(
          (price) => price.origin_city_id === origin && price.destination_city_id === destination
        );
        prices.push({
          origin_city_id: origin,
          destination_city_id: destination,
          price: existing?.price ?? '',
        });
      }
    }

    setForm((current) => ({ ...current, pricing: prices }));
    setError('');
    setStep(2);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name || `${getCityName(form.stops[0].city_id)} to ${getCityName(form.stops[form.stops.length - 1].city_id)}`,
        route_code: form.route_code || null,
        estimated_distance_km: form.estimated_distance_km ? Number(form.estimated_distance_km) : null,
        estimated_duration_mins: form.estimated_duration_mins ? Number(form.estimated_duration_mins) : null,
        is_active: form.is_active,
        stops: form.stops.map((stop, index) => ({
          city_id: Number(stop.city_id),
          stop_sequence: index + 1,
          time_offset_mins: Number(stop.time_offset_mins),
          allows_boarding: stop.allows_boarding,
          allows_dropping: stop.allows_dropping,
        })),
        pricing: form.pricing.map((price) => ({
          origin_city_id: Number(price.origin_city_id),
          destination_city_id: Number(price.destination_city_id),
          price: Number(price.price),
        })),
      };

      if (editingRoute) {
        await updateRoute(editingRoute.id, payload);
      } else {
        await createRoute(payload);
      }

      setShowModal(false);
      resetBuilder();
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save route.');
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async (routeId) => {
    try {
      await cloneRoute(routeId);
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to clone route.');
    }
  };

  const handleDelete = async (route) => {
    if (!window.confirm(`Delete or archive route "${route.name}"? If trips already exist, it will be archived safely.`)) return;
    try {
      await deleteRoute(route.id, true);
      loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to delete or archive route.');
    }
  };

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">Route Network</h1>
          <div className="operator-page-subtitle">
            This route builder is redesigned around operator clarity: define source to destination, add intermediate stops,
            preview the line visually, then save reusable route templates that can be cloned or archived safely.
          </div>
        </div>
        <div className="operator-action-row">
          <button className="operator-primary-btn" onClick={openCreate}>Create New Route</button>
        </div>
      </div>

      <div className="operator-panel-card">
        <div className="operator-toolbar">
          <div className="operator-toolbar-group">
            <input className="form-input operator-search" placeholder="Search route name, route code, or city" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All routes</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Archived only</option>
            </select>
          </div>
          <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
            Safer editing: if a route is already used in future trips, structural edits are blocked and clone is recommended instead.
          </div>
        </div>
      </div>

      {error && <div className="operator-panel-card" style={{ color: 'var(--red-400)' }}>{error}</div>}

      {loading ? (
        <div className="operator-empty-card">Loading route network...</div>
      ) : filteredRoutes.length === 0 ? (
        <div className="operator-empty-card">
          <div className="operator-empty-title">{routes.length === 0 ? 'Build your first route' : 'No routes match your filters'}</div>
          <div className="operator-empty-copy">
            Operators usually create routes once and reuse them many times in scheduling. Start with your busiest corridor first.
          </div>
          {routes.length === 0 && <button className="operator-primary-btn" onClick={openCreate}>Create Route</button>}
        </div>
      ) : (
        <div className="operator-list">
          {filteredRoutes.map((route) => (
            <div className="operator-record" key={route.id}>
              <div className="operator-record-main">
                <div>
                  <div className="operator-record-title">
                    {route.name} {route.route_code ? `(${route.route_code})` : ''}
                  </div>
                  <div className="operator-record-subtitle">
                    {(route.stops || []).map((stop) => stop.city_name).join(' -> ')}
                  </div>
                </div>

                <div className="operator-chip-row">
                  <span className={`operator-chip ${route.is_active ? 'active' : 'danger'}`}>{route.is_active ? 'ACTIVE' : 'ARCHIVED'}</span>
                  <span className="operator-chip route">{route.stop_count} stops</span>
                  <span className="operator-chip info">{route.trip_count} total trips</span>
                  <span className="operator-chip">{route.upcoming_trip_count} upcoming</span>
                </div>

                <div className="operator-record-stats">
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Estimated Distance</div>
                    <div className="operator-stat-box-value">{route.estimated_distance_km ? `${route.estimated_distance_km} km` : 'Not set'}</div>
                  </div>
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Estimated Duration</div>
                    <div className="operator-stat-box-value">{route.estimated_duration_mins ? `${Math.round(route.estimated_duration_mins / 60)}h ${route.estimated_duration_mins % 60}m` : 'Auto from stops'}</div>
                  </div>
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Latest Save</div>
                    <div className="operator-stat-box-value">{new Date(route.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>

              <div className="operator-record-actions">
                <button className="operator-secondary-btn" onClick={() => openEdit(route)}>Edit</button>
                <button className="operator-secondary-btn" onClick={() => handleClone(route.id)}>Clone</button>
                <button className="operator-secondary-btn" onClick={() => updateRoute(route.id, { is_active: !route.is_active }).then(loadData).catch((requestError) => setError(requestError.response?.data?.detail || 'Failed to update route status.'))}>
                  {route.is_active ? 'Archive' : 'Activate'}
                </button>
                <button className="operator-ghost-btn" onClick={() => handleDelete(route)}>Delete / Archive</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '980px' }}>
            <div className="modal-header">
              <div className="modal-title">{editingRoute ? 'Edit Route Template' : 'Create Route Template'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '18px' }}>
              <div className="operator-stepper">
                <div className={`operator-step ${step === 1 ? 'active' : ''}`}>1. Stops</div>
                <div className={`operator-step ${step === 2 ? 'active' : ''}`}>2. Pricing</div>
              </div>

              <div className="operator-grid-two">
                <div>
                  <label className="operator-record-subtitle">Route Name</label>
                  <input className="form-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Jaipur to Jodhpur via Ajmer" />
                </div>
                <div>
                  <label className="operator-record-subtitle">Route Code</label>
                  <input className="form-input" value={form.route_code} onChange={(event) => setForm({ ...form, route_code: event.target.value })} placeholder="Optional internal route code" />
                </div>
              </div>

              <div className="operator-grid-two">
                <div>
                  <label className="operator-record-subtitle">Estimated Distance (km)</label>
                  <input className="form-input" type="number" value={form.estimated_distance_km} onChange={(event) => setForm({ ...form, estimated_distance_km: event.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <label className="operator-record-subtitle">Estimated Duration (minutes)</label>
                  <input className="form-input" type="number" value={form.estimated_duration_mins} onChange={(event) => setForm({ ...form, estimated_duration_mins: event.target.value })} placeholder="Optional" />
                </div>
              </div>

              {step === 1 && (
                <div className="operator-list">
                  {form.stops.map((stop, index) => (
                    <div className="operator-stop-row" key={stop.id}>
                      <div className="operator-stop-index">{index + 1}</div>
                      <select className="form-input" value={stop.city_id} onChange={(event) => updateStop(stop.id, 'city_id', event.target.value)}>
                        <option value="" disabled>Select city</option>
                        {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                      </select>
                      <input className="form-input" type="number" min="0" step="15" value={stop.time_offset_mins} onChange={(event) => updateStop(stop.id, 'time_offset_mins', event.target.value)} placeholder="Minutes from start" />
                      <div className="operator-toolbar-group">
                        <label className="operator-record-subtitle"><input type="checkbox" checked={stop.allows_boarding} onChange={(event) => updateStop(stop.id, 'allows_boarding', event.target.checked)} /> Boarding</label>
                        <label className="operator-record-subtitle"><input type="checkbox" checked={stop.allows_dropping} onChange={(event) => updateStop(stop.id, 'allows_dropping', event.target.checked)} /> Dropping</label>
                      </div>
                      <div className="operator-stop-actions">
                        <button className="operator-secondary-btn" type="button" onClick={() => moveStop(index, -1)}>Up</button>
                        <button className="operator-secondary-btn" type="button" onClick={() => moveStop(index, 1)}>Down</button>
                        <button className="operator-ghost-btn" type="button" onClick={() => removeStop(stop.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <button className="operator-secondary-btn" type="button" onClick={addStop}>Add Intermediate Stop</button>
                </div>
              )}

              {step === 2 && (
                <div className="operator-list">
                  {(form.pricing || []).map((price, index) => (
                    <div className="operator-preview-row" key={`${price.origin_city_id}-${price.destination_city_id}`}>
                      <span>{getCityName(price.origin_city_id)} {'->'} {getCityName(price.destination_city_id)}</span>
                      <input
                        className="form-input"
                        style={{ maxWidth: '160px' }}
                        type="number"
                        min="1"
                        value={price.price}
                        onChange={(event) => {
                          const pricing = [...form.pricing];
                          pricing[index] = { ...pricing[index], price: event.target.value };
                          setForm({ ...form, pricing });
                        }}
                        placeholder="Fare"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {step === 1 ? (
                <>
                  <button className="operator-secondary-btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="operator-primary-btn" type="button" onClick={generatePricing}>Continue to Pricing</button>
                </>
              ) : (
                <>
                  <button className="operator-secondary-btn" type="button" onClick={() => setStep(1)}>Back to Stops</button>
                  <button className="operator-primary-btn" type="button" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : editingRoute ? 'Save Route Changes' : 'Save Route'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
