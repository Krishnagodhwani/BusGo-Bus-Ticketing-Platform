import { useEffect, useState } from 'react';
import { getPaymentLedger, getRefundAudits } from '../services/adminService';

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

export default function PaymentLedgerPage() {
  const [ledger, setLedger] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [ledgerRes, refundsRes] = await Promise.all([getPaymentLedger(), getRefundAudits()]);
        setLedger(ledgerRes.data);
        setRefunds(refundsRes.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load payment ledger.');
      }
    };
    load();
  }, []);

  const totals = ledger.reduce((acc, item) => {
    acc.gross += item.total_fare;
    acc.refunds += item.refunded_amount;
    acc.commission += item.commission_amount;
    acc.payout += item.operator_payout;
    return acc;
  }, { gross: 0, refunds: 0, commission: 0, payout: 0 });

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">Payment ledger</div>
          <h1 className="admin-page-title">Revenue, payout, and refund ledger</h1>
          <p className="admin-page-copy">Audit the money trail across bookings, platform commission, gateway fees, GST, operator payouts, and refund actions.</p>
        </div>
      </section>

      <section className="admin-stats-grid compact">
        <div className="admin-mini-hero-card"><span>Gross Booking Value</span><strong>{formatCurrency(totals.gross)}</strong></div>
        <div className="admin-mini-hero-card"><span>Total Refunds</span><strong>{formatCurrency(totals.refunds)}</strong></div>
        <div className="admin-mini-hero-card"><span>Commission Earned</span><strong>{formatCurrency(totals.commission)}</strong></div>
        <div className="admin-mini-hero-card"><span>Operator Payout</span><strong>{formatCurrency(totals.payout)}</strong></div>
      </section>

      <section className="admin-grid-two">
        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Ledger entries</div>
              <div className="admin-section-copy">Latest financial breakdown per booking.</div>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table refined">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Operator</th>
                  <th>Gross</th>
                  <th>Commission</th>
                  <th>Gateway + GST</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr><td colSpan="6" className="admin-table-empty">{error || 'No ledger entries found.'}</td></tr>
                ) : ledger.map((item) => (
                  <tr key={item.booking_id}>
                    <td>
                      <div className="admin-table-primary">{item.booking_ref}</div>
                      <div className="admin-table-secondary">{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</div>
                    </td>
                    <td>{item.operator_name || '-'}</td>
                    <td>{formatCurrency(item.total_fare)}</td>
                    <td>{formatCurrency(item.commission_amount)}</td>
                    <td>{formatCurrency(item.gateway_fee_amount + item.gst_amount + item.platform_fee_amount)}</td>
                    <td>{formatCurrency(item.operator_payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Refund audit trail</div>
              <div className="admin-section-copy">Every refund action performed from the admin desk.</div>
            </div>
          </div>
          <div className="admin-list-stack">
            {refunds.length === 0 ? (
              <div className="admin-table-empty">{error || 'No refund audits yet.'}</div>
            ) : refunds.map((item) => (
              <div className="admin-list-row" key={item.id}>
                <div>
                  <div className="admin-row-title">{item.booking_ref} • {formatCurrency(item.refund_amount)}</div>
                  <div className="admin-row-meta">{item.passenger_name || 'Passenger'} • {item.operator_name || 'Operator'} • {item.processed_by_name || 'Admin'}</div>
                </div>
                <div className="admin-row-right">
                  <span className="admin-status-pill neutral">{item.refund_mode}</span>
                  <strong>{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
