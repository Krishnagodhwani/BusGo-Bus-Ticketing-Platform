import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminAlerts,
  getBookingsMonitoring,
  getMasterSummary,
  getPaymentLedger,
  getPlatformAnalytics,
} from '../services/adminService';

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

function MetricCard({ label, value, tone = 'blue', meta, spotlight = false }) {
  return (
    <div className={`admin-metric-card tone-${tone} ${spotlight ? 'spotlight' : ''}`}>
      <div className="admin-metric-label">{label}</div>
      <div className="admin-metric-value">{value}</div>
      <div className="admin-metric-meta">{meta}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [masterSummary, setMasterSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsRes, masterRes, ledgerRes, bookingsRes, alertsRes] = await Promise.all([
          getPlatformAnalytics(),
          getMasterSummary(),
          getPaymentLedger(),
          getBookingsMonitoring(),
          getAdminAlerts(),
        ]);
        setAnalytics(analyticsRes.data);
        setMasterSummary(masterRes.data);
        setLedger(ledgerRes.data.slice(0, 5));
        setBookings(bookingsRes.data.slice(0, 6));
        setAlerts(alertsRes.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load admin dashboard.');
      }
    };

    load();
  }, []);

  if (error) {
    return <div className="admin-inline-error">{error}</div>;
  }

  if (!analytics) {
    return <div className="admin-inline-loading">Loading platform overview...</div>;
  }

  const cancellationRate = analytics.total_bookings
    ? Math.round((analytics.total_cancellations / analytics.total_bookings) * 100)
    : 0;
  const refundPressure = analytics.total_bookings
    ? Math.round((analytics.pending_refunds / analytics.total_bookings) * 100)
    : 0;
  const masterCoverage = (masterSummary?.cities || 0) + (masterSummary?.bus_types || 0);
  const attentionScore = alerts.reduce((sum, item) => sum + item.count, 0);
  const pulseRows = [
    { label: 'Net revenue', value: formatCurrency(analytics.total_revenue), width: 100 },
    { label: 'Cancellation load', value: `${cancellationRate}%`, width: Math.min(Math.max(cancellationRate, 12), 100) },
    { label: 'Refund queue', value: `${analytics.pending_refunds}`, width: Math.min(Math.max(refundPressure, 10), 100) },
  ];

  return (
    <div className="admin-page-shell">
      <section className="admin-hero-panel premium">
        <div className="admin-hero-copy">
          <div className="admin-eyebrow">Admin command center</div>
          <h1 className="admin-page-title">Run the platform with a cleaner view of revenue, bookings, and operator activity.</h1>
          <p className="admin-page-copy">
            Keep the main admin view light, clear, and fast to scan while still giving your team direct access to
            onboarding, support, refunds, ledger review, and platform settings.
          </p>
          {alerts.length > 0 && (
            <div className="admin-hero-tags">
              {alerts.slice(0, 3).map((item) => (
                <span className={`admin-hero-tag tone-${item.severity}`} key={item.type}>
                  {item.title} ({item.count})
                </span>
              ))}
            </div>
          )}
          <div className="admin-hero-actions">
            <Link to="/admin/operators" className="admin-btn-primary">Onboard operator</Link>
            <Link to="/admin/bookings" className="admin-btn-outline">Review bookings</Link>
            <Link to="/admin/settings" className="admin-btn-outline">Open settings</Link>
          </div>
        </div>

        <div className="admin-hero-aside">
          <div className="admin-signal-card">
            <div className="admin-signal-header">
              <span className="admin-signal-kicker">Operational pulse</span>
              <span className="admin-signal-live">Live</span>
            </div>
            <div className="admin-signal-value">{analytics.active_trips}</div>
            <div className="admin-signal-copy">Upcoming active trips under admin visibility</div>
            <div className="admin-signal-grid">
              <div className="admin-signal-metric">
                <span>Pending refunds</span>
                <strong>{analytics.pending_refunds}</strong>
              </div>
              <div className="admin-signal-metric">
                <span>Attention items</span>
                <strong>{attentionScore}</strong>
              </div>
            </div>
            <div className="admin-pulse-bars">
              {pulseRows.map((item) => (
                <div className="admin-pulse-row" key={item.label}>
                  <div className="admin-pulse-label">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <div className="admin-pulse-track">
                    <div className="admin-pulse-fill" style={{ width: `${item.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-grid-two">
        <div className="admin-surface-card padded">
          <div className="admin-section-head compact">
            <div>
              <div className="admin-section-title">Attention needed</div>
              <div className="admin-section-copy">Live signals from onboarding, documents, support, and refunds.</div>
            </div>
          </div>
          <div className="admin-alert-grid">
            {alerts.length > 0 ? alerts.map((item) => (
              <div className={`admin-alert-card severity-${item.severity}`} key={item.type}>
                <div className="admin-alert-count">{item.count}</div>
                <div className="admin-alert-title">{item.title}</div>
                <div className="admin-alert-copy">{item.message}</div>
              </div>
            )) : (
              <div className="admin-table-empty">No alerts right now.</div>
            )}
          </div>
        </div>

        <div className="admin-surface-card padded">
          <div className="admin-section-head compact">
            <div>
              <div className="admin-section-title">Today at a glance</div>
              <div className="admin-section-copy">Three quick numbers your team can check before opening deeper modules.</div>
            </div>
          </div>
          <div className="admin-summary-band">
            <div className="admin-summary-item">
              <span>Master coverage</span>
              <strong>{masterCoverage}</strong>
            </div>
            <div className="admin-summary-item">
              <span>Bookings live</span>
              <strong>{analytics.total_bookings}</strong>
            </div>
            <div className="admin-summary-item">
              <span>Revenue booked</span>
              <strong>{formatCurrency(analytics.total_revenue)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-stats-grid premium">
        <MetricCard label="Total Revenue" value={formatCurrency(analytics.total_revenue)} meta="Net after refunds" tone="green" spotlight />
        <MetricCard label="Total Bookings" value={analytics.total_bookings} meta="All booking transactions" tone="teal" spotlight />
        <MetricCard label="Total Operators" value={analytics.total_operators} meta="Registered operator accounts" tone="amber" />
        <MetricCard label="Total Users" value={analytics.total_users} meta="Passenger accounts on platform" tone="blue" />
        <MetricCard label="Total Cancellations" value={analytics.total_cancellations} meta="Cancelled or refunded trips" tone="red" />
        <MetricCard label="Pending Refunds" value={analytics.pending_refunds} meta={`${cancellationRate}% cancellation pressure`} tone="slate" />
      </section>

      <section className="admin-dashboard-ribbon">
        <div className="admin-ribbon-card">
          <span className="admin-ribbon-label">Revenue health</span>
          <strong>{formatCurrency(analytics.total_revenue)}</strong>
          <p>Platform net revenue after refunds and booking reversals.</p>
        </div>
        <div className="admin-ribbon-card">
          <span className="admin-ribbon-label">Cancellation rate</span>
          <strong>{cancellationRate}%</strong>
          <p>Share of bookings ending in cancellation or refund.</p>
        </div>
        <div className="admin-ribbon-card">
          <span className="admin-ribbon-label">Refund queue pressure</span>
          <strong>{refundPressure}%</strong>
          <p>Pending refund load relative to total booking volume.</p>
        </div>
      </section>

      <section className="admin-grid-two">
        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Master Data Snapshot</div>
              <div className="admin-section-copy">Quick scan of route-building dependencies.</div>
            </div>
          </div>
          <div className="admin-mini-metrics">
            <div className="admin-mini-metric"><span>Cities</span><strong>{masterSummary?.cities || 0}</strong></div>
            <div className="admin-mini-metric"><span>Bus Types</span><strong>{masterSummary?.bus_types || 0}</strong></div>
            <div className="admin-mini-metric"><span>Route Stops</span><strong>{masterSummary?.route_stops || 0}</strong></div>
          </div>
          <div className="admin-cta-list">
            <Link to="/admin/master/cities" className="admin-cta-link">Manage city masters</Link>
            <Link to="/admin/master/buses" className="admin-cta-link">Manage bus type masters</Link>
            <Link to="/admin/settings" className="admin-cta-link">Tune platform settings and policy</Link>
          </div>
        </div>

        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Priority Queue</div>
              <div className="admin-section-copy">Fast access to the areas that usually need admin attention first.</div>
            </div>
          </div>
          <div className="admin-list-stack">
            <div className="admin-list-row">
              <div>
                <div className="admin-row-title">Refund review queue</div>
                <div className="admin-row-meta">Monitor booking disputes and release refunds quickly.</div>
              </div>
              <div className="admin-row-right">
                <span className="admin-status-pill neutral">{analytics.pending_refunds} open</span>
                <Link to="/admin/bookings" className="admin-text-link">Open</Link>
              </div>
            </div>
            <div className="admin-list-row">
              <div>
                <div className="admin-row-title">Operator account controls</div>
                <div className="admin-row-meta">Adjust account status, role level, and onboarding progress.</div>
              </div>
              <div className="admin-row-right">
                <span className="admin-status-pill confirmed">{analytics.total_operators} operators</span>
                <Link to="/admin/operators" className="admin-text-link">Open</Link>
              </div>
            </div>
            <div className="admin-list-row">
              <div>
                <div className="admin-row-title">Revenue and commission settings</div>
                <div className="admin-row-meta">Review payout assumptions, fees, and policy configuration.</div>
              </div>
              <div className="admin-row-right">
                <span className="admin-status-pill neutral">Config</span>
                <Link to="/admin/settings" className="admin-text-link">Open</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-grid-two">
        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Recent Booking Monitoring</div>
              <div className="admin-section-copy">Latest booking activity with status visibility.</div>
            </div>
            <Link to="/admin/bookings" className="admin-text-link">Open full monitor</Link>
          </div>
          <div className="admin-list-stack">
            {bookings.map((item) => (
              <div className="admin-list-row" key={item.id}>
                <div>
                  <div className="admin-row-title">{item.booking_ref} - {item.passenger_name || 'Passenger'}</div>
                  <div className="admin-row-meta">{item.operator_name || 'Operator'} - {item.origin_city} to {item.destination_city}</div>
                </div>
                <div className="admin-row-right">
                  <span className={`admin-status-pill ${item.booking_status?.toLowerCase()}`}>{item.booking_status}</span>
                  <strong>{formatCurrency(item.total_fare)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Ledger Highlights</div>
              <div className="admin-section-copy">Recent transactions and operator payout impact.</div>
            </div>
            <Link to="/admin/payments" className="admin-text-link">View payment ledger</Link>
          </div>
          <div className="admin-list-stack">
            {ledger.map((item) => (
              <div className="admin-list-row" key={item.booking_id}>
                <div>
                  <div className="admin-row-title">{item.booking_ref}</div>
                  <div className="admin-row-meta">{item.operator_name || 'Operator'} - Payout {formatCurrency(item.operator_payout)}</div>
                </div>
                <div className="admin-row-right">
                  <span className={`admin-status-pill ${item.booking_status?.toLowerCase()}`}>{item.booking_status}</span>
                  <strong>{formatCurrency(item.total_fare)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
