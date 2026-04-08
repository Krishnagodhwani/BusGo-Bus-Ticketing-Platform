import { useEffect, useMemo, useState } from 'react';
import { getPassengers } from '../services/adminService';

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

export default function PassengersPage() {
  const [passengers, setPassengers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getPassengers();
        setPassengers(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load passengers.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return passengers;
    return passengers.filter((item) =>
      [item.name, item.phone, item.email].filter(Boolean).join(' ').toLowerCase().includes(term)
    );
  }, [passengers, query]);

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">User management</div>
          <h1 className="admin-page-title">Passenger accounts</h1>
          <p className="admin-page-copy">Review passenger signups, booking history, and value by customer account.</p>
        </div>
      </section>

      <section className="admin-surface-card">
        <div className="admin-toolbar">
          <input className="form-input admin-search-input" placeholder="Search passenger by name, phone, or email" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table refined">
            <thead>
              <tr>
                <th>Passenger</th>
                <th>Phone</th>
                <th>Total Bookings</th>
                <th>Total Spend</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="admin-table-empty">Loading passengers...</td></tr>
              ) : error ? (
                <tr><td colSpan="6" className="admin-table-empty">{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" className="admin-table-empty">No passengers found.</td></tr>
              ) : filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="admin-table-primary">{item.name || 'Unnamed passenger'}</div>
                    <div className="admin-table-secondary">{item.email || 'No email provided'}</div>
                  </td>
                  <td>{item.phone}</td>
                  <td>{item.total_bookings}</td>
                  <td>{formatCurrency(item.total_spend)}</td>
                  <td><span className={`admin-status-pill ${item.is_active ? 'confirmed' : 'cancelled'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
