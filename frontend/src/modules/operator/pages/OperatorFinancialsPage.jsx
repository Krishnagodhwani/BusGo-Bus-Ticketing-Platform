import { useEffect, useMemo, useState } from 'react';
import {
  exportCancellationsRefundsReport,
  exportDailyOperationsReport,
  exportFinancialTransactions,
  exportRoutePerformanceReport,
  getFinancialPerformance,
  getFinancialSummary,
  getFinancialTransactions,
  getFinancialTrends,
} from '../services/operatorService';
import './OperatorWorkspace.css';

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

export default function OperatorFinancialsPage() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [trends, setTrends] = useState([]);
  const [performance, setPerformance] = useState({ routes: [], buses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    route_id: '',
    trip_id: '',
    bus_id: '',
    payment_status: '',
  });

  useEffect(() => {
    loadFinancialData();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [filters]);

  const loadFinancialData = async () => {
    try {
      setLoading(true);
      const [summaryRes, trendRes, performanceRes] = await Promise.all([
        getFinancialSummary(),
        getFinancialTrends(),
        getFinancialPerformance(),
      ]);
      setSummary(summaryRes.data);
      setTrends(trendRes.data);
      setPerformance(performanceRes.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load financial dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const response = await getFinancialTransactions(params);
      setTransactions(response.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load financial transactions.');
    }
  };

  const handleExport = async () => {
    try {
      const response = await exportFinancialTransactions();
      downloadBlob(response.data, 'operator-financial-transactions.csv');
    } catch (requestError) {
      setError('Failed to export financial transactions.');
    }
  };

  const handleDailyOpsExport = async () => {
    try {
      const response = await exportDailyOperationsReport();
      downloadBlob(response.data, 'daily-operations-report.csv');
    } catch (requestError) {
      setError('Failed to export daily operations report.');
    }
  };

  const handleRefundReportExport = async () => {
    try {
      const response = await exportCancellationsRefundsReport();
      downloadBlob(response.data, 'cancellations-refunds-report.csv');
    } catch (requestError) {
      setError('Failed to export cancellations and refunds report.');
    }
  };

  const handleRoutePerformanceExport = async () => {
    try {
      const response = await exportRoutePerformanceReport();
      downloadBlob(response.data, 'route-performance-report.csv');
    } catch (requestError) {
      setError('Failed to export route performance report.');
    }
  };

  const topRoutes = useMemo(() => (performance.routes || []).slice(0, 5), [performance]);
  const topBuses = useMemo(() => (performance.buses || []).slice(0, 5), [performance]);

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">Financials</h1>
          <div className="operator-page-subtitle">
            A simple money console for operators: see revenue, refunds, route performance, collections, and exportable
            transaction reports without needing finance-heavy workflows.
          </div>
        </div>
        <div className="operator-action-row">
          <button className="operator-secondary-btn" onClick={handleExport}>Export Transactions</button>
          <button className="operator-secondary-btn" onClick={handleDailyOpsExport}>Daily Ops Report</button>
          <button className="operator-secondary-btn" onClick={handleRefundReportExport}>Refund Report</button>
          <button className="operator-secondary-btn" onClick={handleRoutePerformanceExport}>Route Performance</button>
        </div>
      </div>

      {error && <div className="operator-alert error">{error}</div>}

      {loading ? (
        <div className="operator-empty-card">Loading financial dashboard...</div>
      ) : (
        <>
          <div className="operator-kpi-grid">
            <div className="operator-kpi-card"><div className="operator-kpi-label">Gross Collections</div><div className="operator-kpi-value">Rs. {Math.round(summary?.gross_collections || 0)}</div><div className="operator-kpi-meta">Before refunds and adjustments</div></div>
            <div className="operator-kpi-card"><div className="operator-kpi-label">Net Collections</div><div className="operator-kpi-value">Rs. {Math.round(summary?.net_collections || 0)}</div><div className="operator-kpi-meta">After refunds</div></div>
            <div className="operator-kpi-card"><div className="operator-kpi-label">Today / Week / Month</div><div className="operator-kpi-value">Rs. {Math.round(summary?.today_earnings || 0)}</div><div className="operator-kpi-meta">Week Rs. {Math.round(summary?.week_earnings || 0)} • Month Rs. {Math.round(summary?.month_earnings || 0)}</div></div>
            <div className="operator-kpi-card"><div className="operator-kpi-label">Avg Ticket Value</div><div className="operator-kpi-value">Rs. {Math.round(summary?.average_ticket_value || 0)}</div><div className="operator-kpi-meta">{summary?.occupancy_percent || 0}% occupancy with {summary?.paid_bookings || 0} paid bookings</div></div>
          </div>

          <div className="operator-kpi-grid">
            <div className="operator-kpi-card"><div className="operator-kpi-label">Platform Commission</div><div className="operator-kpi-value">Rs. {Math.round(summary?.platform_commission_amount || 0)}</div><div className="operator-kpi-meta">Applied to online/admin collections</div></div>
            <div className="operator-kpi-card"><div className="operator-kpi-label">Tax Estimate</div><div className="operator-kpi-value">Rs. {Math.round(summary?.tax_amount || 0)}</div><div className="operator-kpi-meta">Estimated GST on commission</div></div>
            <div className="operator-kpi-card"><div className="operator-kpi-label">Operator Payout</div><div className="operator-kpi-value">Rs. {Math.round(summary?.operator_payout_amount || 0)}</div><div className="operator-kpi-meta">After refunds, commission, and tax</div></div>
            <div className="operator-kpi-card"><div className="operator-kpi-label">Online / Manual</div><div className="operator-kpi-value">Rs. {Math.round(summary?.online_collections || 0)}</div><div className="operator-kpi-meta">Manual Rs. {Math.round(summary?.manual_collections || 0)}</div></div>
          </div>

          <div className="operator-grid-two operator-grid-balanced">
            <div className="operator-panel-shell">
              <div className="operator-section-heading">Revenue Trend</div>
              <div className="operator-preview-list">
                {(trends || []).slice(-8).map((point) => (
                  <div key={point.label} className="operator-preview-row">
                    <span>{point.label}</span>
                    <span>Rs. {Math.round(point.revenue)} • {point.bookings} bookings</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="operator-panel-shell">
              <div className="operator-section-heading">Money Watchlist</div>
              <div className="operator-preview-list">
                <div className="operator-preview-row"><span>Refunded Amount</span><span>Rs. {Math.round(summary?.refunded_amount || 0)}</span></div>
                <div className="operator-preview-row"><span>Cancelled Booking Loss</span><span>Rs. {Math.round(summary?.cancelled_loss || 0)}</span></div>
                <div className="operator-preview-row"><span>Pending Settlement</span><span>Rs. {Math.round(summary?.pending_settlement_amount || 0)}</span></div>
                <div className="operator-preview-row"><span>Commission + Tax</span><span>Rs. {Math.round((summary?.platform_commission_amount || 0) + (summary?.tax_amount || 0))}</span></div>
              </div>
            </div>
          </div>

          <div className="operator-grid-two operator-grid-balanced">
            <div className="operator-panel-shell">
              <div className="operator-section-heading">Top Routes by Revenue</div>
              <div className="operator-preview-list">
                {topRoutes.length === 0 ? <div className="operator-inline-note">No route revenue data yet.</div> : topRoutes.map((item) => (
                  <div key={item.name} className="operator-preview-row">
                    <span>{item.name}</span>
                    <span>Rs. {Math.round(item.revenue)} • {item.bookings} bookings</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="operator-panel-shell">
              <div className="operator-section-heading">Best Buses by Revenue</div>
              <div className="operator-preview-list">
                {topBuses.length === 0 ? <div className="operator-inline-note">No bus revenue data yet.</div> : topBuses.map((item) => (
                  <div key={item.name} className="operator-preview-row">
                    <span>{item.name}</span>
                    <span>Rs. {Math.round(item.revenue)} • {item.occupancy_percent}% occupancy</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="operator-panel-shell">
            <div className="operator-section-heading">Report Hub</div>
            <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
              Export the most-used transport business reports for accounts, support, and daily operational review.
            </div>
            <div className="operator-grid-two operator-grid-balanced">
              <div className="operator-preview-row">
                <span>Daily operations report</span>
                <button className="operator-secondary-btn" onClick={handleDailyOpsExport}>Export</button>
              </div>
              <div className="operator-preview-row">
                <span>Cancellations and refunds</span>
                <button className="operator-secondary-btn" onClick={handleRefundReportExport}>Export</button>
              </div>
              <div className="operator-preview-row">
                <span>Route performance report</span>
                <button className="operator-secondary-btn" onClick={handleRoutePerformanceExport}>Export</button>
              </div>
              <div className="operator-preview-row">
                <span>Full transactions ledger</span>
                <button className="operator-secondary-btn" onClick={handleExport}>Export</button>
              </div>
            </div>
          </div>

          <div className="operator-panel-card">
            <div className="operator-toolbar">
              <div className="operator-toolbar-group">
                <input className="form-input operator-search" placeholder="Search PNR, ticket, passenger, route" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
                <select className="form-input" value={filters.payment_status} onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })}>
                  <option value="">All payment states</option>
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                  <option value="REFUNDED">Refunded</option>
                  <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
                </select>
              </div>
              <div className="operator-page-subtitle" style={{ marginTop: 0 }}>
                Transactions are built directly from booking collections and refunds so operators can trace every rupee back to the trip.
              </div>
            </div>
          </div>

          <div className="operator-list">
            {transactions.length === 0 ? (
              <div className="operator-empty-card">
                <div className="operator-empty-title">No financial transactions yet</div>
                <div className="operator-empty-copy">Once bookings are made, collections and refunds will appear here.</div>
              </div>
            ) : transactions.map((item) => (
              <div className="operator-record" key={`${item.booking_id}-${item.transaction_date}`}>
                <div className="operator-record-main">
                  <div>
                    <div className="operator-record-title">{item.booking_ref} • {item.passenger_name}</div>
                    <div className="operator-record-subtitle">
                      {item.route_name} • {item.bus_name} • {new Date(item.transaction_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <div className="operator-chip-row">
                    <span className={`operator-chip ${item.payment_status === 'Paid' ? 'active' : item.payment_status.includes('Refund') ? 'warning' : 'danger'}`}>{item.payment_status}</span>
                    <span className="operator-chip route">{item.booking_status}</span>
                    <span className="operator-chip info">{item.booking_source}</span>
                    <span className="operator-chip">{item.payment_mode}</span>
                    <span className="operator-chip">{item.settlement_status}</span>
                  </div>
                  <div className="operator-record-stats">
                    <div className="operator-stat-box"><div className="operator-stat-box-label">Collected</div><div className="operator-stat-box-value">Rs. {Math.round(item.amount_collected)}</div></div>
                    <div className="operator-stat-box"><div className="operator-stat-box-label">Refunded</div><div className="operator-stat-box-value">Rs. {Math.round(item.amount_refunded)}</div></div>
                    <div className="operator-stat-box"><div className="operator-stat-box-label">Net Amount</div><div className="operator-stat-box-value">Rs. {Math.round(item.net_amount)}</div></div>
                    <div className="operator-stat-box"><div className="operator-stat-box-label">Commission</div><div className="operator-stat-box-value">Rs. {Math.round(item.commission_amount)}</div></div>
                    <div className="operator-stat-box"><div className="operator-stat-box-label">Tax</div><div className="operator-stat-box-value">Rs. {Math.round(item.tax_amount)}</div></div>
                    <div className="operator-stat-box"><div className="operator-stat-box-label">Ticket</div><div className="operator-stat-box-value">{item.ticket_number || item.booking_ref}</div></div>
                  </div>
                </div>
                <div className="operator-record-actions">
                  <div className="operator-inline-note">Trip #{item.trip_id}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
