import { useEffect, useMemo, useState } from 'react';
import {
  createOnboardingRequest,
  createOperator,
  createOperatorDocument,
  getOnboardingRequests,
  getOperatorCommercialProfile,
  getOperatorDocuments,
  getOperators,
  reviewOnboardingRequest,
  toggleOperatorStatus,
  updateOperator,
  updateOperatorCommercialProfile,
  verifyOperatorDocument,
} from '../services/adminService';

const initialForm = {
  name: '',
  phone: '',
  email: '',
  password: '',
  operator_access_level: 'OWNER',
};

const onboardingBlank = {
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  requested_access_level: 'OWNER',
  notes: '',
};

const documentBlank = {
  onboarding_request_id: '',
  operator_id: '',
  doc_type: 'BUSINESS_LICENSE',
  file_name: '',
  document_number: '',
  notes: '',
};

export default function OperatorsPage() {
  const [operators, setOperators] = useState([]);
  const [requests, setRequests] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showCommercialModal, setShowCommercialModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [createForm, setCreateForm] = useState(initialForm);
  const [onboardingForm, setOnboardingForm] = useState(onboardingBlank);
  const [documentForm, setDocumentForm] = useState(documentBlank);
  const [editForm, setEditForm] = useState(null);
  const [commercialForm, setCommercialForm] = useState(null);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [operatorsRes, requestsRes, docsRes] = await Promise.all([
        getOperators(),
        getOnboardingRequests(),
        getOperatorDocuments(),
      ]);
      setOperators(operatorsRes.data);
      setRequests(requestsRes.data);
      setDocuments(docsRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load operator workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOperators = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return operators;
    return operators.filter((item) =>
      [item.name, item.phone, item.email, item.operator_access_level].filter(Boolean).join(' ').toLowerCase().includes(term)
    );
  }, [operators, query]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createOperator(createForm);
      setCreateForm(initialForm);
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create operator.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRequest = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createOnboardingRequest(onboardingForm);
      setOnboardingForm(onboardingBlank);
      setShowOnboardingModal(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create onboarding request.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDocument = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createOperatorDocument({
        ...documentForm,
        onboarding_request_id: documentForm.onboarding_request_id ? Number(documentForm.onboarding_request_id) : null,
        operator_id: documentForm.operator_id ? Number(documentForm.operator_id) : null,
      });
      setDocumentForm(documentBlank);
      setShowDocumentModal(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create operator document.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (event) => {
    event.preventDefault();
    if (!selectedOperator) return;
    setSaving(true);
    try {
      await updateOperator(selectedOperator.id, editForm);
      setShowEditModal(false);
      setSelectedOperator(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update operator.');
    } finally {
      setSaving(false);
    }
  };

  const openCommercialProfile = async (operator) => {
    try {
      const res = await getOperatorCommercialProfile(operator.id);
      setSelectedOperator(operator);
      setCommercialForm(res.data);
      setShowCommercialModal(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load commercial profile.');
    }
  };

  const saveCommercialProfile = async (event) => {
    event.preventDefault();
    if (!selectedOperator) return;
    setSaving(true);
    try {
      await updateOperatorCommercialProfile(selectedOperator.id, commercialForm);
      setShowCommercialModal(false);
      setSelectedOperator(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save commercial profile.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (operator) => {
    setSelectedOperator(operator);
    setEditForm({
      name: operator.name || '',
      email: operator.email || '',
      operator_access_level: operator.operator_access_level || 'OWNER',
      is_active: operator.is_active,
    });
    setError('');
    setShowEditModal(true);
  };

  const requestCount = requests.filter((item) => item.approval_status === 'PENDING').length;
  const docsPending = documents.filter((item) => item.verification_status === 'PENDING').length;

  return (
    <div className="admin-page-shell">
      <section className="admin-section-header">
        <div>
          <div className="admin-eyebrow">Operators onboarding</div>
          <h1 className="admin-page-title">Operator onboarding, verification, and contract controls</h1>
          <p className="admin-page-copy">Manage operator accounts, review approvals, verify documents, and maintain commercial profile details in one clean workspace.</p>
        </div>
        <div className="admin-action-row">
          <button className="admin-btn-outline" onClick={() => setShowDocumentModal(true)}>Add document</button>
          <button className="admin-btn-outline" onClick={() => setShowOnboardingModal(true)}>New onboarding request</button>
          <button className="admin-btn-primary" onClick={() => { setError(''); setShowCreateModal(true); }}>Add operator</button>
        </div>
      </section>

      <section className="admin-stats-grid compact">
        <div className="admin-mini-hero-card"><span>Total Operators</span><strong>{operators.length}</strong></div>
        <div className="admin-mini-hero-card"><span>Pending Requests</span><strong>{requestCount}</strong></div>
        <div className="admin-mini-hero-card"><span>Pending Documents</span><strong>{docsPending}</strong></div>
        <div className="admin-mini-hero-card"><span>Active Accounts</span><strong>{operators.filter((item) => item.is_active).length}</strong></div>
      </section>

      {error && <div className="admin-inline-error">{error}</div>}

      <section className="admin-grid-two">
        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Onboarding queue</div>
              <div className="admin-section-copy">Approve or reject incoming operator applications.</div>
            </div>
          </div>
          <div className="admin-list-stack">
            {requests.map((item) => (
              <div className="admin-list-row" key={item.id}>
                <div>
                  <div className="admin-row-title">{item.company_name} - {item.contact_name}</div>
                  <div className="admin-row-meta">{item.phone} - {item.email || 'No email'} - Documents {item.document_status}</div>
                </div>
                <div className="admin-row-right">
                  <span className="admin-status-pill neutral">{item.approval_status}</span>
                  {item.approval_status === 'PENDING' && (
                    <div className="admin-action-row">
                      <button className="admin-btn-outline small" onClick={() => reviewOnboardingRequest(item.id, { approval_status: 'APPROVED', create_operator_account: true, notes: 'Approved from admin queue' }).then(loadData)}>Approve</button>
                      <button className="admin-btn-outline small" onClick={() => reviewOnboardingRequest(item.id, { approval_status: 'REJECTED', create_operator_account: false, notes: 'Rejected from admin queue' }).then(loadData)}>Reject</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {requests.length === 0 && <div className="admin-table-empty">No onboarding requests yet.</div>}
          </div>
        </div>

        <div className="admin-surface-card">
          <div className="admin-section-head">
            <div>
              <div className="admin-section-title">Document verification</div>
              <div className="admin-section-copy">Verify operator license, tax, and compliance documents.</div>
            </div>
          </div>
          <div className="admin-list-stack">
            {documents.slice(0, 12).map((item) => (
              <div className="admin-list-row" key={item.id}>
                <div>
                  <div className="admin-row-title">{item.doc_type}</div>
                  <div className="admin-row-meta">{item.file_name || 'No file'} - {item.document_number || 'No document number'}</div>
                </div>
                <div className="admin-row-right">
                  <span className="admin-status-pill neutral">{item.verification_status}</span>
                  <div className="admin-action-row">
                    <button className="admin-btn-outline small" onClick={() => verifyOperatorDocument(item.id, { verification_status: 'VERIFIED', notes: 'Verified by admin' }).then(loadData)}>Verify</button>
                    <button className="admin-btn-outline small" onClick={() => verifyOperatorDocument(item.id, { verification_status: 'REJECTED', notes: 'Rejected by admin' }).then(loadData)}>Reject</button>
                  </div>
                </div>
              </div>
            ))}
            {documents.length === 0 && <div className="admin-table-empty">No documents in queue.</div>}
          </div>
        </div>
      </section>

      <section className="admin-surface-card">
        <div className="admin-toolbar">
          <input className="form-input admin-search-input" placeholder="Search operator by name, phone, email, or role" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table refined">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Phone</th>
                <th>Access Level</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="admin-table-empty">Loading operators...</td></tr>
              ) : filteredOperators.length === 0 ? (
                <tr><td colSpan="6" className="admin-table-empty">No operators match your search.</td></tr>
              ) : filteredOperators.map((operator) => (
                <tr key={operator.id}>
                  <td><div className="admin-table-primary">{operator.name || 'Unnamed operator'}</div><div className="admin-table-secondary">{operator.email || 'No email added'}</div></td>
                  <td>{operator.phone}</td>
                  <td><span className="admin-status-pill neutral">{operator.operator_access_level || 'OWNER'}</span></td>
                  <td><span className={`admin-status-pill ${operator.is_active ? 'confirmed' : 'cancelled'}`}>{operator.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>{operator.created_at ? new Date(operator.created_at).toLocaleDateString() : '-'}</td>
                  <td>
                    <div className="admin-action-row">
                      <button className="admin-btn-outline small" onClick={() => openEdit(operator)}>Account</button>
                      <button className="admin-btn-outline small" onClick={() => openCommercialProfile(operator)}>Commercial</button>
                      <button className="admin-btn-outline small" onClick={() => toggleOperatorStatus(operator.id).then(loadData)}>{operator.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header"><div><div className="modal-title">Create operator account</div><div className="modal-subtitle">Direct admin onboarding for immediate access.</div></div><button className="modal-close" onClick={() => setShowCreateModal(false)}>x</button></div>
            <form onSubmit={handleCreate}>
              <div className="modal-body form-grid">
                <label className="admin-field"><span>Agency name</span><input className="form-input" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} required /></label>
                <label className="admin-field"><span>Phone number</span><input className="form-input" value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value.replace(/\D/g, '') })} required /></label>
                <label className="admin-field"><span>Email</span><input className="form-input" type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
                <label className="admin-field"><span>Temporary password</span><input className="form-input" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} required /></label>
                <label className="admin-field full"><span>Access level</span><select className="form-input" value={createForm.operator_access_level} onChange={(event) => setCreateForm({ ...createForm, operator_access_level: event.target.value })}><option value="OWNER">Owner</option><option value="MANAGER">Manager</option><option value="BOOKING_STAFF">Booking Staff</option><option value="GROUND_STAFF">Ground Staff</option></select></label>
              </div>
              <div className="modal-footer"><button type="button" className="admin-btn-outline" onClick={() => setShowCreateModal(false)}>Cancel</button><button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create operator'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showOnboardingModal && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header"><div><div className="modal-title">Create onboarding request</div><div className="modal-subtitle">Add an operator application into the approval queue.</div></div><button className="modal-close" onClick={() => setShowOnboardingModal(false)}>x</button></div>
            <form onSubmit={handleCreateRequest}>
              <div className="modal-body form-grid">
                <label className="admin-field"><span>Company name</span><input className="form-input" value={onboardingForm.company_name} onChange={(event) => setOnboardingForm({ ...onboardingForm, company_name: event.target.value })} required /></label>
                <label className="admin-field"><span>Contact name</span><input className="form-input" value={onboardingForm.contact_name} onChange={(event) => setOnboardingForm({ ...onboardingForm, contact_name: event.target.value })} required /></label>
                <label className="admin-field"><span>Phone number</span><input className="form-input" value={onboardingForm.phone} onChange={(event) => setOnboardingForm({ ...onboardingForm, phone: event.target.value })} required /></label>
                <label className="admin-field"><span>Email</span><input className="form-input" value={onboardingForm.email} onChange={(event) => setOnboardingForm({ ...onboardingForm, email: event.target.value })} /></label>
                <label className="admin-field full"><span>Requested access level</span><select className="form-input" value={onboardingForm.requested_access_level} onChange={(event) => setOnboardingForm({ ...onboardingForm, requested_access_level: event.target.value })}><option value="OWNER">Owner</option><option value="MANAGER">Manager</option><option value="BOOKING_STAFF">Booking Staff</option><option value="GROUND_STAFF">Ground Staff</option></select></label>
              </div>
              <div className="modal-footer"><button type="button" className="admin-btn-outline" onClick={() => setShowOnboardingModal(false)}>Cancel</button><button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create request'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showDocumentModal && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header"><div><div className="modal-title">Add operator document</div><div className="modal-subtitle">Create a verification record for an onboarding request or an active operator.</div></div><button className="modal-close" onClick={() => setShowDocumentModal(false)}>x</button></div>
            <form onSubmit={handleCreateDocument}>
              <div className="modal-body form-grid">
                <label className="admin-field"><span>Onboarding request</span><select className="form-input" value={documentForm.onboarding_request_id} onChange={(event) => setDocumentForm({ ...documentForm, onboarding_request_id: event.target.value })}><option value="">Optional</option>{requests.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></label>
                <label className="admin-field"><span>Operator account</span><select className="form-input" value={documentForm.operator_id} onChange={(event) => setDocumentForm({ ...documentForm, operator_id: event.target.value })}><option value="">Optional</option>{operators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="admin-field"><span>Document type</span><select className="form-input" value={documentForm.doc_type} onChange={(event) => setDocumentForm({ ...documentForm, doc_type: event.target.value })}><option value="BUSINESS_LICENSE">Business license</option><option value="GST_CERTIFICATE">GST certificate</option><option value="INSURANCE">Insurance</option><option value="RC_BOOK">RC book</option></select></label>
                <label className="admin-field"><span>File name</span><input className="form-input" value={documentForm.file_name} onChange={(event) => setDocumentForm({ ...documentForm, file_name: event.target.value })} placeholder="agency-license.pdf" required /></label>
                <label className="admin-field"><span>Document number</span><input className="form-input" value={documentForm.document_number} onChange={(event) => setDocumentForm({ ...documentForm, document_number: event.target.value })} /></label>
                <label className="admin-field full"><span>Notes</span><textarea className="form-input admin-textarea" value={documentForm.notes} onChange={(event) => setDocumentForm({ ...documentForm, notes: event.target.value })} placeholder="Optional notes for verification team." /></label>
              </div>
              <div className="modal-footer"><button type="button" className="admin-btn-outline" onClick={() => setShowDocumentModal(false)}>Cancel</button><button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add document'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editForm && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header"><div><div className="modal-title">Operator account controls</div><div className="modal-subtitle">Update access permissions and account status.</div></div><button className="modal-close" onClick={() => setShowEditModal(false)}>x</button></div>
            <form onSubmit={handleEdit}>
              <div className="modal-body form-grid">
                <label className="admin-field"><span>Agency name</span><input className="form-input" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
                <label className="admin-field"><span>Email</span><input className="form-input" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></label>
                <label className="admin-field"><span>Access level</span><select className="form-input" value={editForm.operator_access_level} onChange={(event) => setEditForm({ ...editForm, operator_access_level: event.target.value })}><option value="OWNER">Owner</option><option value="MANAGER">Manager</option><option value="BOOKING_STAFF">Booking Staff</option><option value="GROUND_STAFF">Ground Staff</option></select></label>
                <label className="admin-field toggle"><span>Account active</span><input type="checkbox" checked={editForm.is_active} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })} /></label>
              </div>
              <div className="modal-footer"><button type="button" className="admin-btn-outline" onClick={() => setShowEditModal(false)}>Cancel</button><button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showCommercialModal && commercialForm && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header"><div><div className="modal-title">Operator profile and contract</div><div className="modal-subtitle">Commercial profile, service areas, verification, and contract status.</div></div><button className="modal-close" onClick={() => setShowCommercialModal(false)}>x</button></div>
            <form onSubmit={saveCommercialProfile}>
              <div className="modal-body form-grid">
                <label className="admin-field"><span>Company name</span><input className="form-input" value={commercialForm.company_name || ''} onChange={(event) => setCommercialForm({ ...commercialForm, company_name: event.target.value })} /></label>
                <label className="admin-field"><span>Legal name</span><input className="form-input" value={commercialForm.legal_name || ''} onChange={(event) => setCommercialForm({ ...commercialForm, legal_name: event.target.value })} /></label>
                <label className="admin-field"><span>Support phone</span><input className="form-input" value={commercialForm.support_phone || ''} onChange={(event) => setCommercialForm({ ...commercialForm, support_phone: event.target.value })} /></label>
                <label className="admin-field"><span>Support email</span><input className="form-input" value={commercialForm.support_email || ''} onChange={(event) => setCommercialForm({ ...commercialForm, support_email: event.target.value })} /></label>
                <label className="admin-field"><span>Contract status</span><select className="form-input" value={commercialForm.contract_status} onChange={(event) => setCommercialForm({ ...commercialForm, contract_status: event.target.value })}><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On Hold</option><option value="EXPIRED">Expired</option></select></label>
                <label className="admin-field"><span>Verification status</span><select className="form-input" value={commercialForm.verification_status} onChange={(event) => setCommercialForm({ ...commercialForm, verification_status: event.target.value })}><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option></select></label>
                <label className="admin-field full"><span>Service areas</span><input className="form-input" value={commercialForm.service_areas || ''} onChange={(event) => setCommercialForm({ ...commercialForm, service_areas: event.target.value })} placeholder="Jaipur, Ajmer, Jodhpur" /></label>
                <label className="admin-field full"><span>Address</span><textarea className="form-input admin-textarea" value={commercialForm.address || ''} onChange={(event) => setCommercialForm({ ...commercialForm, address: event.target.value })} /></label>
                <label className="admin-field full"><span>Contract notes</span><textarea className="form-input admin-textarea" value={commercialForm.contract_notes || ''} onChange={(event) => setCommercialForm({ ...commercialForm, contract_notes: event.target.value })} /></label>
              </div>
              <div className="modal-footer"><button type="button" className="admin-btn-outline" onClick={() => setShowCommercialModal(false)}>Cancel</button><button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save commercial profile'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
