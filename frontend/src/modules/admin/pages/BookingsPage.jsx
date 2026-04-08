import { useEffect, useMemo, useState } from 'react';
import {
  createSupportTicket,
  getBookingsMonitoring,
  getSupportTickets,
  issueRefund,
  updateSupportTicket,
} from '../services/adminService';

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

const blankTicketForm = {
  booking_id: '',
  operator_id: '',
  passenger_id: '',
  category: 'BOOKING',
  priority: 'MEDIUM',
  subject: '',
  description: '',
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ query: '', status: 'ALL' });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [refundForm, setRefundForm] = useState({ refund_amount: '', reason: '', mark_as_refunded: true });
  const [ticketForm, setTicketForm] = useState(blankTicketForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [bookingRes, ticketRes] = await Promise.all([
        getBookingsMonitoring(),
        getSupportTickets(),
      ]);
      setBookings(bookingRes.data);
      setTickets(ticketRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredBookings = useMemo(() => {
    return bookings.filter((item) => {
      const query = filters.query.trim().toLowerCase();
      const matchesQuery = !query || [
        item.booking_ref,
        item.passenger_name,
        item.passenger_phone,
        item.operator_name,
        item.origin_city,
        item.destination_city,
      ].filter(Boolean).join(' ').toLowerCase().includes(query);
      const matchesStatus = filters.status === 'ALL' || item.booking_status === filters.status;
      return matchesQuery && matchesStatus;
    });
  }, [bookings, filters]);

  const openRefund = (booking) => {
    setSelectedBooking(booking);
    setRefundForm({
      refund_amount: booking.total_fare - booking.refunded_amount,
      reason: '',
      mark_as_refunded: true,
    });
    setError('');
  };

  const openTicket = (booking) => {
    setTicketForm({
      booking_id: booking.id,
      operator_id: booking.operator_id || '',
      passenger_id: booking.user_id || '',
      category: 'BOOKING',
      priority: 'MEDIUM',
      subject: `Support for ${booking.booking_ref}`,
      description: `${booking.passenger_name || 'Passenger'} requested help for booking ${booking.booking_ref}.`,
    });
    setError('');
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    if (!selectedBooking) return;
    setSaving(true);
    try {
      await issueRefund(selectedBooking.id, {
        ...refundForm,
        refund_amount: Number(refundForm.refund_amount),
      });
      setSelectedBooking(null);
      await load();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to issue refund.');
    } finally {
      setSaving(false);
    }
  };

  const submitTicket = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createSupportTicket({
        ...ticketForm,
        booking_id: ticketForm.booking_id ? Number(ticketForm.booking_id) : null,
        operator_id: ticketForm.operator_id ? Number(ticketForm.operator_id) : null,
        passenger_id: ticketForm.passenger_id ? Number(ticketForm.passenger_id) : null,
      });
      setTicketForm(blankTicketForm);
      await load();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to create support ticket.');
    } finally {
      setSaving(false);
    }
  };

  const updateTicketStatus = async (ticketId, status) => {
    setSaving(true);
    try {
      await updateSupportTicket(ticketId, {
        status,
        resolution_notes: status === 'RESOLVED' ? 'Resolved from admin booking monitor.' : '',
      });
      await load();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to update support ticket.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">Booking monitoring</div>
          <h1 className="admin-page-title">Bookings, refunds, and support desk</h1>
          <p className="admin-page-copy">Track booking lifecycle, issue refunds, and keep service issues in one clean monitor.</p>
        </div>
      </section>

      {error && <div className="admin-inline-error">{error}</div>}

      <section className="admin-surface-card">
        <div className="admin-section-head compact">
          <div>
            <div className="admin-section-title">Booking monitor</div>
            <div className="admin-section-copy">Search quickly, scan status, and open the next action without friction.</div>
          </div>
        </div>
        <div className="admin-toolbar split">
          <input
            className="form-input admin-search-input"
            placeholder="Search booking, passenger, operator, origin, or destination"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
          <select className="form-input admin-filter-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="ALL">All statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUND_INITIATED">Refund Initiated</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table refined">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Passenger</th>
                <th>Operator</th>
                <th>Route</th>
                <th>Status</th>
                <th>Fare</th>
                <th>Refunded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="admin-table-empty">Loading bookings...</td></tr>
              ) : filteredBookings.length === 0 ? (
                <tr><td colSpan="8" className="admin-table-empty">No bookings found.</td></tr>
              ) : filteredBookings.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="admin-table-primary">{item.booking_ref}</div>
                    <div className="admin-table-secondary">{item.departure_time ? new Date(item.departure_time).toLocaleString() : 'No departure time'}</div>
                  </td>
                  <td>
                    <div className="admin-table-primary">{item.passenger_name || 'Passenger'}</div>
                    <div className="admin-table-secondary">{item.passenger_phone || '-'}</div>
                  </td>
                  <td>{item.operator_name || '-'}</td>
                  <td>{item.origin_city} to {item.destination_city}</td>
                  <td>
                    <div className="admin-status-stack">
                      <span className={`admin-status-pill ${item.booking_status.toLowerCase()}`}>{item.booking_status}</span>
                      <span className="admin-status-subtle">{item.payment_status}</span>
                    </div>
                  </td>
                  <td>{formatCurrency(item.total_fare)}</td>
                  <td>{formatCurrency(item.refunded_amount)}</td>
                  <td>
                    <div className="admin-action-row">
                      <button className="admin-btn-outline small" onClick={() => openRefund(item)}>Issue refund</button>
                      <button className="admin-btn-outline small" onClick={() => openTicket(item)}>Open ticket</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-grid-two">
        <form className="admin-surface-card padded" onSubmit={submitTicket}>
          <div className="admin-section-head compact">
            <div>
              <div className="admin-section-title">Support ticket desk</div>
              <div className="admin-section-copy">Capture issues from bookings, payments, refunds, or operator support.</div>
            </div>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field"><span>Booking ID</span><input className="form-input" value={ticketForm.booking_id} onChange={(event) => setTicketForm({ ...ticketForm, booking_id: event.target.value })} placeholder="Optional" /></label>
            <label className="admin-field"><span>Operator ID</span><input className="form-input" value={ticketForm.operator_id} onChange={(event) => setTicketForm({ ...ticketForm, operator_id: event.target.value })} placeholder="Optional" /></label>
            <label className="admin-field"><span>Passenger ID</span><input className="form-input" value={ticketForm.passenger_id} onChange={(event) => setTicketForm({ ...ticketForm, passenger_id: event.target.value })} placeholder="Optional" /></label>
            <label className="admin-field"><span>Category</span><select className="form-input" value={ticketForm.category} onChange={(event) => setTicketForm({ ...ticketForm, category: event.target.value })}><option value="BOOKING">Booking</option><option value="PAYMENT">Payment</option><option value="REFUND">Refund</option><option value="OPERATOR">Operator</option></select></label>
            <label className="admin-field"><span>Priority</span><select className="form-input" value={ticketForm.priority} onChange={(event) => setTicketForm({ ...ticketForm, priority: event.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
            <label className="admin-field full"><span>Subject</span><input className="form-input" value={ticketForm.subject} onChange={(event) => setTicketForm({ ...ticketForm, subject: event.target.value })} required /></label>
            <label className="admin-field full"><span>Description</span><textarea className="form-input admin-textarea" value={ticketForm.description} onChange={(event) => setTicketForm({ ...ticketForm, description: event.target.value })} required /></label>
          </div>
          <div className="admin-footer-actions">
            <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create support ticket'}</button>
          </div>
        </form>

        <div className="admin-surface-card padded">
          <div className="admin-section-head compact">
            <div>
              <div className="admin-section-title">Open support queue</div>
              <div className="admin-section-copy">Keep the latest issues visible and move them forward in one click.</div>
            </div>
          </div>
          <div className="admin-list-stack" style={{ padding: 0 }}>
            {tickets.length === 0 && <div className="admin-table-empty">No support tickets yet.</div>}
            {tickets.slice(0, 8).map((item) => (
              <div className="admin-list-row" key={item.id}>
                <div>
                  <div className="admin-row-title">{item.subject}</div>
                  <div className="admin-row-meta">{item.category} - {item.priority} - {item.booking_ref || 'No booking ref'}</div>
                </div>
                <div className="admin-row-right">
                  <span className={`admin-status-pill ${item.status.toLowerCase()}`}>{item.status}</span>
                  <div className="admin-action-row">
                    {item.status === 'OPEN' && <button className="admin-btn-outline small" onClick={() => updateTicketStatus(item.id, 'IN_PROGRESS')}>Start</button>}
                    {item.status !== 'RESOLVED' && item.status !== 'CLOSED' && <button className="admin-btn-outline small" onClick={() => updateTicketStatus(item.id, 'RESOLVED')}>Resolve</button>}
                    {item.status !== 'CLOSED' && <button className="admin-btn-outline small" onClick={() => updateTicketStatus(item.id, 'CLOSED')}>Close</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selectedBooking && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <div>
                <div className="modal-title">Issue refund</div>
                <div className="modal-subtitle">{selectedBooking.booking_ref} - {selectedBooking.passenger_name || 'Passenger'} - {selectedBooking.operator_name || 'Operator'}</div>
              </div>
              <button className="modal-close" onClick={() => setSelectedBooking(null)}>x</button>
            </div>
            <form onSubmit={submitRefund}>
              <div className="modal-body form-grid">
                <label className="admin-field">
                  <span>Refund amount</span>
                  <input className="form-input" type="number" min="0" step="0.01" value={refundForm.refund_amount} onChange={(event) => setRefundForm({ ...refundForm, refund_amount: event.target.value })} required />
                </label>
                <label className="admin-field full">
                  <span>Reason</span>
                  <textarea className="form-input admin-textarea" value={refundForm.reason} onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })} placeholder="Document why this refund is being issued." />
                </label>
                <label className="admin-field toggle">
                  <span>Mark as fully refunded</span>
                  <input type="checkbox" checked={refundForm.mark_as_refunded} onChange={(event) => setRefundForm({ ...refundForm, mark_as_refunded: event.target.checked })} />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="admin-btn-outline" onClick={() => setSelectedBooking(null)}>Cancel</button>
                <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Processing...' : 'Confirm refund'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
