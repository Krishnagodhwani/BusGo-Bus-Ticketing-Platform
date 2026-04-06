import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  exportDailyOperationsReport,
  getOperatorAlerts,
  getOperatorDashboardSummary,
  getOperatorNotifications,
  getOperatorNotificationSummary,
  markAllOperatorNotificationsRead,
  markOperatorNotificationRead,
  updateOperatorNotificationStatus,
} from '../services/operatorService';
import { getUser } from '../../../store/authStore';
import './OperatorWorkspace.css';

const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

export default function OperatorDashboard() {
  const user = getUser();
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationSummary, setNotificationSummary] = useState(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, [showUnreadOnly]);

  const loadSummary = async () => {
    try {
      const [summaryRes, alertsRes, notificationsRes, notificationSummaryRes] = await Promise.all([
        getOperatorDashboardSummary(),
        getOperatorAlerts(),
        getOperatorNotifications({ limit: 8, unread_only: showUnreadOnly }),
        getOperatorNotificationSummary(),
      ]);
      setSummary(summaryRes.data);
      setAlerts(alertsRes.data);
      setNotifications(notificationsRes.data);
      setNotificationSummary(notificationSummaryRes.data);
    } catch (error) {
      console.error('Failed to load operator dashboard summary', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDailyReportExport = async () => {
    try {
      const response = await exportDailyOperationsReport();
      saveBlob(response.data, 'daily-operations-report.csv');
    } catch (error) {
      console.error('Failed to export daily operations report', error);
    }
  };

  const handleMarkRead = async (notificationId) => {
    try {
      await markOperatorNotificationRead(notificationId);
      loadSummary();
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllOperatorNotificationsRead();
      loadSummary();
    } catch (error) {
      console.error('Failed to mark all notifications as read', error);
    }
  };

  const handleDeliveryStatusUpdate = async (notificationId, delivery_status) => {
    try {
      await updateOperatorNotificationStatus(notificationId, { delivery_status });
      loadSummary();
    } catch (error) {
      console.error('Failed to update notification delivery status', error);
    }
  };

  if (loading) {
    return <div className="operator-page">Loading operator workspace...</div>;
  }

  const checklist = [
    { label: 'Add at least one bus', done: (summary?.total_buses || 0) > 0, href: '/operator/buses' },
    { label: 'Create reusable route network', done: (summary?.total_routes || 0) > 0, href: '/operator/routes' },
    { label: 'Schedule your next trip', done: (summary?.upcoming_trips || 0) > 0, href: '/operator/trips' },
    { label: 'Manage incoming passenger bookings', done: true, href: '/operator/bookings' },
    { label: 'Track collections and refunds', done: true, href: '/operator/financials' },
  ];

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">Operator Control Center</h1>
          <div className="operator-page-subtitle">
            Welcome back, {user?.name || 'Operator'}. This workspace is designed around the real operating flow:
            prepare fleet, build reusable routes, then launch schedules without repetitive manual work.
          </div>
        </div>
        <div className="operator-action-row">
          <Link to="/operator/buses" className="operator-secondary-btn">Manage Fleet</Link>
          <Link to="/operator/routes" className="operator-secondary-btn">Build Routes</Link>
          <Link to="/operator/trips" className="operator-primary-btn">Schedule Trips</Link>
          <Link to="/operator/bookings" className="operator-secondary-btn">Passenger Bookings</Link>
          <Link to="/operator/financials" className="operator-secondary-btn">Financials</Link>
        </div>
      </div>

      <div className="operator-kpi-grid">
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Fleet Ready</div>
          <div className="operator-kpi-value">{summary?.total_buses || 0}</div>
          <div className="operator-kpi-meta">{summary?.active_buses || 0} active, {summary?.maintenance_buses || 0} in maintenance</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Reusable Routes</div>
          <div className="operator-kpi-value">{summary?.total_routes || 0}</div>
          <div className="operator-kpi-meta">{summary?.active_routes || 0} active route templates</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Upcoming Trips</div>
          <div className="operator-kpi-value">{summary?.upcoming_trips || 0}</div>
          <div className="operator-kpi-meta">Across one-time and recurring schedules</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Recurring Series</div>
          <div className="operator-kpi-value">{summary?.recurring_series || 0}</div>
          <div className="operator-kpi-meta">Saved scheduling patterns currently active</div>
        </div>
      </div>

      <div className="operator-kpi-grid">
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Today&apos;s Departures</div>
          <div className="operator-kpi-value">{summary?.todays_departures || 0}</div>
          <div className="operator-kpi-meta">Trips scheduled for today</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Delayed Trips</div>
          <div className="operator-kpi-value">{summary?.delayed_trips || 0}</div>
          <div className="operator-kpi-meta">Trips needing live attention</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Pending Payments</div>
          <div className="operator-kpi-value">{summary?.pending_payment_bookings || 0}</div>
          <div className="operator-kpi-meta">Bookings not fully settled</div>
        </div>
        <div className="operator-kpi-card">
          <div className="operator-kpi-label">Open Support Issues</div>
          <div className="operator-kpi-value">{summary?.open_issue_bookings || 0}</div>
          <div className="operator-kpi-meta">Bookings flagged for support follow-up</div>
        </div>
      </div>

      <div className="operator-grid-two">
        <div className="operator-panel-card">
          <div className="operator-page-title" style={{ fontSize: '22px' }}>Operator Workflow</div>
          <div className="operator-page-subtitle" style={{ marginBottom: '18px' }}>
            The dashboard now guides operators in the same order they usually work in real life.
          </div>
          <div className="operator-checklist">
            {checklist.map((item) => (
              <Link key={item.label} to={item.href} className="operator-checklist-item">
                <span className={`operator-checklist-dot ${item.done ? 'done' : ''}`}></span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="operator-panel-card">
          <div className="operator-page-title" style={{ fontSize: '22px' }}>Next Operational Focus</div>
          {summary?.next_trip ? (
            <div className="operator-list" style={{ marginTop: '18px' }}>
              <div className="operator-record">
                <div className="operator-record-main">
                  <div className="operator-record-title">{summary.next_trip.route_name}</div>
                  <div className="operator-record-subtitle">
                    Bus: {summary.next_trip.bus_name} ({summary.next_trip.bus_reg_number})
                  </div>
                  <div className="operator-chip-row">
                    <span className="operator-chip route">{summary.next_trip.status}</span>
                    {summary.next_trip.series_code && <span className="operator-chip info">Recurring series</span>}
                  </div>
                </div>
                <div className="operator-record-actions">
                  <div className="operator-stat-box">
                    <div className="operator-stat-box-label">Departure</div>
                    <div className="operator-stat-box-value">
                      {new Date(summary.next_trip.departure_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <Link to="/operator/trips" className="operator-primary-btn">Open Scheduler</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="operator-empty-card" style={{ marginTop: '18px' }}>
              <div className="operator-empty-title">No upcoming trips yet</div>
              <div className="operator-empty-copy">
                Once your buses and routes are ready, create one-time or recurring schedules here.
              </div>
              <Link to="/operator/trips" className="operator-primary-btn">Create First Schedule</Link>
            </div>
          )}
        </div>
      </div>

      <div className="operator-panel-card">
        <div className="operator-page-title" style={{ fontSize: '22px' }}>Daily Shortcuts</div>
        <div className="operator-page-subtitle" style={{ marginBottom: '18px' }}>
          Built for dispatch and support staff who need to move fast during live operations.
        </div>
        <div className="operator-action-row">
          <Link to="/operator/trips" className="operator-primary-btn">Open Live Trip Ops</Link>
          <Link to="/operator/bookings" className="operator-secondary-btn">Search PNR / Phone</Link>
          <Link to="/operator/bookings" className="operator-secondary-btn">Print Passenger Manifest</Link>
          <Link to="/operator/financials" className="operator-secondary-btn">See Today&apos;s Collections</Link>
          <button className="operator-secondary-btn" onClick={handleDailyReportExport}>Export Daily Report</button>
        </div>
      </div>

      <div className="operator-panel-card">
        <div className="operator-page-title" style={{ fontSize: '22px' }}>Attention Center</div>
        <div className="operator-page-subtitle" style={{ marginBottom: '18px' }}>
          Alerts are generated from live trips, payment states, and support flags so staff know what needs attention first.
        </div>
        {alerts.length === 0 ? (
          <div className="operator-inline-note">No active alerts right now. Operations look healthy.</div>
        ) : (
          <div className="operator-preview-list">
            {alerts.map((alert) => (
              <Link key={`${alert.type}-${alert.title}`} to={alert.href || '/operator/dashboard'} className={`operator-alert-tile ${alert.severity}`}>
                <div>
                  <div className="operator-alert-title">{alert.title}</div>
                  <div className="operator-alert-copy">{alert.message}</div>
                </div>
                <div className="operator-alert-count">{alert.count || 0}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="operator-panel-card">
        <div className="operator-page-title" style={{ fontSize: '22px' }}>Recent Activity</div>
        <div className="operator-page-subtitle" style={{ marginBottom: '18px' }}>
          A running operational log of ticket resend actions, support updates, trip controls, and cancellations.
        </div>
        <div className="operator-kpi-grid" style={{ marginBottom: '18px' }}>
          <div className="operator-kpi-card">
            <div className="operator-kpi-label">Unread</div>
            <div className="operator-kpi-value">{notificationSummary?.unread_notifications || 0}</div>
            <div className="operator-kpi-meta">Needs review</div>
          </div>
          <div className="operator-kpi-card">
            <div className="operator-kpi-label">Prepared</div>
            <div className="operator-kpi-value">{notificationSummary?.prepared_notifications || 0}</div>
            <div className="operator-kpi-meta">Queued for delivery integration</div>
          </div>
          <div className="operator-kpi-card">
            <div className="operator-kpi-label">Delivered</div>
            <div className="operator-kpi-value">{notificationSummary?.delivered_notifications || 0}</div>
            <div className="operator-kpi-meta">Marked complete</div>
          </div>
          <div className="operator-kpi-card">
            <div className="operator-kpi-label">Failed</div>
            <div className="operator-kpi-value">{notificationSummary?.failed_notifications || 0}</div>
            <div className="operator-kpi-meta">Needs retry or fallback</div>
          </div>
        </div>
        <div className="operator-action-row" style={{ marginBottom: '14px' }}>
          <button className="operator-secondary-btn" onClick={() => setShowUnreadOnly((current) => !current)}>
            {showUnreadOnly ? 'Show All Activity' : 'Show Unread Only'}
          </button>
          <button className="operator-secondary-btn" onClick={handleMarkAllRead}>Mark All Read</button>
        </div>
        {notifications.length === 0 ? (
          <div className="operator-inline-note">No recent operator actions recorded yet.</div>
        ) : (
          <div className="operator-preview-list">
            {notifications.map((item) => (
              <div key={item.id} className={`operator-preview-row ${item.is_read ? '' : 'operator-preview-row-unread'}`}>
                <span>
                  <strong>{item.title}</strong>
                  <br />
                  <span className="operator-muted-copy">{item.message}</span>
                  <br />
                  <span className="operator-muted-copy">
                    {(item.channel || 'IN_APP')} | {(item.delivery_status || 'IN_APP')} {item.recipient ? `| ${item.recipient}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {item.href && <Link to={item.href} className="operator-ghost-btn">Open</Link>}
                  {!item.is_read && <button className="operator-ghost-btn" onClick={() => handleMarkRead(item.id)}>Mark Read</button>}
                  {item.delivery_status === 'PREPARED' && <button className="operator-ghost-btn" onClick={() => handleDeliveryStatusUpdate(item.id, 'DELIVERED')}>Mark Delivered</button>}
                  {item.delivery_status === 'PREPARED' && <button className="operator-ghost-btn" onClick={() => handleDeliveryStatusUpdate(item.id, 'FAILED')}>Mark Failed</button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
