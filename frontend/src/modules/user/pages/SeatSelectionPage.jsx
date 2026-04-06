import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSeatMap, getTripStops } from '../services/userService';
import './SeatSelectionPage.css';

export default function SeatSelectionPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { bus, date } = location.state || {};

  const [seatMap, setSeatMap] = useState(null);
  const [tripStops, setTripStops] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bus) {
      navigate('/');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [seatsRes, stopsRes] = await Promise.all([
        getSeatMap(bus.trip_id, bus.boarding_stop_id, bus.dropping_stop_id),
        getTripStops(bus.trip_id)
      ]);
      setSeatMap(seatsRes.data);
      setTripStops(stopsRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load seat map. Please go back and try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSeat = (label, status) => {
    if (status === 'occupied') return;
    setSelectedSeats(prev =>
      prev.includes(label) ? prev.filter(seat => seat !== label) : [...prev, label]
    );
  };

  const handleProceed = () => {
    if (selectedSeats.length === 0) {
      alert('Please select at least one seat.');
      return;
    }
    navigate(`/booking/${bus.trip_id}`, {
      state: {
        bus,
        selectedSeats,
        date,
      }
    });
  };

  const formatTime = (dt) =>
    new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const groupSeatsIntoRows = (seats, layout) => {
    const cols = layout === '2+2' ? 4 : layout === '2+1' ? 3 : 2;
    const rows = [];
    for (let index = 0; index < seats.length; index += cols) {
      rows.push(seats.slice(index, index + cols));
    }
    return rows;
  };

  if (!bus) return null;

  return (
    <div className="seat-page">
      <div className="seat-header">
        <button className="back-btn" onClick={() => navigate(-1)}>Back</button>
        <div className="seat-header-info">
          <span className="seat-journey">
            {bus.origin_city} {'->'} {bus.destination_city}
          </span>
          <span className="seat-bus-name">{bus.operator_name} | {bus.bus_type_name}</span>
          <span className="seat-timing">
            {formatTime(bus.departure_time)} {'->'} {formatTime(bus.arrival_time)} | {bus.duration_hours}h
          </span>
        </div>
        <div className="seat-price-info">
          <span className="seat-price-per">Rs.{bus.base_price} / seat</span>
        </div>
      </div>

      <div className="seat-content">
        <div className="seat-left">
          <div className="route-timeline-card">
            <h3 className="timeline-title">Full Route</h3>
            {tripStops.map((stop, idx) => {
              const isBoarding = stop.stop_id === bus.boarding_stop_id;
              const isDropping = stop.stop_id === bus.dropping_stop_id;
              const isInSegment =
                stop.stop_sequence >= bus.boarding_seq &&
                stop.stop_sequence <= bus.dropping_seq;

              return (
                <div key={stop.stop_id} className={`timeline-stop ${isInSegment ? 'in-segment' : 'out-of-segment'}`}>
                  <div className="timeline-dot-wrap">
                    <div className={`timeline-dot ${isBoarding ? 'dot-board' : isDropping ? 'dot-drop' : ''}`} />
                    {idx < tripStops.length - 1 && <div className="timeline-line" />}
                  </div>
                  <div className="timeline-info">
                    <div className="timeline-city">
                      {stop.city_name}
                      {isBoarding && <span className="badge-board">Boarding</span>}
                      {isDropping && <span className="badge-drop">Dropping</span>}
                    </div>
                    <div className="timeline-time">{formatTime(stop.arrival_time)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="seat-center">
          {loading ? (
            <div className="seat-loading">Loading seat map...</div>
          ) : error ? (
            <div className="seat-error">{error}</div>
          ) : (
            <div className="seat-map-card">
              <div className="seat-map-header">
                <h3>Select Your Seats</h3>
                <div className="seat-legend">
                  <span className="legend-item available">Available</span>
                  <span className="legend-item occupied">Occupied</span>
                  <span className="legend-item selected">Selected</span>
                </div>
              </div>

              <div className="bus-front">
                <span>BUS FRONT</span>
              </div>

              <div className="seat-grid">
                {seatMap && groupSeatsIntoRows(seatMap.seats, bus.bus_layout).map((row, rowIdx) => (
                  <div key={rowIdx} className="seat-row">
                    {row.map((seat, colIdx) => {
                      const isSelected = selectedSeats.includes(seat.label);
                      const isOccupied = seat.status === 'occupied';
                      const isAisleAfter = bus.bus_layout === '2+2' && colIdx === 1;
                      const isAisleAfter21 = bus.bus_layout === '2+1' && colIdx === 1;

                      return (
                        <div key={seat.label} style={{ display: 'flex', alignItems: 'center' }}>
                          <button
                            className={`seat-btn ${isOccupied ? 'seat-occupied' : isSelected ? 'seat-selected' : 'seat-available'}`}
                            onClick={() => toggleSeat(seat.label, seat.status)}
                            disabled={isOccupied}
                            title={`Seat ${seat.label} - ${seat.status}`}
                          >
                            {seat.label}
                          </button>
                          {(isAisleAfter || isAisleAfter21) && <div className="aisle-gap" />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {seatMap && (
                <div className="seat-map-footer">
                  {seatMap.available_count} of {seatMap.total_capacity} seats available for your journey
                </div>
              )}
            </div>
          )}
        </div>

        <div className="seat-right">
          <div className="seat-summary-card">
            <h3>Booking Summary</h3>

            <div className="summary-row">
              <span>Route</span>
              <span>{bus.origin_city} {'->'} {bus.destination_city}</span>
            </div>
            <div className="summary-row">
              <span>Departure</span>
              <span>{formatTime(bus.departure_time)}</span>
            </div>
            <div className="summary-row">
              <span>Arrival</span>
              <span>{formatTime(bus.arrival_time)}</span>
            </div>
            <div className="summary-row">
              <span>Seats Selected</span>
              <span>{selectedSeats.length === 0 ? '-' : selectedSeats.join(', ')}</span>
            </div>

            <div className="summary-divider" />

            <div className="summary-row total">
              <span>Total Fare</span>
              <span>Rs.{(bus.base_price * selectedSeats.length).toFixed(0)}</span>
            </div>

            <button
              className="proceed-btn"
              onClick={handleProceed}
              disabled={selectedSeats.length === 0}
            >
              Proceed to Book
            </button>

            {selectedSeats.length === 0 && (
              <p className="proceed-hint">Select at least 1 seat to continue</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
