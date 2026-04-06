import { useEffect, useState } from 'react';
import {
  cancelMyBooking,
  getMyBookingRescheduleOptions,
  getMyBookings,
  rescheduleMyBooking,
} from '../services/userService';
import './BookingPage.css';

const STATUS_STYLES = {
  CONFIRMED: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', label: 'Confirmed' },
  INITIATED: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', label: 'Initiated' },
  SEAT_LOCKED: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', label: 'Seat Locked' },
  CANCELLED: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', label: 'Cancelled' },
  REFUND_INITIATED: { bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', label: 'Refund Initiated' },
  REFUNDED: { bg: 'rgba(167,139,250,0.15)', color: '#c4b5fd', label: 'Refunded' },
  RESCHEDULED: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', label: 'Rescheduled' },
  BOARDED: { bg: 'rgba(45,212,191,0.12)', color: '#2dd4bf', label: 'Boarded' },
  COMPLETED: { bg: 'rgba(74,222,128,0.12)', color: '#86efac', label: 'Completed' },
};

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [options, setOptions] = useState([]);
  const [seatLabels, setSeatLabels] = useState('');
  const [selectedTrip, setSelectedTrip] = useState('');

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    try {
      setLoading(true);
      const res = await getMyBookings();
      setBookings(res.data);
    } catch {
      setError('Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (dt) => new Date(dt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const getDisplayStatus = (booking) => {
    const ops = (booking.ops_status || '').toUpperCase();
    if (ops === 'CANCELLED') return booking.refunded_amount > 0 ? 'REFUNDED' : 'CANCELLED';
    if (ops === 'RESCHEDULED') return 'RESCHEDULED';
    if (ops === 'BOARDED') return 'BOARDED';
    if (ops === 'COMPLETED') return 'COMPLETED';
    return booking.status;
  };

  const canSelfManage = (booking) => {
    const displayStatus = getDisplayStatus(booking);
    return new Date(booking.departure_time) > new Date() && displayStatus !== 'CANCELLED' && displayStatus !== 'REFUNDED';
  };

  const handleCancel = async (bookingId) => {
    if (!window.confirm('Cancel this booking?')) return;
    try {
      await cancelMyBooking(bookingId, { note: 'Cancelled by passenger' });
      setSuccess('Booking cancelled successfully.');
      loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to cancel booking.');
    }
  };

  const openReschedule = async (booking) => {
    try {
      const res = await getMyBookingRescheduleOptions(booking.id);
      setOptions(res.data);
      setSeatLabels('');
      setSelectedTrip('');
      setRescheduleFor(booking);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'No alternate trips available right now.');
    }
  };

  const confirmReschedule = async () => {
    if (!rescheduleFor) return;
    try {
      await rescheduleMyBooking(rescheduleFor.id, {
        new_trip_id: Number(selectedTrip),
        seat_labels: seatLabels.split(',').map((item) => item.trim()).filter(Boolean),
      });
      setSuccess('Booking rescheduled successfully.');
      setRescheduleFor(null);
      loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to reschedule booking.');
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading your bookings...</div>;
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: '980px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px' }}>My Bookings</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '28px' }}>
        Track tickets, cancellation status, refunds, and alternate-trip options in one place.
      </p>

      {error && <div style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '14px', borderRadius: '8px', marginBottom: '20px' }}>{error}</div>}
      {success && <div style={{ color: '#86efac', background: 'rgba(74,222,128,0.1)', padding: '14px', borderRadius: '8px', marginBottom: '20px' }}>{success}</div>}

      {bookings.length === 0 && !error ? (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>BK</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>No bookings yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Book your first bus ticket to see it here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bookings.map((booking) => {
            const displayStatus = getDisplayStatus(booking);
            const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.INITIATED;
            return (
              <div key={booking.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.08em', color: '#60a5fa', background: 'rgba(96,165,250,0.12)', padding: '3px 10px', borderRadius: '5px' }}>
                      {booking.booking_ref}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '5px', background: statusStyle.bg, color: statusStyle.color }}>
                      {statusStyle.label}
                    </span>
                    {booking.ops_status && booking.ops_status !== displayStatus && (
                      <span style={{ fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '5px', background: 'rgba(96,165,250,0.12)', color: '#93c5fd' }}>
                        Ops: {booking.ops_status.replaceAll('_', ' ')}
                      </span>
                    )}
                    {booking.refunded_amount > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '5px', background: 'rgba(167,139,250,0.12)', color: '#c4b5fd' }}>
                        Refunded Rs.{booking.refunded_amount}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px' }}>
                    {booking.boarding_city} {'->'} {booking.dropping_city}
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <span>Ticket: {booking.ticket_number || booking.booking_ref}</span>
                    <span>Dep: {fmt(booking.departure_time)}</span>
                    <span>Arr: {fmt(booking.arrival_time)}</span>
                    <span>{booking.total_passengers} passenger{booking.total_passengers > 1 ? 's' : ''}</span>
                    <span>{booking.payment_status === 'SUCCESS' ? 'Paid' : booking.payment_status}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, display: 'grid', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: '#4ade80' }}>Rs.{booking.total_fare}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{booking.booking_source || 'Web booking'}</div>
                  </div>
                  {canSelfManage(booking) && (
                    <>
                      <button className="btn-secondary" onClick={() => openReschedule(booking)}>Reschedule</button>
                      <button className="btn-secondary" onClick={() => handleCancel(booking.id)}>Cancel Booking</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rescheduleFor && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '760px' }}>
            <div className="modal-header">
              <div className="modal-title">Reschedule Booking</div>
              <button className="modal-close" onClick={() => setRescheduleFor(null)}>X</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                {rescheduleFor.boarding_city} {'->'} {rescheduleFor.dropping_city} • Current trip {fmt(rescheduleFor.departure_time)}
              </div>
              {options.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No alternate trips are available right now.</div>
              ) : (
                <>
                  <select className="form-input" value={selectedTrip} onChange={(event) => setSelectedTrip(event.target.value)}>
                    <option value="">Select alternate trip</option>
                    {options.map((option) => (
                      <option key={option.trip_id} value={option.trip_id}>
                        {new Date(option.departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} • {option.bus_name} • {option.available_seats} seats left
                      </option>
                    ))}
                  </select>
                  <input className="form-input" value={seatLabels} onChange={(event) => setSeatLabels(event.target.value)} placeholder="Enter new seat labels, e.g. 1A,1B" />
                  <button className="btn-primary" onClick={confirmReschedule} disabled={!selectedTrip || !seatLabels}>Confirm Reschedule</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
