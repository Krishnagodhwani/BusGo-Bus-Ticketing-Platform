import { useEffect, useMemo, useState } from 'react';
import {
  cancelOperatorBooking,
  exportOperatorBookings,
  getOperatorTicketDocument,
  exportTripManifest,
  getBookingSummary,
  getMyBuses,
  getMyRoutes,
  getMyTrips,
  getOperatorBookingDetail,
  getOperatorBookingRescheduleOptions,
  getOperatorBookings,
  resendOperatorTicket,
  getTripManifest,
  getTripManifestDocument,
  rescheduleOperatorBooking,
  updateOperatorBooking,
} from '../services/operatorService';
import './OperatorWorkspace.css';

const emptyFilters = {
  search: '',
  date_from: '',
  date_to: '',
  route_id: '',
  trip_id: '',
  bus_id: '',
  booking_status: '',
  payment_status: '',
  booking_source: '',
};

const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const openHtmlDocument = (html) => {
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return;
  win.document.write(html);
  win.document.close();
};

const openPrintWindow = (title, body) => {
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1, h2 { margin-bottom: 8px; }
          .meta { color: #4b5563; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; }
          .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export default function OperatorBookingsPage() {
  const [summary, setSummary] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [buses, setBuses] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedManifest, setSelectedManifest] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rescheduleOptions, setRescheduleOptions] = useState([]);
  const [rescheduleForm, setRescheduleForm] = useState({ new_trip_id: '', seat_labels: '' });
  const [staffMode, setStaffMode] = useState(false);
  const [conductorMode, setConductorMode] = useState(false);
  const [manifestFilter, setManifestFilter] = useState('ALL');
  const [manifestSearch, setManifestSearch] = useState('');

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    loadBookings();
  }, [filters]);

  const loadBaseData = async () => {
    try {
      setLoading(true);
      const [summaryRes, routesRes, tripsRes, busesRes] = await Promise.all([
        getBookingSummary(),
        getMyRoutes(),
        getMyTrips(),
        getMyBuses(),
      ]);
      setSummary(summaryRes.data);
      setRoutes(routesRes.data);
      setTrips(tripsRes.data);
      setBuses(busesRes.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load booking console.');
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const response = await getOperatorBookings(params);
      setBookings(response.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load bookings.');
    }
  };

  const openBooking = async (bookingId) => {
    try {
      const response = await getOperatorBookingDetail(bookingId);
      setSelectedBooking(response.data);
      setRescheduleOptions([]);
      setRescheduleForm({ new_trip_id: '', seat_labels: '' });
      setSelectedManifest(null);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to open booking details.');
    }
  };

  const openManifest = async (tripId) => {
    try {
      const response = await getTripManifest(tripId);
      setSelectedManifest(response.data);
      setStaffMode(false);
      setConductorMode(false);
      setManifestFilter('ALL');
      setManifestSearch('');
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to load trip manifest.');
    }
  };

  const handleBookingSave = async () => {
    if (!selectedBooking) return;
    try {
      setSaving(true);
      const payload = {
        ops_status: selectedBooking.ops_status?.toUpperCase().replaceAll(' ', '_'),
        operator_notes: selectedBooking.operator_notes || '',
        issue_flag: selectedBooking.issue_flag || '',
        refunded_amount: Number(selectedBooking.refunded_amount || 0),
      };
      const response = await updateOperatorBooking(selectedBooking.id, payload);
      setSelectedBooking(response.data);
      setSuccess('Booking details updated.');
      loadBookings();
      loadBaseData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save booking update.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const response = await exportOperatorBookings(params);
      saveBlob(response.data, 'operator-bookings.csv');
    } catch (requestError) {
      setError('Failed to export bookings.');
    }
  };

  const loadRescheduleOptions = async (bookingId) => {
    try {
      const response = await getOperatorBookingRescheduleOptions(bookingId);
      setRescheduleOptions(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to load reschedule options.');
    }
  };

  const handleCancelBooking = async (booking, refundAmount = booking.total_fare) => {
    if (!window.confirm(`Cancel booking ${booking.booking_ref}?`)) return;
    try {
      const response = await cancelOperatorBooking(booking.id, { refund_amount: refundAmount, note: 'Cancelled by operator support' });
      setSelectedBooking(response.data);
      setSuccess('Booking cancelled successfully.');
      loadBookings();
      loadBaseData();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to cancel booking.');
    }
  };

  const handleRescheduleBooking = async () => {
    if (!selectedBooking) return;
    try {
      setSaving(true);
      const seatLabels = rescheduleForm.seat_labels.split(',').map((item) => item.trim()).filter(Boolean);
      const response = await rescheduleOperatorBooking(selectedBooking.id, {
        new_trip_id: Number(rescheduleForm.new_trip_id),
        seat_labels: seatLabels,
        note: 'Rescheduled by operator support',
      });
      setSelectedBooking(response.data);
      setSuccess('Booking rescheduled successfully.');
      setRescheduleOptions([]);
      loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to reschedule booking.');
    } finally {
      setSaving(false);
    }
  };

  const handleManifestBookingStatus = async (bookingId, opsStatus) => {
    try {
      await updateOperatorBooking(bookingId, { ops_status: opsStatus.toUpperCase().replaceAll(' ', '_') });
      if (selectedManifest?.trip?.id) {
        openManifest(selectedManifest.trip.id);
      }
      if (selectedBooking?.id === bookingId) {
        openBooking(bookingId);
      }
      loadBookings();
      setSuccess(`Booking marked as ${opsStatus}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to update passenger boarding status.');
    }
  };

  const handleManifestExport = async (tripId) => {
    try {
      const response = await exportTripManifest(tripId);
      saveBlob(response.data, `trip-${tripId}-manifest.csv`);
    } catch (requestError) {
      setError('Failed to export trip manifest.');
    }
  };

  const openServerTicketDocument = async (bookingId) => {
    try {
      const response = await getOperatorTicketDocument(bookingId);
      openHtmlDocument(response.data);
    } catch (requestError) {
      setError('Failed to open ticket document.');
    }
  };

  const openServerManifestDocument = async (tripId, staffOnly = false) => {
    try {
      const response = await getTripManifestDocument(tripId, { staff_mode: staffOnly });
      openHtmlDocument(response.data);
    } catch (requestError) {
      setError('Failed to open manifest document.');
    }
  };

  const handleResendTicket = async (bookingId, channel = 'SMS') => {
    try {
      const response = await resendOperatorTicket(bookingId, channel);
      setSuccess(response.data.message);
      if (selectedBooking?.id === bookingId) {
        openBooking(bookingId);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to resend ticket.');
    }
  };

  const printTicket = (booking) => {
    const passengers = (booking.passengers || []).map((passenger) => `<li>${passenger.name} - Seat ${passenger.seat_label}</li>`).join('');
    openPrintWindow(
      `Ticket ${booking.booking_ref}`,
      `
        <h1>Passenger Ticket</h1>
        <div class="meta">${booking.booking_ref} | ${booking.ticket_number || booking.booking_ref}</div>
        <div class="card">
          <strong>Route:</strong> ${booking.route_name || '-'}<br/>
          <strong>Journey:</strong> ${new Date(booking.trip_departure_time).toLocaleString('en-IN')}<br/>
          <strong>Bus:</strong> ${booking.bus_name || '-'} (${booking.bus_reg_number || '-'})<br/>
          <strong>Boarding:</strong> ${booking.boarding_point || '-'}<br/>
          <strong>Dropping:</strong> ${booking.dropping_point || '-'}<br/>
          <strong>Passenger Phone:</strong> ${booking.passenger_phone || '-'}
        </div>
        <div class="card">
          <strong>Seats:</strong> ${(booking.seat_numbers || []).join(', ')}<br/>
          <strong>Fare Paid:</strong> Rs. ${booking.total_fare}<br/>
          <strong>Status:</strong> ${booking.booking_status} / ${booking.payment_status}
        </div>
        <div class="card">
          <strong>Passengers</strong>
          <ul>${passengers}</ul>
        </div>
      `
    );
  };

  const handlePrintBooking = async (booking) => {
    if (selectedBooking?.id === booking.id && selectedBooking.passengers?.length) {
      printTicket(selectedBooking);
      return;
    }
    try {
      const response = await getOperatorBookingDetail(booking.id);
      printTicket(response.data);
    } catch (requestError) {
      setError('Failed to prepare printable ticket.');
    }
  };

  const manifestPassengers = useMemo(() => {
    if (!selectedManifest) return [];
    const query = manifestSearch.trim().toLowerCase();
    return (selectedManifest.passengers || []).filter((passenger) => {
      const normalizedStatus = (passenger.ops_status || '').toUpperCase().replaceAll(' ', '_');
      const matchesFilter = manifestFilter === 'ALL' || normalizedStatus === manifestFilter;
      const matchesSearch = !query || [
        passenger.seat_label,
        passenger.passenger_name,
        passenger.passenger_phone,
        passenger.booking_ref,
        passenger.boarding_point,
        passenger.dropping_point,
      ].filter(Boolean).some((value) => value.toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [selectedManifest, manifestFilter, manifestSearch]);

  const printManifest = (manifest, options = {}) => {
    const { staffOnly = false, passengers = manifest.passengers || [] } = options;
    const rows = passengers.map((passenger) => `
      <tr>
        <td>${passenger.seat_label}</td>
        <td>${passenger.passenger_name}</td>
        <td>${passenger.passenger_phone || '-'}</td>
        <td>${passenger.boarding_point}</td>
        ${staffOnly ? '' : `<td>${passenger.dropping_point}</td><td>${passenger.booking_ref}</td>`}
      </tr>
    `).join('');
    openPrintWindow(
      `${staffOnly ? 'Boarding List' : 'Manifest'} ${manifest.trip.id}`,
      `
        <h1>${staffOnly ? 'Ground Staff Boarding List' : 'Trip Passenger Manifest'}</h1>
        <div class="meta">${manifest.route_name} | ${manifest.bus_name} | ${new Date(manifest.trip.departure_time).toLocaleString('en-IN')}</div>
        <div class="card">
          <strong>Booked Seats:</strong> ${manifest.booked_seats} |
          <strong>Available Seats:</strong> ${manifest.available_seats} |
          <strong>Passengers:</strong> ${manifest.total_passengers} |
          <strong>Collected:</strong> Rs. ${manifest.collected_amount}
        </div>
        <table>
          <thead>
            <tr><th>Seat</th><th>Passenger</th><th>Phone</th><th>Boarding</th>${staffOnly ? '' : '<th>Dropping</th><th>PNR</th>'}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `
    );
  };

  const upcomingTrips = useMemo(
    () => trips.filter((trip) => new Date(trip.departure_time) >= new Date()).slice(0, 20),
    [trips]
  );

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">Passenger Bookings</h1>
          <div className="operator-page-subtitle">
            Booking operations now work like a real operator console: find bookings by PNR or phone, open trip-wise
            manifests, manage support notes, and print tickets or staff-ready passenger sheets.
          </div>
        </div>
        <div className="operator-action-row">
          <button className="operator-secondary-btn" onClick={handleExport}>Export Bookings CSV</button>
          <button className="operator-primary-btn" onClick={() => upcomingTrips[0] && openManifest(upcomingTrips[0].id)}>Open Next Manifest</button>
        </div>
      </div>

      <div className="operator-kpi-grid">
        <div className="operator-kpi-card"><div className="operator-kpi-label">Total Bookings</div><div className="operator-kpi-value">{summary?.total_bookings || 0}</div><div className="operator-kpi-meta">{summary?.confirmed_bookings || 0} confirmed</div></div>
        <div className="operator-kpi-card"><div className="operator-kpi-label">Booking Revenue</div><div className="operator-kpi-value">Rs. {Math.round(summary?.total_revenue || 0)}</div><div className="operator-kpi-meta">Across all paid bookings</div></div>
        <div className="operator-kpi-card"><div className="operator-kpi-label">Refunded</div><div className="operator-kpi-value">Rs. {Math.round(summary?.refunded_amount || 0)}</div><div className="operator-kpi-meta">{summary?.refunded_bookings || 0} refunded bookings</div></div>
        <div className="operator-kpi-card"><div className="operator-kpi-label">Pending Payments</div><div className="operator-kpi-value">{summary?.pending_payment_bookings || 0}</div><div className="operator-kpi-meta">{summary?.todays_departures || 0} departures today</div></div>
      </div>

      <div className="operator-panel-card">
        <div className="operator-toolbar">
          <div className="operator-toolbar-group">
            <input className="form-input operator-search" placeholder="Search PNR, ticket, passenger, phone" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
            <input className="form-input" type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
            <input className="form-input" type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
            <select className="form-input" value={filters.route_id} onChange={(event) => setFilters({ ...filters, route_id: event.target.value, trip_id: '' })}>
              <option value="">All routes</option>
              {routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
            </select>
            <select className="form-input" value={filters.trip_id} onChange={(event) => setFilters({ ...filters, trip_id: event.target.value })}>
              <option value="">All trips</option>
              {trips.filter((trip) => !filters.route_id || String(trip.route_id) === String(filters.route_id)).map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.route_name} - {new Date(trip.departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</option>
              ))}
            </select>
            <select className="form-input" value={filters.bus_id} onChange={(event) => setFilters({ ...filters, bus_id: event.target.value })}>
              <option value="">All buses</option>
              {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
            </select>
            <select className="form-input" value={filters.booking_status} onChange={(event) => setFilters({ ...filters, booking_status: event.target.value })}>
              <option value="">All booking statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>
            <select className="form-input" value={filters.payment_status} onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })}>
              <option value="">All payment statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
            </select>
            <select className="form-input" value={filters.booking_source} onChange={(event) => setFilters({ ...filters, booking_source: event.target.value })}>
              <option value="">All sources</option>
              <option value="WEB">Web</option>
              <option value="APP">App</option>
              <option value="ADMIN">Admin</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="operator-alert error">{error}</div>}
      {success && <div className="operator-alert success">{success}</div>}

      {loading ? (
        <div className="operator-empty-card">Loading passenger bookings...</div>
      ) : bookings.length === 0 ? (
        <div className="operator-empty-card">
          <div className="operator-empty-title">No bookings found</div>
          <div className="operator-empty-copy">Bookings will appear here as soon as passengers start reserving seats on your trips.</div>
        </div>
      ) : (
        <div className="operator-list">
          {bookings.map((booking) => (
            <div className="operator-record" key={booking.id}>
              <div className="operator-record-main">
                <div>
                  <div className="operator-record-title">{booking.booking_ref} • {booking.passenger_name}</div>
                  <div className="operator-record-subtitle">
                    {booking.route_name} • {booking.bus_name} ({booking.bus_reg_number}) • {new Date(booking.trip_departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
                <div className="operator-chip-row">
                  <span className="operator-chip route">{booking.booking_status}</span>
                  <span className={`operator-chip ${booking.payment_status === 'Paid' ? 'active' : booking.payment_status.includes('Refund') ? 'warning' : 'danger'}`}>{booking.payment_status}</span>
                  <span className="operator-chip info">{booking.ops_status}</span>
                  <span className="operator-chip">{booking.booking_source}</span>
                  {booking.issue_flag && <span className="operator-chip danger">{booking.issue_flag}</span>}
                </div>
                <div className="operator-record-stats">
                  <div className="operator-stat-box"><div className="operator-stat-box-label">Seats</div><div className="operator-stat-box-value">{booking.seat_numbers.join(', ')}</div></div>
                  <div className="operator-stat-box"><div className="operator-stat-box-label">Boarding</div><div className="operator-stat-box-value">{booking.boarding_point}</div></div>
                  <div className="operator-stat-box"><div className="operator-stat-box-label">Fare</div><div className="operator-stat-box-value">Rs. {booking.total_fare}</div></div>
                </div>
              </div>
              <div className="operator-record-actions">
                <button className="operator-secondary-btn" onClick={() => openBooking(booking.id)}>Open Booking</button>
                <button className="operator-secondary-btn" onClick={() => openManifest(booking.trip_id)}>Open Manifest</button>
                <button className="operator-secondary-btn" onClick={() => handleCancelBooking(booking, booking.total_fare)}>Cancel / Refund</button>
                <button className="operator-secondary-btn" onClick={() => handleManifestExport(booking.trip_id)}>Export Manifest</button>
                <button className="operator-secondary-btn" onClick={() => handleResendTicket(booking.id, 'SMS')}>Resend SMS</button>
                <button className="operator-ghost-btn" onClick={() => openServerTicketDocument(booking.id)}>Ticket Doc</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1080px' }}>
            <div className="modal-header">
              <div className="modal-title">Booking Detail • {selectedBooking.booking_ref}</div>
              <button className="modal-close" onClick={() => setSelectedBooking(null)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '18px' }}>
              <div className="operator-grid-two operator-grid-balanced">
                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Journey & Passenger</div>
                  <div className="operator-mini-summary">
                    <div className="operator-mini-summary-item"><span>Ticket</span><strong>{selectedBooking.ticket_number || selectedBooking.booking_ref}</strong></div>
                    <div className="operator-mini-summary-item"><span>Passenger</span><strong>{selectedBooking.passenger_name} • {selectedBooking.passenger_phone || '-'}</strong></div>
                    <div className="operator-mini-summary-item"><span>Route</span><strong>{selectedBooking.route_name}</strong></div>
                    <div className="operator-mini-summary-item"><span>Bus</span><strong>{selectedBooking.bus_name} ({selectedBooking.bus_reg_number})</strong></div>
                    <div className="operator-mini-summary-item"><span>Journey</span><strong>{new Date(selectedBooking.trip_departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>
                    <div className="operator-mini-summary-item"><span>Boarding / Dropping</span><strong>{selectedBooking.boarding_point} {'->'} {selectedBooking.dropping_point}</strong></div>
                    <div className="operator-mini-summary-item"><span>Seats</span><strong>{selectedBooking.seat_numbers.join(', ')}</strong></div>
                    <div className="operator-mini-summary-item"><span>Fare</span><strong>Rs. {selectedBooking.total_fare}</strong></div>
                    <div className="operator-mini-summary-item"><span>Last Ticket Sent</span><strong>{selectedBooking.last_ticket_sent_at ? `${new Date(selectedBooking.last_ticket_sent_at).toLocaleString('en-IN')} • ${selectedBooking.last_ticket_sent_channel}` : 'Not sent from operator console yet'}</strong></div>
                  </div>
                </div>

                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Operator Actions</div>
                  <div className="operator-form-grid">
                    <div>
                      <label className="operator-field-label">Operational Status</label>
                        <select className="form-input" value={selectedBooking.ops_status} onChange={(event) => setSelectedBooking({ ...selectedBooking, ops_status: event.target.value })}>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Pending">Pending</option>
                          <option value="Boarded">Boarded</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                          <option value="No Show">No Show</option>
                          <option value="Rescheduled">Rescheduled</option>
                      </select>
                    </div>
                    <div>
                      <label className="operator-field-label">Issue Flag</label>
                      <input className="form-input" value={selectedBooking.issue_flag || ''} onChange={(event) => setSelectedBooking({ ...selectedBooking, issue_flag: event.target.value })} placeholder="Late boarding, refund requested..." />
                    </div>
                    <div>
                      <label className="operator-field-label">Refunded Amount</label>
                      <input className="form-input" type="number" min="0" max={selectedBooking.total_fare} value={selectedBooking.refunded_amount || 0} onChange={(event) => setSelectedBooking({ ...selectedBooking, refunded_amount: event.target.value })} />
                    </div>
                    <div>
                      <label className="operator-field-label">Booking Source</label>
                      <input className="form-input" disabled value={selectedBooking.booking_source} />
                    </div>
                  </div>
                  <div>
                    <label className="operator-field-label">Internal Notes</label>
                    <textarea className="form-input" rows="4" value={selectedBooking.operator_notes || ''} onChange={(event) => setSelectedBooking({ ...selectedBooking, operator_notes: event.target.value })} placeholder="Add support notes, boarding issues, or staff instructions" />
                  </div>
                  <div className="operator-action-row">
                    <button className="operator-secondary-btn" onClick={() => printTicket(selectedBooking)}>Print Ticket</button>
                    <button className="operator-secondary-btn" onClick={() => openServerTicketDocument(selectedBooking.id)}>Open Ticket Doc</button>
                    <button className="operator-secondary-btn" onClick={() => handleResendTicket(selectedBooking.id, 'SMS')}>Resend SMS</button>
                    <button className="operator-secondary-btn" onClick={() => handleResendTicket(selectedBooking.id, 'WHATSAPP')}>Resend WhatsApp</button>
                    <button className="operator-secondary-btn" onClick={() => openManifest(selectedBooking.trip_id)}>View Trip</button>
                    <button className="operator-secondary-btn" onClick={() => setSelectedBooking({ ...selectedBooking, ops_status: 'Boarded' })}>Mark Boarded</button>
                    <button className="operator-secondary-btn" onClick={() => setSelectedBooking({ ...selectedBooking, ops_status: 'No Show' })}>Mark No Show</button>
                    <button className="operator-secondary-btn" onClick={() => handleCancelBooking(selectedBooking, Number(selectedBooking.refunded_amount || selectedBooking.total_fare))}>Cancel / Refund</button>
                    <button className="operator-secondary-btn" onClick={() => loadRescheduleOptions(selectedBooking.id)}>Find Alternate Trips</button>
                    <button className="operator-primary-btn" onClick={handleBookingSave} disabled={saving}>{saving ? 'Saving...' : 'Save Booking Update'}</button>
                  </div>
                </div>
              </div>

              <div className={`operator-panel-shell ${conductorMode ? 'operator-conductor-shell' : ''}`}>
                <div className="operator-section-heading">Passenger Records</div>
                <div className={`operator-preview-list ${conductorMode ? 'operator-conductor-list' : ''}`}>
                  {(selectedBooking.passengers || []).map((passenger) => (
                    <div key={passenger.id} className="operator-preview-row">
                      <span>{passenger.name} • Seat {passenger.seat_label} • {passenger.gender} • {passenger.age} yrs</span>
                      <span>{selectedBooking.passenger_phone || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {rescheduleOptions.length > 0 && (
                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Reschedule Booking</div>
                  <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
                    Choose an alternate trip on the same route segment and reassign seats for the passengers.
                  </div>
                  <div className="operator-preview-list">
                    {rescheduleOptions.map((option) => (
                      <div key={option.trip_id} className="operator-preview-row">
                        <span>{new Date(option.departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} • {option.bus_name}</span>
                        <span>{option.available_seats} seats available</span>
                      </div>
                    ))}
                  </div>
                  <div className="operator-form-grid">
                    <div>
                      <label className="operator-field-label">New Trip</label>
                      <select className="form-input" value={rescheduleForm.new_trip_id} onChange={(event) => setRescheduleForm({ ...rescheduleForm, new_trip_id: event.target.value })}>
                        <option value="">Select alternate trip</option>
                        {rescheduleOptions.map((option) => (
                          <option key={option.trip_id} value={option.trip_id}>
                            {new Date(option.departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} • {option.bus_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="operator-field-label">New Seats</label>
                      <input className="form-input" value={rescheduleForm.seat_labels} onChange={(event) => setRescheduleForm({ ...rescheduleForm, seat_labels: event.target.value })} placeholder="e.g. 1A,1B" />
                    </div>
                  </div>
                  <button className="operator-primary-btn" onClick={handleRescheduleBooking} disabled={saving || !rescheduleForm.new_trip_id || !rescheduleForm.seat_labels}>
                    {saving ? 'Rescheduling...' : 'Confirm Reschedule'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedManifest && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1120px' }}>
            <div className="modal-header">
              <div className="modal-title">Trip Manifest • {selectedManifest.route_name}</div>
              <button className="modal-close" onClick={() => setSelectedManifest(null)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '18px' }}>
              <div className="operator-kpi-grid">
                <div className="operator-kpi-card"><div className="operator-kpi-label">Booked Seats</div><div className="operator-kpi-value">{selectedManifest.booked_seats}</div><div className="operator-kpi-meta">{selectedManifest.total_capacity} total capacity</div></div>
                <div className="operator-kpi-card"><div className="operator-kpi-label">Available Seats</div><div className="operator-kpi-value">{selectedManifest.available_seats}</div><div className="operator-kpi-meta">{selectedManifest.occupancy_percent}% occupancy</div></div>
                <div className="operator-kpi-card"><div className="operator-kpi-label">Passengers</div><div className="operator-kpi-value">{selectedManifest.total_passengers}</div><div className="operator-kpi-meta">Grouped by boarding and dropping</div></div>
                <div className="operator-kpi-card"><div className="operator-kpi-label">Collected</div><div className="operator-kpi-value">Rs. {Math.round(selectedManifest.collected_amount)}</div><div className="operator-kpi-meta">Refunded Rs. {Math.round(selectedManifest.refunded_amount)}</div></div>
              </div>
              <div className="operator-kpi-grid">
                <div className="operator-kpi-card"><div className="operator-kpi-label">Pending Boarding</div><div className="operator-kpi-value">{selectedManifest.pending_count}</div><div className="operator-kpi-meta">Still to board</div></div>
                <div className="operator-kpi-card"><div className="operator-kpi-label">Boarded</div><div className="operator-kpi-value">{selectedManifest.boarded_count}</div><div className="operator-kpi-meta">Checked in</div></div>
                <div className="operator-kpi-card"><div className="operator-kpi-label">No Show</div><div className="operator-kpi-value">{selectedManifest.no_show_count}</div><div className="operator-kpi-meta">Missed departure</div></div>
                <div className="operator-kpi-card"><div className="operator-kpi-label">View Mode</div><div className="operator-kpi-value">{staffMode ? 'Staff' : 'Full'}</div><div className="operator-kpi-meta">Switch based on who is using it</div></div>
              </div>
              <div className="operator-action-row">
                <button className="operator-secondary-btn" onClick={() => printManifest(selectedManifest, { staffOnly: staffMode, passengers: manifestPassengers })}>{staffMode ? 'Print Boarding List' : 'Print Manifest'}</button>
                <button className="operator-secondary-btn" onClick={() => openServerManifestDocument(selectedManifest.trip.id, staffMode)}>{staffMode ? 'Open Boarding Doc' : 'Open Manifest Doc'}</button>
                <button className="operator-secondary-btn" onClick={() => handleManifestExport(selectedManifest.trip.id)}>Export Manifest CSV</button>
                <button className="operator-secondary-btn" onClick={() => setStaffMode((current) => !current)}>{staffMode ? 'Full Manifest' : 'Ground Staff Mode'}</button>
                <button className="operator-secondary-btn" onClick={() => setConductorMode((current) => !current)}>{conductorMode ? 'Desktop Layout' : 'Conductor Mobile View'}</button>
              </div>
              <div className="operator-panel-shell">
                <div className="operator-toolbar">
                  <div className="operator-toolbar-group">
                    <input className="form-input operator-search" placeholder="Search seat, passenger, phone, boarding, PNR" value={manifestSearch} onChange={(event) => setManifestSearch(event.target.value)} />
                    <select className="form-input" value={manifestFilter} onChange={(event) => setManifestFilter(event.target.value)}>
                      <option value="ALL">All passengers</option>
                      <option value="CONFIRMED">Pending boarding</option>
                      <option value="PENDING">Pending review</option>
                      <option value="RESCHEDULED">Rescheduled</option>
                      <option value="BOARDED">Boarded</option>
                      <option value="NO_SHOW">No show</option>
                    </select>
                  </div>
                </div>
                {staffMode && (
                  <div className="operator-inline-note">
                    Ground staff mode keeps the list focused on seat, passenger, boarding point, and phone so check-in is faster at the stand.
                  </div>
                )}
              </div>
              <div className="operator-grid-two operator-grid-balanced">
                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Boarding Groups</div>
                  <div className="operator-preview-list">
                    {Object.entries(selectedManifest.boarding_groups || {}).map(([label, count]) => (
                      <div className="operator-preview-row" key={label}><span>{label}</span><span>{count} passengers</span></div>
                    ))}
                  </div>
                </div>
                <div className="operator-panel-shell">
                  <div className="operator-section-heading">Dropping Groups</div>
                  <div className="operator-preview-list">
                    {Object.entries(selectedManifest.dropping_groups || {}).map(([label, count]) => (
                      <div className="operator-preview-row" key={label}><span>{label}</span><span>{count} passengers</span></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="operator-panel-shell">
                <div className="operator-section-heading">{staffMode ? 'Ground Staff Boarding List' : 'Passenger List'}</div>
                <div className="operator-inline-note">Showing {manifestPassengers.length} passenger record(s) in the current view.</div>
                <div className="operator-preview-list">
                  {manifestPassengers.map((passenger) => (
                    <div className={conductorMode ? 'operator-conductor-card' : 'operator-preview-row'} key={`${passenger.booking_id}-${passenger.seat_label}`}>
                      <span>{passenger.seat_label} • {passenger.passenger_name} • {passenger.boarding_point} {'->'} {passenger.dropping_point}</span>
                      <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{passenger.passenger_phone || '-'} • {passenger.payment_status}</span>
                        <button className="operator-secondary-btn" type="button" onClick={() => handleManifestBookingStatus(passenger.booking_id, 'Boarded')}>Boarded</button>
                        <button className="operator-ghost-btn" type="button" onClick={() => handleManifestBookingStatus(passenger.booking_id, 'No Show')}>No Show</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
