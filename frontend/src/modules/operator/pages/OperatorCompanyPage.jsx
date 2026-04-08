import { useEffect, useState } from 'react';
import {
  createBlockedSeat,
  createOperatorCrew,
  deleteBlockedSeat,
  getBlockedSeats,
  getCompanyProfile,
  getMyBuses,
  getMyTrips,
  getOperatorCrew,
  updateCompanyProfile,
  updateOperatorCrew,
} from '../services/operatorService';
import './OperatorWorkspace.css';

const blankCrew = {
  assigned_bus_id: '',
  name: '',
  role: 'DRIVER',
  phone: '',
  license_number: '',
  credential_status: 'PENDING',
  notes: '',
  is_active: true,
};

const blankBlockedSeat = {
  bus_id: '',
  trip_id: '',
  seat_label: '',
  reason: '',
  is_active: true,
};

export default function OperatorCompanyPage() {
  const [profile, setProfile] = useState(null);
  const [crew, setCrew] = useState([]);
  const [blockedSeats, setBlockedSeats] = useState([]);
  const [buses, setBuses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [crewForm, setCrewForm] = useState(blankCrew);
  const [blockedSeatForm, setBlockedSeatForm] = useState(blankBlockedSeat);
  const [editingCrewId, setEditingCrewId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const [profileRes, crewRes, blockedRes, busesRes, tripsRes] = await Promise.all([
        getCompanyProfile(),
        getOperatorCrew(),
        getBlockedSeats(),
        getMyBuses(),
        getMyTrips(),
      ]);
      setProfile(profileRes.data);
      setCrew(crewRes.data);
      setBlockedSeats(blockedRes.data);
      setBuses(busesRes.data);
      setTrips(tripsRes.data);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load company operations workspace.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      const res = await updateCompanyProfile(profile);
      setProfile(res.data);
      setSuccess('Company profile saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save company profile.');
    }
  };

  const saveCrew = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...crewForm,
        assigned_bus_id: crewForm.assigned_bus_id ? Number(crewForm.assigned_bus_id) : null,
      };
      if (editingCrewId) {
        await updateOperatorCrew(editingCrewId, payload);
      } else {
        await createOperatorCrew(payload);
      }
      setCrewForm(blankCrew);
      setEditingCrewId(null);
      setSuccess('Crew record saved.');
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save crew member.');
    }
  };

  const saveBlockedSeat = async (event) => {
    event.preventDefault();
    try {
      await createBlockedSeat({
        ...blockedSeatForm,
        bus_id: blockedSeatForm.bus_id ? Number(blockedSeatForm.bus_id) : null,
        trip_id: blockedSeatForm.trip_id ? Number(blockedSeatForm.trip_id) : null,
      });
      setBlockedSeatForm(blankBlockedSeat);
      setSuccess('Seat block created.');
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to block seat.');
    }
  };

  const editCrew = (item) => {
    setEditingCrewId(item.id);
    setCrewForm({
      assigned_bus_id: item.assigned_bus_id || '',
      name: item.name,
      role: item.role,
      phone: item.phone || '',
      license_number: item.license_number || '',
      credential_status: item.credential_status,
      notes: item.notes || '',
      is_active: item.is_active,
    });
  };

  return (
    <div className="operator-page">
      <div className="operator-page-header">
        <div>
          <h1 className="operator-page-title">Company Operations</h1>
          <div className="operator-page-subtitle">
            Keep operator business details, crew assignments, and blocked seats in one simple workspace that dispatch and
            ownership teams can manage without jumping between screens.
          </div>
        </div>
      </div>

      {error && <div className="operator-alert error">{error}</div>}
      {success && <div className="operator-alert success">{success}</div>}

      {profile && (
        <form className="operator-panel-shell" onSubmit={saveProfile}>
          <div className="operator-section-heading">Company Profile</div>
          <div className="operator-form-grid">
            <div><label className="operator-field-label">Company Name</label><input className="form-input" value={profile.company_name || ''} onChange={(event) => setProfile({ ...profile, company_name: event.target.value })} /></div>
            <div><label className="operator-field-label">Legal Name</label><input className="form-input" value={profile.legal_name || ''} onChange={(event) => setProfile({ ...profile, legal_name: event.target.value })} /></div>
            <div><label className="operator-field-label">Support Phone</label><input className="form-input" value={profile.support_phone || ''} onChange={(event) => setProfile({ ...profile, support_phone: event.target.value })} /></div>
            <div><label className="operator-field-label">Support Email</label><input className="form-input" value={profile.support_email || ''} onChange={(event) => setProfile({ ...profile, support_email: event.target.value })} /></div>
            <div><label className="operator-field-label">Service Areas</label><input className="form-input" value={profile.service_areas || ''} onChange={(event) => setProfile({ ...profile, service_areas: event.target.value })} placeholder="Jaipur, Ajmer, Jodhpur" /></div>
            <div><label className="operator-field-label">Contract Status</label><input className="form-input" disabled value={profile.contract_status || 'PENDING'} /></div>
          </div>
          <div style={{ marginTop: '14px' }}>
            <label className="operator-field-label">Address</label>
            <textarea className="form-input" rows="3" value={profile.address || ''} onChange={(event) => setProfile({ ...profile, address: event.target.value })} />
          </div>
          <div className="operator-action-row" style={{ marginTop: '14px' }}>
            <button className="operator-primary-btn" type="submit">Save Company Profile</button>
          </div>
        </form>
      )}

      <div className="operator-grid-two operator-grid-balanced">
        <form className="operator-panel-shell" onSubmit={saveCrew}>
          <div className="operator-section-heading">Driver & Crew Assignments</div>
          <div className="operator-form-grid">
            <div><label className="operator-field-label">Crew Name</label><input className="form-input" value={crewForm.name} onChange={(event) => setCrewForm({ ...crewForm, name: event.target.value })} required /></div>
            <div><label className="operator-field-label">Role</label><select className="form-input" value={crewForm.role} onChange={(event) => setCrewForm({ ...crewForm, role: event.target.value })}><option value="DRIVER">Driver</option><option value="CONDUCTOR">Conductor</option><option value="HELPER">Helper</option></select></div>
            <div><label className="operator-field-label">Assigned Bus</label><select className="form-input" value={crewForm.assigned_bus_id} onChange={(event) => setCrewForm({ ...crewForm, assigned_bus_id: event.target.value })}><option value="">Unassigned</option>{buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}</select></div>
            <div><label className="operator-field-label">Phone</label><input className="form-input" value={crewForm.phone} onChange={(event) => setCrewForm({ ...crewForm, phone: event.target.value })} /></div>
            <div><label className="operator-field-label">License / Credential</label><input className="form-input" value={crewForm.license_number} onChange={(event) => setCrewForm({ ...crewForm, license_number: event.target.value })} /></div>
            <div><label className="operator-field-label">Credential Status</label><select className="form-input" value={crewForm.credential_status} onChange={(event) => setCrewForm({ ...crewForm, credential_status: event.target.value })}><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="EXPIRED">Expired</option></select></div>
          </div>
          <div style={{ marginTop: '14px' }}>
            <label className="operator-field-label">Notes</label>
            <textarea className="form-input" rows="3" value={crewForm.notes} onChange={(event) => setCrewForm({ ...crewForm, notes: event.target.value })} />
          </div>
          <div className="operator-action-row" style={{ marginTop: '14px' }}>
            <button className="operator-primary-btn" type="submit">{editingCrewId ? 'Update Crew' : 'Add Crew Member'}</button>
          </div>
          <div className="operator-preview-list" style={{ marginTop: '18px' }}>
            {crew.map((item) => (
              <div className="operator-preview-row" key={item.id}>
                <span>{item.name} • {item.role} • {item.assigned_bus_name || 'Unassigned'} • {item.credential_status}</span>
                <button className="operator-ghost-btn" type="button" onClick={() => editCrew(item)}>Edit</button>
              </div>
            ))}
          </div>
        </form>

        <form className="operator-panel-shell" onSubmit={saveBlockedSeat}>
          <div className="operator-section-heading">Blocked Seats</div>
          <div className="operator-form-grid">
            <div><label className="operator-field-label">Bus</label><select className="form-input" value={blockedSeatForm.bus_id} onChange={(event) => setBlockedSeatForm({ ...blockedSeatForm, bus_id: event.target.value })}><option value="">Optional</option>{buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}</select></div>
            <div><label className="operator-field-label">Trip</label><select className="form-input" value={blockedSeatForm.trip_id} onChange={(event) => setBlockedSeatForm({ ...blockedSeatForm, trip_id: event.target.value })}><option value="">Optional</option>{trips.slice(0, 50).map((trip) => <option key={trip.id} value={trip.id}>{trip.route_name} - {new Date(trip.departure_time).toLocaleDateString()}</option>)}</select></div>
            <div><label className="operator-field-label">Seat Label</label><input className="form-input" value={blockedSeatForm.seat_label} onChange={(event) => setBlockedSeatForm({ ...blockedSeatForm, seat_label: event.target.value })} placeholder="e.g. 1A" required /></div>
            <div><label className="operator-field-label">Reason</label><input className="form-input" value={blockedSeatForm.reason} onChange={(event) => setBlockedSeatForm({ ...blockedSeatForm, reason: event.target.value })} placeholder="Damaged seat / VIP hold" /></div>
          </div>
          <div className="operator-action-row" style={{ marginTop: '14px' }}>
            <button className="operator-primary-btn" type="submit">Block Seat</button>
          </div>
          <div className="operator-preview-list" style={{ marginTop: '18px' }}>
            {blockedSeats.map((item) => (
              <div className="operator-preview-row" key={item.id}>
                <span>{item.seat_label} • {item.bus_name || item.trip_label || 'General'} • {item.reason || 'No reason'}</span>
                <button className="operator-ghost-btn" type="button" onClick={() => deleteBlockedSeat(item.id).then(load)}>Remove</button>
              </div>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
