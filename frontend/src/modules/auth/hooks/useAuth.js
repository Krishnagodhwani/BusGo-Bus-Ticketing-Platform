import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser } from '../services/authService';
import { saveAuth, clearAuth } from '../../../store/authStore';

/**
 * Custom hook for authentication logic.
 * Handles login, register, logout and error/loading states.
 */
export default function useAuth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Map role to dashboard path
  const getDashboardPath = (role) => {
    const map = {
      USER: '/dashboard',
      OPERATOR: '/operator/dashboard',
      ADMIN: '/admin/dashboard',
    };
    return map[role] || '/dashboard';
  };

  /**
   * Login handler
   * @param {string} phone - 10-digit Indian phone number
   * @param {string} password - User password
   */
  const login = async (phone, password) => {
    setLoading(true);
    setError('');
    try {
      const res = await loginUser(phone, password);
      const { access_token, user } = res.data;

      // Save token & user to localStorage
      saveAuth(access_token, user);

      // Redirect based on role (silently — user doesn't see role info)
      navigate(getDashboardPath(user.role), { replace: true });

      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        'Something went wrong. Please try again.';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Register handler (always creates USER role)
   * @param {object} payload - { phone, password, name?, email?, gender?, date_of_birth? }
   */
  const register = async (payload) => {
    setLoading(true);
    setError('');
    try {
      await registerUser(payload);
      // After registration, auto-login
      return await login(payload.phone, payload.password);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        'Registration failed. Please try again.';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Logout — clear stored auth and redirect to login
   */
  const logout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return {
    login,
    register,
    logout,
    loading,
    error,
    setError,
  };
}
