import { useEffect, useState } from 'react';
import {
  createFareTemplate,
  exportAdminBookings,
  exportAdminOperators,
  exportAdminSupportTickets,
  getAdminAuditLogs,
  getCancellationPolicy,
  getFareTemplates,
  getInventoryRules,
  getPlatformSettings,
  getRevenueConfig,
  updateCancellationPolicy,
  updateFareTemplate,
  updateInventoryRules,
  updatePlatformSetting,
  updateRevenueConfig,
} from '../services/adminService';

const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const blankFareTemplate = {
  name: '',
  base_fare: 0,
  tax_percent: 5,
  service_fee: 0,
  surcharge: 0,
  cancellation_fee: 0,
  is_active: true,
};

export default function AdminSettingsPage() {
  const [policy, setPolicy] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [settings, setSettings] = useState([]);
  const [inventoryRules, setInventoryRules] = useState(null);
  const [fareTemplates, setFareTemplates] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [fareForm, setFareForm] = useState(blankFareTemplate);
  const [editingFareId, setEditingFareId] = useState(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');

  const load = async () => {
    try {
      const [policyRes, revenueRes, settingsRes, inventoryRes, faresRes, logsRes] = await Promise.all([
        getCancellationPolicy(),
        getRevenueConfig(),
        getPlatformSettings(),
        getInventoryRules(),
        getFareTemplates(),
        getAdminAuditLogs(),
      ]);
      setPolicy(policyRes.data);
      setRevenue(revenueRes.data);
      setSettings(settingsRes.data.settings);
      setInventoryRules(inventoryRes.data);
      setFareTemplates(faresRes.data);
      setAuditLogs(logsRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load admin settings.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const savePolicy = async (event) => {
    event.preventDefault();
    setSavingKey('policy');
    try {
      const res = await updateCancellationPolicy(policy);
      setPolicy(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update cancellation policy.');
    } finally {
      setSavingKey('');
    }
  };

  const saveRevenue = async (event) => {
    event.preventDefault();
    setSavingKey('revenue');
    try {
      const res = await updateRevenueConfig(revenue);
      setRevenue(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update revenue config.');
    } finally {
      setSavingKey('');
    }
  };

  const saveInventory = async (event) => {
    event.preventDefault();
    setSavingKey('inventory');
    try {
      const res = await updateInventoryRules(inventoryRules);
      setInventoryRules(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update inventory rules.');
    } finally {
      setSavingKey('');
    }
  };

  const saveSetting = async (item) => {
    setSavingKey(item.key);
    try {
      const res = await updatePlatformSetting(item.key, { value: item.value });
      setSettings(res.data.settings);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update platform setting.');
    } finally {
      setSavingKey('');
    }
  };

  const saveFareTemplate = async (event) => {
    event.preventDefault();
    setSavingKey('fare');
    try {
      if (editingFareId) {
        await updateFareTemplate(editingFareId, fareForm);
      } else {
        await createFareTemplate(fareForm);
      }
      setFareForm(blankFareTemplate);
      setEditingFareId(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save fare template.');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">Platform settings</div>
          <h1 className="admin-page-title">Policy, inventory, fare templates, reports, and audit trail</h1>
          <p className="admin-page-copy">A simple admin settings workspace for business rules and platform controls without extra complexity.</p>
        </div>
      </section>

      {error && <div className="admin-inline-error">{error}</div>}

      <section className="admin-grid-two">
        <form className="admin-surface-card padded" onSubmit={savePolicy}>
          <div className="admin-section-head"><div><div className="admin-section-title">Cancellation policy</div><div className="admin-section-copy">Control refund window and cancellation behavior.</div></div></div>
          {policy && (
            <div className="admin-form-grid">
              <label className="admin-field"><span>Policy name</span><input className="form-input" value={policy.policy_name} onChange={(event) => setPolicy({ ...policy, policy_name: event.target.value })} /></label>
              <label className="admin-field"><span>Cutoff hours</span><input className="form-input" type="number" min="0" value={policy.cutoff_hours} onChange={(event) => setPolicy({ ...policy, cutoff_hours: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>Refund percent</span><input className="form-input" type="number" min="0" max="100" value={policy.refund_percent} onChange={(event) => setPolicy({ ...policy, refund_percent: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>Processing fee</span><input className="form-input" type="number" min="0" step="0.01" value={policy.processing_fee} onChange={(event) => setPolicy({ ...policy, processing_fee: Number(event.target.value) })} /></label>
              <label className="admin-field full"><span>Description</span><textarea className="form-input admin-textarea" value={policy.description || ''} onChange={(event) => setPolicy({ ...policy, description: event.target.value })} /></label>
            </div>
          )}
          <div className="admin-footer-actions"><button className="admin-btn-primary" type="submit" disabled={savingKey === 'policy'}>{savingKey === 'policy' ? 'Saving...' : 'Save policy'}</button></div>
        </form>

        <form className="admin-surface-card padded" onSubmit={saveRevenue}>
          <div className="admin-section-head"><div><div className="admin-section-title">Commission & revenue config</div><div className="admin-section-copy">Tune commission, fees, tax, and refund charges.</div></div></div>
          {revenue && (
            <div className="admin-form-grid">
              <label className="admin-field"><span>Commission percent</span><input className="form-input" type="number" value={revenue.commission_percent} onChange={(event) => setRevenue({ ...revenue, commission_percent: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>Gateway fee percent</span><input className="form-input" type="number" value={revenue.gateway_fee_percent} onChange={(event) => setRevenue({ ...revenue, gateway_fee_percent: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>GST percent</span><input className="form-input" type="number" value={revenue.gst_percent} onChange={(event) => setRevenue({ ...revenue, gst_percent: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>Flat platform fee</span><input className="form-input" type="number" value={revenue.flat_platform_fee} onChange={(event) => setRevenue({ ...revenue, flat_platform_fee: Number(event.target.value) })} /></label>
              <label className="admin-field full"><span>Refund processing fee</span><input className="form-input" type="number" value={revenue.refund_processing_fee} onChange={(event) => setRevenue({ ...revenue, refund_processing_fee: Number(event.target.value) })} /></label>
            </div>
          )}
          <div className="admin-footer-actions"><button className="admin-btn-primary" type="submit" disabled={savingKey === 'revenue'}>{savingKey === 'revenue' ? 'Saving...' : 'Save revenue config'}</button></div>
        </form>
      </section>

      <section className="admin-grid-two">
        <form className="admin-surface-card padded" onSubmit={saveInventory}>
          <div className="admin-section-head"><div><div className="admin-section-title">Global inventory rules</div><div className="admin-section-copy">Set booking hold rules, override behavior, and blocked seat limits.</div></div></div>
          {inventoryRules && (
            <div className="admin-form-grid">
              <label className="admin-field"><span>Rule name</span><input className="form-input" value={inventoryRules.rule_name} onChange={(event) => setInventoryRules({ ...inventoryRules, rule_name: event.target.value })} /></label>
              <label className="admin-field"><span>Seat hold minutes</span><input className="form-input" type="number" value={inventoryRules.seat_hold_minutes} onChange={(event) => setInventoryRules({ ...inventoryRules, seat_hold_minutes: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>Default capacity limit</span><input className="form-input" type="number" value={inventoryRules.default_capacity_limit} onChange={(event) => setInventoryRules({ ...inventoryRules, default_capacity_limit: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>Max blocked seats</span><input className="form-input" type="number" value={inventoryRules.max_blocked_seats} onChange={(event) => setInventoryRules({ ...inventoryRules, max_blocked_seats: Number(event.target.value) })} /></label>
              <label className="admin-field toggle"><span>Allow manual override</span><input type="checkbox" checked={inventoryRules.allow_manual_override} onChange={(event) => setInventoryRules({ ...inventoryRules, allow_manual_override: event.target.checked })} /></label>
              <label className="admin-field toggle"><span>Allow overbooking</span><input type="checkbox" checked={inventoryRules.allow_overbooking} onChange={(event) => setInventoryRules({ ...inventoryRules, allow_overbooking: event.target.checked })} /></label>
            </div>
          )}
          <div className="admin-footer-actions"><button className="admin-btn-primary" type="submit" disabled={savingKey === 'inventory'}>{savingKey === 'inventory' ? 'Saving...' : 'Save inventory rules'}</button></div>
        </form>

        <div className="admin-surface-card padded">
          <div className="admin-section-head"><div><div className="admin-section-title">Admin report exports</div><div className="admin-section-copy">Quick CSV exports for operator, booking, and support reporting.</div></div></div>
          <div className="admin-list-stack" style={{ padding: 0 }}>
            <div className="admin-setting-row"><div><div className="admin-table-primary">Operators report</div><div className="admin-table-secondary">Active accounts, status, and access levels</div></div><button className="admin-btn-outline" type="button" onClick={() => exportAdminOperators().then((res) => saveBlob(res.data, 'admin-operators.csv'))}>Export CSV</button></div>
            <div className="admin-setting-row"><div><div className="admin-table-primary">Bookings report</div><div className="admin-table-secondary">Passenger, operator, fare, and payment status</div></div><button className="admin-btn-outline" type="button" onClick={() => exportAdminBookings().then((res) => saveBlob(res.data, 'admin-bookings.csv'))}>Export CSV</button></div>
            <div className="admin-setting-row"><div><div className="admin-table-primary">Support tickets report</div><div className="admin-table-secondary">Category, priority, and resolution status</div></div><button className="admin-btn-outline" type="button" onClick={() => exportAdminSupportTickets().then((res) => saveBlob(res.data, 'admin-support-tickets.csv'))}>Export CSV</button></div>
          </div>
        </div>
      </section>

      <section className="admin-grid-two">
        <div className="admin-surface-card padded">
          <div className="admin-section-head"><div><div className="admin-section-title">Fare templates</div><div className="admin-section-copy">Reusable commercial templates for taxes, service fees, surcharges, and cancellation cost.</div></div></div>
          <form className="admin-form-grid" onSubmit={saveFareTemplate}>
            <label className="admin-field"><span>Template name</span><input className="form-input" value={fareForm.name} onChange={(event) => setFareForm({ ...fareForm, name: event.target.value })} required /></label>
            <label className="admin-field"><span>Base fare</span><input className="form-input" type="number" value={fareForm.base_fare} onChange={(event) => setFareForm({ ...fareForm, base_fare: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>Tax percent</span><input className="form-input" type="number" value={fareForm.tax_percent} onChange={(event) => setFareForm({ ...fareForm, tax_percent: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>Service fee</span><input className="form-input" type="number" value={fareForm.service_fee} onChange={(event) => setFareForm({ ...fareForm, service_fee: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>Surcharge</span><input className="form-input" type="number" value={fareForm.surcharge} onChange={(event) => setFareForm({ ...fareForm, surcharge: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>Cancellation fee</span><input className="form-input" type="number" value={fareForm.cancellation_fee} onChange={(event) => setFareForm({ ...fareForm, cancellation_fee: Number(event.target.value) })} /></label>
            <div className="admin-footer-actions"><button className="admin-btn-primary" type="submit" disabled={savingKey === 'fare'}>{savingKey === 'fare' ? 'Saving...' : editingFareId ? 'Update template' : 'Add template'}</button></div>
          </form>
          <div className="admin-list-stack" style={{ padding: '18px 0 0' }}>
            {fareTemplates.map((item) => (
              <div className="admin-setting-row" key={item.id}>
                <div><div className="admin-table-primary">{item.name}</div><div className="admin-table-secondary">Base {item.base_fare} • Tax {item.tax_percent}% • Fee {item.service_fee}</div></div>
                <button className="admin-btn-outline" type="button" onClick={() => { setEditingFareId(item.id); setFareForm(item); }}>Edit</button>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-surface-card padded">
          <div className="admin-section-head"><div><div className="admin-section-title">Audit logs</div><div className="admin-section-copy">Recent admin actions and platform changes.</div></div></div>
          <div className="admin-list-stack" style={{ padding: 0 }}>
            {auditLogs.slice(0, 14).map((item) => (
              <div className="admin-list-row" key={item.id}>
                <div>
                  <div className="admin-row-title">{item.action}</div>
                  <div className="admin-row-meta">{item.actor_name || 'Admin'} • {item.entity_type} • {item.details || 'No details'}</div>
                </div>
                <div className="admin-row-right">
                  <span className="admin-status-pill neutral">{item.status}</span>
                  <strong>{new Date(item.created_at).toLocaleString()}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-surface-card padded">
        <div className="admin-section-head">
          <div>
            <div className="admin-section-title">Platform settings</div>
            <div className="admin-section-copy">Edit support, booking, billing, and refund configuration values.</div>
          </div>
        </div>
        <div className="admin-settings-list">
          {settings.map((item) => (
            <div className="admin-setting-row" key={item.key}>
              <div>
                <div className="admin-table-primary">{item.label}</div>
                <div className="admin-table-secondary">{item.description || item.category}</div>
              </div>
              <div className="admin-setting-actions">
                <input className="form-input" value={item.value} onChange={(event) => setSettings((current) => current.map((entry) => entry.key === item.key ? { ...entry, value: event.target.value } : entry))} />
                <button className="admin-btn-outline" type="button" onClick={() => saveSetting(item)} disabled={savingKey === item.key}>{savingKey === item.key ? 'Saving...' : 'Update'}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
