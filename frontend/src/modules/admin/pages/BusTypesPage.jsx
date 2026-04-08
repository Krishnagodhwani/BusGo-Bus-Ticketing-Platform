import { useEffect, useState } from 'react';
import { createBusType, getBusTypes } from '../services/adminService';

const initialForm = {
  name: '',
  layout: '2+2',
  has_ac: true,
  has_sleeper: false,
  is_active: true,
};

export default function BusTypesPage() {
  const [busTypes, setBusTypes] = useState([]);
  const [formData, setFormData] = useState(initialForm);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await getBusTypes();
      setBusTypes(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load bus types.');
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
      await createBusType(formData);
      setFormData(initialForm);
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create bus type.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">Master management</div>
          <h1 className="admin-page-title">Bus types master</h1>
          <p className="admin-page-copy">Define the approved fleet catalogue operators can use while creating buses and trips.</p>
        </div>
        <button className="admin-btn-primary" onClick={() => setShowModal(true)}>Add bus type</button>
      </section>

      <section className="admin-surface-card">
        <div className="admin-table-wrap">
          <table className="admin-table refined">
            <thead>
              <tr>
                <th>Bus Type</th>
                <th>Layout</th>
                <th>AC</th>
                <th>Sleeper</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="admin-table-empty">Loading bus types...</td></tr>
              ) : busTypes.length === 0 ? (
                <tr><td colSpan="5" className="admin-table-empty">{error || 'No bus types configured.'}</td></tr>
              ) : busTypes.map((item) => (
                <tr key={item.id}>
                  <td className="admin-table-primary">{item.name}</td>
                  <td>{item.layout}</td>
                  <td>{item.has_ac ? 'Yes' : 'No'}</td>
                  <td>{item.has_sleeper ? 'Yes' : 'No'}</td>
                  <td><span className={`admin-status-pill ${item.is_active ? 'confirmed' : 'cancelled'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
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
                <div className="modal-title">Add bus type</div>
                <div className="modal-subtitle">Create a new fleet template for operator use.</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>x</button>
            </div>
            <form onSubmit={submit}>
              <div className="modal-body form-grid">
                {error && <div className="admin-inline-error">{error}</div>}
                <label className="admin-field full">
                  <span>Name</span>
                  <input className="form-input" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
                </label>
                <label className="admin-field full">
                  <span>Layout</span>
                  <select className="form-input" value={formData.layout} onChange={(event) => setFormData({ ...formData, layout: event.target.value })}>
                    <option value="2+2">2+2</option>
                    <option value="2+1">2+1</option>
                    <option value="1+1">1+1</option>
                    <option value="3+2">3+2</option>
                  </select>
                </label>
                <label className="admin-field toggle">
                  <span>AC enabled</span>
                  <input type="checkbox" checked={formData.has_ac} onChange={(event) => setFormData({ ...formData, has_ac: event.target.checked })} />
                </label>
                <label className="admin-field toggle">
                  <span>Sleeper coach</span>
                  <input type="checkbox" checked={formData.has_sleeper} onChange={(event) => setFormData({ ...formData, has_sleeper: event.target.checked })} />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="admin-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save bus type'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
