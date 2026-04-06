import { useState, useEffect } from 'react';
import { getBusTypes, createBusType } from '../services/adminService';

export default function BusTypesPage() {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // default bus state
  const [formData, setFormData] = useState({ 
    name: '', 
    layout: '2+2', 
    has_ac: true, 
    has_sleeper: false, 
    is_active: true 
  });
  
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBuses();
  }, []);

  const fetchBuses = async () => {
    try {
      setLoading(true);
      const res = await getBusTypes();
      setBuses(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load bus types.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createBusType(formData);
      setShowModal(false);
      
      // Reset defaults
      setFormData({ name: '', layout: '2+2', has_ac: true, has_sleeper: false, is_active: true });
      fetchBuses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create bus type');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
        Master Bus Fleets
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "32px" }}>
        Configure the official list of fleet configurations operators can select from.
      </p>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Available Bus Layouts</div>
          <button className="admin-btn-primary" onClick={() => setShowModal(true)}>
            <span>+</span> Define Fleet
          </button>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Classification Name</th>
                <th>Seat Layout</th>
                <th>Amenities</th>
                <th>Sleeper?</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" style={{ textAlign: "center", padding: "32px" }}>Loading data...</td></tr>
              ) : buses.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: "center", padding: "32px" }}>No fleet types configured.</td></tr>
              ) : (
                buses.map(bus => (
                  <tr key={bus.id}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{bus.name}</td>
                    <td>
                      <span style={{ 
                        background: "rgba(255,255,255,0.05)", 
                        padding: "2px 8px", 
                        borderRadius: "4px", 
                        fontFamily: "monospace" 
                      }}>
                        {bus.layout}
                      </span>
                    </td>
                    <td>
                      {bus.has_ac ? (
                        <span style={{ color: "var(--blue-400)", fontWeight: 500 }}>❄️ A/C Air-Conditioned</span>
                      ) : (
                        <span style={{ color: "var(--amber-400)" }}>💨 Non A/C</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${bus.has_sleeper ? 'badge-active' : ''}`}>
                        {bus.has_sleeper ? '🛏️ Sleeper' : '💺 Seater'}
                      </span>
                    </td>
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
              <div className="modal-title">Define Bus Architecture</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div style={{ color: "var(--red-400)", marginBottom: "16px", fontSize: "14px" }}>{error}</div>}
                
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Fleet Classification Name*</label>
                  <input 
                    type="text" 
                    required 
                    autoFocus
                    className="form-input" 
                    placeholder="e.g. Scania Double A/C Semi-Sleeper"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Physical Seat Layout*</label>
                  <select 
                    required 
                    className="form-input" 
                    value={formData.layout} 
                    onChange={e => setFormData({...formData, layout: e.target.value})} 
                  >
                    <option value="2+2">2+2 (Standard Seater)</option>
                    <option value="2+1">2+1 (Executive / Sleeper)</option>
                    <option value="1+1">1+1 (Premium Sleeper)</option>
                    <option value="3+2">3+2 (Economy)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={formData.has_ac}
                      onChange={e => setFormData({...formData, has_ac: e.target.checked})}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--teal-500)' }}
                    />
                    <span style={{ fontSize: "14px" }}>Includes A/C</span>
                  </label>
                  
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={formData.has_sleeper}
                      onChange={e => setFormData({...formData, has_sleeper: e.target.checked})}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--teal-500)' }}
                    />
                    <span style={{ fontSize: "14px" }}>Sleeper Coach</span>
                  </label>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="admin-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Add Fleet Config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
