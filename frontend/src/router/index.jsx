// frontend/src/router/index.jsx
// UPDATED: Added /select-seats/:tripId and /booking/:tripId routes

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from '../modules/auth/pages/AuthPage';
import { getUser } from '../store/authStore';

// Admin imports
import AdminLayout from '../layouts/AdminLayout';
import AdminDashboard from '../modules/admin/pages/AdminDashboard';
import OperatorsPage from '../modules/admin/pages/OperatorsPage';
import CitiesPage from '../modules/admin/pages/CitiesPage';
import BusTypesPage from '../modules/admin/pages/BusTypesPage';

// Operator imports
import OperatorLayout from '../layouts/OperatorLayout';
import OperatorDashboard from '../modules/operator/pages/OperatorDashboard';
import OperatorBusesPage from '../modules/operator/pages/OperatorBusesPage';
import OperatorRoutesPage from '../modules/operator/pages/OperatorRoutesPage';
import OperatorTripsPage from '../modules/operator/pages/OperatorTripsPage';
import OperatorBookingsPage from '../modules/operator/pages/OperatorBookingsPage';
import OperatorFinancialsPage from '../modules/operator/pages/OperatorFinancialsPage';

// User imports
import UserLayout from '../layouts/UserLayout';
import HomePage from '../modules/user/pages/HomePage';
import SearchResultsPage from '../modules/user/pages/SearchResultsPage';
import SeatSelectionPage from '../modules/user/pages/SeatSelectionPage';  // NEW
import BookingPage from '../modules/user/pages/BookingPage';               // NEW
import MyBookingsPage from '../modules/user/pages/MyBookingsPage';         // NEW

const Placeholder = ({ title }) => (
  <div style={{ padding: '40px' }}>
    <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
      {title}
    </h2>
    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
      This module is under construction.
    </p>
  </div>
);

function ProtectedRoute({ allowedRoles, allowedOperatorAccessLevels, children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) {
    const dashboardMap = { USER: '/dashboard', OPERATOR: '/operator/dashboard', ADMIN: '/admin/dashboard' };
    return <Navigate to={dashboardMap[user.role] || '/login'} replace />;
  }
  if (user.role === 'OPERATOR' && allowedOperatorAccessLevels?.length) {
    const accessLevel = user.operator_access_level || 'OWNER';
    if (!allowedOperatorAccessLevels.includes(accessLevel)) {
      return <Navigate to="/operator/dashboard" replace />;
    }
  }
  return children;
}

function SmartRedirect({ children }) {
  const user = getUser();
  if (user) {
    const dashboardMap = { USER: '/dashboard', OPERATOR: '/operator/dashboard', ADMIN: '/admin/dashboard' };
    return <Navigate to={dashboardMap[user.role] || '/dashboard'} replace />;
  }
  return children;
}

// Helper to wrap user routes cleanly
const UserRoute = ({ children }) => (
  <ProtectedRoute allowedRoles={['USER']}>
    <UserLayout />
  </ProtectedRoute>
);

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Auth ─────────────────────────────────────────── */}
        <Route path="/login" element={<SmartRedirect><AuthPage /></SmartRedirect>} />
        <Route path="/register" element={<SmartRedirect><AuthPage /></SmartRedirect>} />

        {/* ── User / Passenger Routes ───────────────────────── */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['USER']}><UserLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['USER']}><UserLayout /></ProtectedRoute>}>
          <Route index element={<HomePage />} />
        </Route>

        <Route path="/search" element={<ProtectedRoute allowedRoles={['USER']}><UserLayout /></ProtectedRoute>}>
          <Route index element={<SearchResultsPage />} />
        </Route>

        {/* NEW: Seat selection — outside UserLayout (full-page, no sidebar) */}
        <Route path="/select-seats/:tripId" element={
          <ProtectedRoute allowedRoles={['USER']}>
            <SeatSelectionPage />
          </ProtectedRoute>
        } />

        {/* NEW: Booking/passenger details — outside UserLayout */}
        <Route path="/booking/:tripId" element={
          <ProtectedRoute allowedRoles={['USER']}>
            <BookingPage />
          </ProtectedRoute>
        } />

        {/* NEW: My Bookings */}
        <Route path="/my-bookings" element={<ProtectedRoute allowedRoles={['USER']}><UserLayout /></ProtectedRoute>}>
          <Route index element={<MyBookingsPage />} />
        </Route>

        <Route path="/profile" element={<ProtectedRoute allowedRoles={['USER']}><UserLayout /></ProtectedRoute>}>
          <Route index element={<Placeholder title="My Profile" />} />
        </Route>

        {/* ── Operator Routes ───────────────────────────────── */}
        <Route path="/operator" element={<ProtectedRoute allowedRoles={['OPERATOR']}><OperatorLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/operator/dashboard" replace />} />
          <Route path="dashboard" element={<OperatorDashboard />} />
          <Route path="buses" element={<ProtectedRoute allowedRoles={['OPERATOR']} allowedOperatorAccessLevels={['OWNER', 'MANAGER']}><OperatorBusesPage /></ProtectedRoute>} />
          <Route path="routes" element={<ProtectedRoute allowedRoles={['OPERATOR']} allowedOperatorAccessLevels={['OWNER', 'MANAGER']}><OperatorRoutesPage /></ProtectedRoute>} />
          <Route path="trips" element={<ProtectedRoute allowedRoles={['OPERATOR']} allowedOperatorAccessLevels={['OWNER', 'MANAGER', 'GROUND_STAFF']}><OperatorTripsPage /></ProtectedRoute>} />
          <Route path="bookings" element={<OperatorBookingsPage />} />
          <Route path="financials" element={<ProtectedRoute allowedRoles={['OPERATOR']} allowedOperatorAccessLevels={['OWNER', 'MANAGER']}><OperatorFinancialsPage /></ProtectedRoute>} />
        </Route>

        {/* ── Admin Routes ──────────────────────────────────── */}
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="operators" element={<OperatorsPage />} />
          <Route path="users" element={<Placeholder title="Passengers Management" />} />
          <Route path="bookings" element={<Placeholder title="Bookings Management" />} />
          <Route path="master/cities" element={<CitiesPage />} />
          <Route path="master/buses" element={<BusTypesPage />} />
          <Route path="settings" element={<Placeholder title="System Settings" />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
