import { useEffect, useState } from 'react';
import { getPlatformAnalytics } from '../services/adminService';

// Reusable simple stat card
function StatCard({ title, value, icon, colorClass, trend, trendValue }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <div className="stat-title">{title}</div>
        <div className={`stat-icon ${colorClass}`}>{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {trendValue && (
        <div className={`stat-trend ${trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : 'trend-neutral'}`}>
          {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'} {trendValue} this month
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await getPlatformAnalytics();
      setStats(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ color: "var(--text-secondary)", marginTop: "20px" }}>Loading platform overview...</div>;
  }

  if (error) {
    return <div style={{ color: "var(--red-400)", marginTop: "20px" }}>⚠ {error}</div>;
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
        Platform Overview
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "32px" }}>
        Monitor your entire bus ticketing network and business health.
      </p>

      {/* Primary Stats Grid */}
      <div className="dashboard-grid">
        <StatCard 
          title="Total Users" 
          value={stats?.total_users || 0} 
          icon="👥" 
          colorClass="icon-blue"
          trend="up"
          trendValue="+12%"
        />
        <StatCard 
          title="Total Operators" 
          value={stats?.total_operators || 0} 
          icon="🏢" 
          colorClass="icon-amber"
          trend="up"
          trendValue="+2"
        />
        <StatCard 
          title="Total Bookings" 
          value={stats?.total_bookings || 0} 
          icon="🎫" 
          colorClass="icon-teal"
          trend="neutral"
          trendValue="0"
        />
        <StatCard 
          title="Total Revenue" 
          value={`₹${(stats?.total_revenue || 0).toLocaleString()}`} 
          icon="💳" 
          colorClass="icon-green"
          trend="neutral"
          trendValue="0%"
        />
      </div>

      <div className="section-title">
        <span style={{ fontSize: "20px" }}>⚡</span> Quick Actions
      </div>

      {/* Quick Action Cards */}
      <div className="quick-actions">
        <a href="/admin/operators" className="action-card">
          <div className="action-icon">🏢</div>
          <div className="action-text">
            <h3>Onboard Operator</h3>
            <p>Add a new bus travel agency to platform.</p>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--text-muted)" }}>→</div>
        </a>

        <a href="/admin/master/cities" className="action-card">
          <div className="action-icon">🏙️</div>
          <div className="action-text">
            <h3>Add Master City</h3>
            <p>Define new boarding/dropping points.</p>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--text-muted)" }}>→</div>
        </a>

        <a href="/admin/master/buses" className="action-card">
          <div className="action-icon">🚍</div>
          <div className="action-text">
            <h3>Add Bus Type</h3>
            <p>Define new seating layouts for fleets.</p>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--text-muted)" }}>→</div>
        </a>
      </div>
      
      {/* Just a decorative section to make dashboard look complete */}
      <div style={{ 
        background: "rgba(255,255,255,0.02)", 
        border: "1px solid var(--border-subtle)", 
        borderRadius: "16px",
        padding: "32px",
        textAlign: "center",
        backdropFilter: "blur(12px)"
      }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔥</div>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>
          Recent Activity & Logs
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
          Recent bookings and operator activities will appear here when live.
        </p>
      </div>

    </div>
  );
}
