import { useState, useEffect } from 'react';
import { getCities, createCity } from '../services/adminService';

export default function CitiesPage() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', state: 'Rajasthan', is_active: true });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCities();
  }, []);

  const fetchCities = async () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createCity(formData);
      setShowModal(false);
      setFormData({ name: '', state: 'Rajasthan', is_active: true }); // reset but keep state rules
      fetchCities();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create city');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
        Master Cities
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "32px" }}>
        Define valid boarding and dropping locations for bus routes.
        <br />
        <span style={{ color: "var(--teal-400)", fontWeight: 600 }}>Currently operating strictly in Rajasthan state.</span>
      </p>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Network Locations</div>
          <button className="admin-btn-primary" onClick={() => setShowModal(true)}>
            <span>+</span> Add City
          </button>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>City Name</th>
                <th>State / Region</th>
                <th>Status</th>
                <th>Added On</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" style={{ textAlign: "center", padding: "32px" }}>Loading data...</td></tr>
              ) : cities.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: "center", padding: "32px" }}>No cities defined yet.</td></tr>
              ) : (
                cities.map(city => (
                  <tr key={city.id}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{city.name}</td>
                    <td style={{ color: "var(--teal-300)" }}>{city.state}</td>
                    <td>
                      <span className={`badge ${city.is_active ? 'badge-active' : ''}`}>
                        {city.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{new Date().toLocaleDateString()}</td> {/* Note: If backend doesn't return created_at, mock it to today for UI */}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">Define New City</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div style={{ color: "var(--red-400)", marginBottom: "16px", fontSize: "14px" }}>{error}</div>}
                
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Target State*</label>
                  <input 
                    type="text" 
                    disabled
                    className="form-input" 
                    value={formData.state} 
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                  />
                  <p style={{ fontSize: "11px", color: "var(--amber-400)", marginTop: "6px" }}>
                    Operations are locked to Rajasthan per Go-To-Market strategy.
                  </p>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>City Name*</label>
                  <input 
                    type="text" 
                    required 
                    autoFocus
                    className="form-input" 
                    placeholder="e.g. Jaipur"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="admin-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Add City Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
