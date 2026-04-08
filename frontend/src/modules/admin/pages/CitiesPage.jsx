import { useEffect, useState } from 'react';
import { createCity, getCities } from '../services/adminService';

export default function CitiesPage() {
  const [cities, setCities] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', state: 'Rajasthan', is_active: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await getCities();
      setCities(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load cities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createCity(formData);
      setShowModal(false);
      setFormData({ name: '', state: 'Rajasthan', is_active: true });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create city.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">Master management</div>
          <h1 className="admin-page-title">Cities master</h1>
          <p className="admin-page-copy">Control the approved city list used across route planning, boarding, and dropping flows.</p>
        </div>
        <button className="admin-btn-primary" onClick={() => setShowModal(true)}>Add city</button>
      </section>

      <section className="admin-surface-card">
        <div className="admin-table-wrap">
          <table className="admin-table refined">
            <thead>
              <tr>
                <th>City</th>
                <th>State</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="admin-table-empty">Loading cities...</td></tr>
              ) : cities.length === 0 ? (
                <tr><td colSpan="4" className="admin-table-empty">{error || 'No cities defined yet.'}</td></tr>
              ) : cities.map((city) => (
                <tr key={city.id}>
                  <td className="admin-table-primary">{city.name}</td>
                  <td>{city.state || '-'}</td>
                  <td><span className={`admin-status-pill ${city.is_active ? 'confirmed' : 'cancelled'}`}>{city.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>{city.created_at ? new Date(city.created_at).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <div className="modal-title">Add city master</div>
                <div className="modal-subtitle">Add a city that operators can use in routes and trip planning.</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>x</button>
            </div>
            <form onSubmit={submit}>
              <div className="modal-body form-grid">
                {error && <div className="admin-inline-error">{error}</div>}
                <label className="admin-field full">
                  <span>City name</span>
                  <input className="form-input" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
                </label>
                <label className="admin-field full">
                  <span>State</span>
                  <input className="form-input" value={formData.state} onChange={(event) => setFormData({ ...formData, state: event.target.value })} required />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="admin-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save city'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
