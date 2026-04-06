import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchBuses, getPublicCities } from '../services/userService';

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const originId = searchParams.get('origin');
  const destId = searchParams.get('destination');
  const date = searchParams.get('date');

  const [results, setResults] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterAC, setFilterAC] = useState(false);
  const [filterNonAC, setFilterNonAC] = useState(false);
  const [filterSleeper, setFilterSleeper] = useState(false);
  const [filterSeater, setFilterSeater] = useState(false);
  const [sortBy, setSortBy] = useState('price_low');

  const [searchOrigin, setSearchOrigin] = useState(originId || '');
  const [searchDest, setSearchDest] = useState(destId || '');
  const [searchDate, setSearchDate] = useState(date || '');

  useEffect(() => {
    getPublicCities().then(res => setCities(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (originId && destId && date) fetchResults();
  }, [originId, destId, date]);

  const fetchResults = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await searchBuses(originId, destId, date);
      setResults(res.data);
    } catch (err) {
      setError('Failed to load results. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReSearch = (e) => {
    e.preventDefault();
    if (searchOrigin === searchDest) {
      alert('Origin and Destination cannot be the same!');
      return;
    }
    navigate(`/search?origin=${searchOrigin}&destination=${searchDest}&date=${searchDate}`);
  };

  const handleBookNow = (bus) => {
    navigate(`/select-seats/${bus.trip_id}`, {
      state: {
        bus,
        originId,
        destId,
        date,
      }
    });
  };

  const getCityName = (id) => cities.find(c => c.id === parseInt(id, 10))?.name || '...';
  const formatTime = (dt) => new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const formatDate = (dt) => new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  let filtered = [...results];
  if (filterAC) filtered = filtered.filter(r => r.has_ac);
  if (filterNonAC) filtered = filtered.filter(r => !r.has_ac);
  if (filterSleeper) filtered = filtered.filter(r => r.has_sleeper);
  if (filterSeater) filtered = filtered.filter(r => !r.has_sleeper);

  if (sortBy === 'price_low') filtered.sort((a, b) => a.base_price - b.base_price);
  if (sortBy === 'price_high') filtered.sort((a, b) => b.base_price - a.base_price);
  if (sortBy === 'departure') filtered.sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
  if (sortBy === 'duration') filtered.sort((a, b) => a.duration_hours - b.duration_hours);

  return (
    <div>
      <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)', padding: '16px 40px' }}>
        <form onSubmit={handleReSearch} style={{ display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '900px', margin: '0 auto' }}>
          <select className="form-input" style={{ flex: 1 }} value={searchOrigin} onChange={e => setSearchOrigin(e.target.value)}>
            <option value="" disabled>From</option>
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{'->'}</span>
          <select className="form-input" style={{ flex: 1 }} value={searchDest} onChange={e => setSearchDest(e.target.value)}>
            <option value="" disabled>To</option>
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" className="form-input" style={{ flex: 0.8 }} value={searchDate} onChange={e => setSearchDate(e.target.value)} />
          <button type="submit" className="search-btn" style={{ padding: '14px 24px', fontSize: '14px' }}>Search</button>
        </form>
      </div>

      <div className="results-container">
        <aside className="results-filters">
          <div className="filter-card">
            <div className="filter-title">Filters</div>

            <div className="filter-group">
              <div className="filter-group-label">Bus Type</div>
              <div className="filter-option">
                <input type="checkbox" id="fac" checked={filterAC} onChange={() => { setFilterAC(!filterAC); setFilterNonAC(false); }} />
                <label htmlFor="fac">AC Only</label>
              </div>
              <div className="filter-option">
                <input type="checkbox" id="fnac" checked={filterNonAC} onChange={() => { setFilterNonAC(!filterNonAC); setFilterAC(false); }} />
                <label htmlFor="fnac">Non-AC Only</label>
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-group-label">Seating</div>
              <div className="filter-option">
                <input type="checkbox" id="fsl" checked={filterSleeper} onChange={() => { setFilterSleeper(!filterSleeper); setFilterSeater(false); }} />
                <label htmlFor="fsl">Sleeper</label>
              </div>
              <div className="filter-option">
                <input type="checkbox" id="fse" checked={filterSeater} onChange={() => { setFilterSeater(!filterSeater); setFilterSleeper(false); }} />
                <label htmlFor="fse">Seater</label>
              </div>
            </div>
          </div>
        </aside>

        <div className="results-list">
          <div className="results-header">
            <div className="results-count">
              <strong>{getCityName(originId)}</strong> {'->'} <strong>{getCityName(destId)}</strong>
              {' | '}{formatDate(`${date}T00:00:00`)}
              {' | '}<strong>{filtered.length}</strong> buses found
            </div>
            <div className="results-sort">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="departure">Departure: Earliest</option>
                <option value="duration">Duration: Shortest</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="no-results">
              <h3>Warning: {error}</h3>
            </div>
          )}

          {loading ? (
            <div className="no-results">
              <h3>Searching buses...</h3>
              <p>Finding the best options for your journey.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="no-results">
              <h3>No buses found</h3>
              <p>Try a different date or route. Operators add new trips daily!</p>
            </div>
          ) : (
            filtered.map(bus => (
              <div className="bus-card" key={bus.trip_id}>
                <div className="bus-card-left">
                  <div className="bus-operator-name">{bus.operator_name}</div>
                  <div className="bus-type-tag">
                    {bus.bus_type_name} | {bus.bus_layout}
                  </div>
                  <div className="amenity-tags">
                    {bus.has_ac
                      ? <span className="amenity-tag ac">A/C</span>
                      : <span className="amenity-tag nonac">Non-AC</span>}
                    {bus.has_sleeper
                      ? <span className="amenity-tag sleeper">Sleeper</span>
                      : <span className="amenity-tag seater">Seater</span>}
                  </div>
                  <div className="bus-timing" style={{ marginTop: '12px' }}>
                    <div>
                      <div className="bus-time">{formatTime(bus.departure_time)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{bus.origin_city}</div>
                    </div>
                    <div className="bus-duration">
                      <div className="bus-duration-text">{bus.duration_hours}h</div>
                      <div className="bus-duration-line"></div>
                    </div>
                    <div>
                      <div className="bus-time">{formatTime(bus.arrival_time)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{bus.destination_city}</div>
                    </div>
                  </div>
                </div>
                <div className="bus-card-right">
                  <div>
                    <div className="bus-price">Rs.{bus.base_price}</div>
                    <div className="bus-seats-left">{bus.available_seats} seats left</div>
                  </div>
                  <button className="bus-book-btn" onClick={() => handleBookNow(bus)}>
                    Select Seats
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
