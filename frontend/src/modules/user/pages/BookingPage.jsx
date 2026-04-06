import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createBooking } from '../services/userService';
import './BookingPage.css';

export default function BookingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { bus, selectedSeats } = location.state || {};

  const [passengers, setPassengers] = useState(
    (selectedSeats || []).map(seat => ({
      seat_label: seat,
      name: '',
      age: '',
      gender: 'M',
    }))
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  if (!bus || !selectedSeats) {
    navigate('/');
    return null;
  }

  const totalFare = bus.base_price * selectedSeats.length;

  const updatePassenger = (idx, field, value) => {
    setPassengers(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    for (const pax of passengers) {
      if (!pax.name.trim() || !pax.age) {
        setError('Please fill all passenger details.');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        trip_id: bus.trip_id,
        boarding_stop_id: bus.boarding_stop_id,
        dropping_stop_id: bus.dropping_stop_id,
        seats: selectedSeats,
        passengers: passengers.map(pax => ({
          seat_label: pax.seat_label,
          name: pax.name.trim(),
          age: parseInt(pax.age, 10),
          gender: pax.gender,
        })),
        total_fare: totalFare,
      };

      const res = await createBooking(payload);
      setConfirmed(res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Booking failed. Please try again.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dt) =>
    new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (confirmed) {
    return (
      <div className="booking-page">
        <div className="booking-confirmed">
          <div className="confirmed-icon">OK</div>
          <h2>Booking Confirmed!</h2>
          <div className="booking-ref">{confirmed.booking_ref}</div>
          <p className="confirmed-sub">Your e-ticket has been booked successfully.</p>

          <div className="confirmed-details">
            <div className="cdet-row">
              <span>From</span><strong>{confirmed.boarding_city}</strong>
            </div>
            <div className="cdet-row">
              <span>To</span><strong>{confirmed.dropping_city}</strong>
            </div>
            <div className="cdet-row">
              <span>Departure</span><strong>{formatTime(confirmed.departure_time)}</strong>
            </div>
            <div className="cdet-row">
              <span>Arrival</span><strong>{formatTime(confirmed.arrival_time)}</strong>
            </div>
            <div className="cdet-row">
              <span>Seats</span><strong>{selectedSeats.join(', ')}</strong>
            </div>
            <div className="cdet-row">
              <span>Passengers</span><strong>{confirmed.total_passengers}</strong>
            </div>
            <div className="cdet-divider" />
            <div className="cdet-row total">
              <span>Total Paid</span><strong>Rs.{confirmed.total_fare}</strong>
            </div>
          </div>

          <div className="confirmed-actions">
            <button className="btn-secondary" onClick={() => navigate('/my-bookings')}>View My Bookings</button>
            <button className="btn-primary" onClick={() => navigate('/')}>Book Another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <div className="booking-header">
        <button className="back-btn" onClick={() => navigate(-1)}>Back to Seats</button>
        <div>
          <h2>Passenger Details</h2>
          <p>{bus.origin_city} {'->'} {bus.destination_city} | Seats: {selectedSeats.join(', ')}</p>
        </div>
      </div>

      <div className="booking-content">
        <form onSubmit={handleSubmit} className="booking-form">
          {passengers.map((pax, idx) => (
            <div key={pax.seat_label} className="passenger-card">
              <div className="passenger-card-title">
                Passenger {idx + 1} - Seat <span className="seat-badge">{pax.seat_label}</span>
              </div>
              <div className="passenger-fields">
                <div className="field-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Rahul Sharma"
                    value={pax.name}
                    onChange={e => updatePassenger(idx, 'name', e.target.value)}
                    required
                  />
                </div>
                <div className="field-group">
                  <label>Age *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 28"
                    min="1"
                    max="120"
                    value={pax.age}
                    onChange={e => updatePassenger(idx, 'age', e.target.value)}
                    required
                  />
                </div>
                <div className="field-group">
                  <label>Gender *</label>
                  <select
                    className="form-input"
                    value={pax.gender}
                    onChange={e => updatePassenger(idx, 'gender', e.target.value)}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
            </div>
          ))}

          {error && <div className="booking-error">Warning: {error}</div>}

          <button type="submit" className="confirm-btn" disabled={loading}>
            {loading ? 'Confirming...' : `Confirm & Pay Rs.${totalFare}`}
          </button>
        </form>

        <aside className="booking-summary">
          <div className="summary-card">
            <h3>Fare Summary</h3>
            <div className="srow"><span>Route</span><span>{bus.origin_city} {'->'} {bus.destination_city}</span></div>
            <div className="srow"><span>Departure</span><span>{formatTime(bus.departure_time)}</span></div>
            <div className="srow"><span>Arrival</span><span>{formatTime(bus.arrival_time)}</span></div>
            <div className="srow"><span>Bus</span><span>{bus.bus_type_name}</span></div>
            <div className="srow"><span>Seats</span><span>{selectedSeats.join(', ')}</span></div>
            <div className="sdivider" />
            <div className="srow"><span>Rs.{bus.base_price} x {selectedSeats.length} seat(s)</span><span>Rs.{totalFare}</span></div>
            <div className="srow"><span>Convenience Fee</span><span>Rs.0</span></div>
            <div className="sdivider" />
            <div className="srow total"><span>Total</span><strong>Rs.{totalFare}</strong></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
