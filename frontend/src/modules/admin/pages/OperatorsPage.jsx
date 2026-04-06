import { useState, useEffect } from 'react';
import { getOperators, createOperator, toggleOperatorStatus } from '../services/adminService';

export default function OperatorsPage() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      setLoading(true);
      const res = await getOperators();
      setOperators(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load operators.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createOperator(formData);
      setShowModal(false);
      setFormData({ name: '', phone: '', email: '', password: '' });
      fetchOperators(); // refresh list
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create operator');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    // Optimistic UI update or simple visual loading state can be added, but a soft refresh is safer for now
    try {
      await toggleOperatorStatus(id);
      fetchOperators(); // refresh to get new state
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update operator status');
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
        Operators Management
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "32px" }}>
        Manage and onboard independent bus agencies onto the platform.
      </p>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Registered Operators</div>
          <button className="admin-btn-primary" onClick={() => setShowModal(true)}>
            <span>+</span> Add Operator
          </button>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Agency Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "32px" }}>Loading operators...</td></tr>
              ) : operators.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "32px" }}>No operators found.</td></tr>
              ) : (
                operators.map(op => (
                  <tr key={op.id}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{op.name}</td>
                    <td>{op.phone}</td>
                    <td>{op.email || '—'}</td>
                    <td>
                      <span className={`badge ${op.is_active ? 'badge-active' : ''}`}>
                        {op.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{new Date(op.created_at).toLocaleDateString()}</td>
                    <td>
                      <button 
                        onClick={() => handleToggleStatus(op.id, op.is_active)}
                        className="admin-btn-outline"
                        style={{ padding: '6px 12px', fontSize: '12px', borderColor: op.is_active ? 'var(--red-500)' : 'var(--teal-500)', color: op.is_active ? 'var(--red-400)' : 'var(--teal-400)' }}
                      >
                        {op.is_active ? 'Deactivate' : 'Activate'}
                      </button>
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
              <div className="modal-title">Onboard Operator</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div style={{ color: "var(--red-400)", marginBottom: "16px", fontSize: "14px" }}>{error}</div>}
                
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Agency Name*</label>
                  <input 
                    type="text" 
                    required 
                    className="form-input" 
                    placeholder="e.g. SRS Travels"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
                
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Phone Number*</label>
                  <input 
                    type="tel" 
                    required 
                    maxLength={10} 
                    className="form-input" 
                    placeholder="10-digit mobile"
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} 
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Email Address (optional)</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="agency@example.com"
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                  />
                </div>

                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>Initial Password*</label>
                  <input 
                    type="text" 
                    required 
                    className="form-input" 
                    placeholder="e.g. agency123"
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                  />
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                    Give this password to the operator. They can change it later.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="admin-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Operator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
