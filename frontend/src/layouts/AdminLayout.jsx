import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getUser, clearAuth } from '../store/authStore';
import './AdminLayout.css';

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user) return null;

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon-sm">BG</div>
          <div className="brand-name-sm">BusGo Admin</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Overview</div>
          <NavLink to="/admin/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">DB</span>
            Dashboard
          </NavLink>

          <div className="nav-label">Management</div>
          <NavLink to="/admin/operators" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">OP</span>
            Operators
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">US</span>
            Passengers
          </NavLink>
          <NavLink to="/admin/bookings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">BK</span>
            Bookings
          </NavLink>

          <div className="nav-label">Master Data</div>
          <NavLink to="/admin/master/cities" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">CT</span>
            Cities List
          </NavLink>
          <NavLink to="/admin/master/buses" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">BT</span>
            Bus Types
          </NavLink>

          <div className="nav-label">System</div>
          <NavLink to="/admin/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">ST</span>
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="admin-avatar">
            {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div className="admin-info">
            <div className="admin-name">{user.name || 'System Admin'}</div>
            <div className="admin-role">Administrator</div>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Logout">
            Out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="dashboard-bg"></div>

        <header className="admin-topbar">
          <div className="topbar-title">Platform Control</div>
          <div className="topbar-actions">
            <button className="topbar-btn" title="View live site">
              Web
            </button>
            <button className="topbar-btn" title="Notifications">
              Bell
              <span className="notification-dot"></span>
            </button>
          </div>
        </header>

        <section className="admin-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
