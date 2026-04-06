import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicCities } from '../services/userService';

export default function HomePage() {
  const [cities, setCities] = useState([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getPublicCities().then(res => setCities(res.data)).catch(console.error);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().split('T')[0]);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!origin || !destination || !date) return;
    if (origin === destination) {
      alert('Origin and Destination cannot be the same!');
      return;
    }
    navigate(`/search?origin=${origin}&destination=${destination}&date=${date}`);
  };

  const popularRoutes = [
    { from: 'Jaipur', to: 'Jodhpur', price: 'Rs.500+', time: '~5.5 hrs' },
    { from: 'Udaipur', to: 'Jaipur', price: 'Rs.600+', time: '~6 hrs' },
    { from: 'Jaipur', to: 'Ajmer', price: 'Rs.300+', time: '~2.5 hrs' },
    { from: 'Jodhpur', to: 'Udaipur', price: 'Rs.450+', time: '~5 hrs' },
  ];

  return (
    <div>
      <section className="hero-section">
        <h1 className="hero-title">Book Bus Tickets<br />Across Rajasthan</h1>
        <p className="hero-subtitle">
          Fast, reliable, and affordable bus travel. Search thousands of routes and book in seconds.
        </p>

        <form className="search-card" onSubmit={handleSearch}>
          <div className="search-grid">
            <div className="search-field">
              <label>From</label>
              <select value={origin} onChange={e => setOrigin(e.target.value)} required>
                <option value="" disabled>Select Origin</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="search-field">
              <label>To</label>
              <select value={destination} onChange={e => setDestination(e.target.value)} required>
                <option value="" disabled>Select Destination</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="search-field">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} required />
            </div>
            <button type="submit" className="search-btn">
              Search Buses
            </button>
          </div>
        </form>
      </section>

      <section className="popular-section">
        <h2 className="section-title">Popular Routes in Rajasthan</h2>
        <div className="popular-grid">
          {popularRoutes.map((route, index) => (
            <div className="popular-card" key={index}>
              <div className="popular-route">{route.from} {'->'} {route.to}</div>
              <div className="popular-meta">Starting at {route.price} | {route.time}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
