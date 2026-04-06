import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getUser, clearAuth, hasOperatorAccess } from '../store/authStore';
import './OperatorLayout.css';

export default function OperatorLayout() {
  const user = getUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const accessLevel = user?.operator_access_level || 'OWNER';

  return (
    <div className="operator-layout">
      <aside className="operator-sidebar">
        <div className="operator-brand">
          <div className="operator-logo-icon">B</div>
          <div>
            <div className="operator-brand-text">BusGo</div>
            <div className="operator-brand-subtext">Operator Portal</div>
          </div>
        </div>

        <nav className="operator-nav-group">
          <div className="operator-nav-title">Fleet Operations</div>
          <ul className="operator-nav-list">
            <li>
              <NavLink to="/operator/dashboard" className={({ isActive }) => `operator-nav-link ${isActive ? 'active' : ''}`}>
                <span className="operator-nav-icon">OV</span>
                <span className="operator-nav-text">Overview</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/operator/buses" className={({ isActive }) => `operator-nav-link ${isActive ? 'active' : ''}`}>
                <span className="operator-nav-icon">BS</span>
                <span className="operator-nav-text">My Buses</span>
              </NavLink>
            </li>
            {hasOperatorAccess(['OWNER', 'MANAGER']) && (
              <li>
                <NavLink to="/operator/routes" className={({ isActive }) => `operator-nav-link ${isActive ? 'active' : ''}`}>
                  <span className="operator-nav-icon">RT</span>
                  <span className="operator-nav-text">Route Network</span>
                </NavLink>
              </li>
            )}
            {hasOperatorAccess(['OWNER', 'MANAGER', 'GROUND_STAFF']) && (
              <li>
                <NavLink to="/operator/trips" className={({ isActive }) => `operator-nav-link ${isActive ? 'active' : ''}`}>
                  <span className="operator-nav-icon">TR</span>
                  <span className="operator-nav-text">Scheduled Trips</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        <nav className="operator-nav-group">
          <div className="operator-nav-title">Business</div>
          <ul className="operator-nav-list">
            <li>
              <NavLink to="/operator/bookings" className={({ isActive }) => `operator-nav-link ${isActive ? 'active' : ''}`}>
                <span className="operator-nav-icon">BK</span>
                <span className="operator-nav-text">Passenger Bookings</span>
              </NavLink>
            </li>
            {hasOperatorAccess(['OWNER', 'MANAGER']) && (
              <li>
                <NavLink to="/operator/financials" className={({ isActive }) => `operator-nav-link ${isActive ? 'active' : ''}`}>
                  <span className="operator-nav-icon">FN</span>
                  <span className="operator-nav-text">Financials</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        <div className="operator-user-profile">
          <div className="operator-avatar">
            {user?.name?.charAt(0).toUpperCase() || 'O'}
          </div>
          <div className="operator-user-info">
            <div className="operator-user-name">{user?.name || 'Operator'}</div>
            <div className="operator-user-role">{accessLevel.replace('_', ' ')}</div>
          </div>
          <button className="operator-logout-btn" onClick={handleLogout} title="Sign Out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </aside>

      <main className="operator-main">
        <header className="operator-topbar">
          <div className="operator-topbar-actions">
            <button className="operator-action-btn" title="Notifications">
              Alerts
            </button>
            <button className="operator-action-btn" title="Help & Support">
              Help
            </button>
          </div>
        </header>

        <div className="operator-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
