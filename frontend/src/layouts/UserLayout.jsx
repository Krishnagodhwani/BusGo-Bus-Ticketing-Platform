import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { clearAuth } from '../store/authStore';
import './UserLayout.css';

export default function UserLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="user-layout">
      <nav className="user-navbar">
        <NavLink to="/dashboard" className="user-nav-brand">
          <div className="user-nav-logo">B</div>
          <div className="user-nav-title">BusGo</div>
        </NavLink>

        <div className="user-nav-links">
          <NavLink to="/dashboard" className={({ isActive }) => `user-nav-link ${isActive ? 'active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/my-bookings" className={({ isActive }) => `user-nav-link ${isActive ? 'active' : ''}`}>
            My Bookings
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `user-nav-link ${isActive ? 'active' : ''}`}>
            Profile
          </NavLink>
          <button className="user-nav-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
