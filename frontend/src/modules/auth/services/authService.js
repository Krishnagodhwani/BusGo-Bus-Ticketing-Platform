import api from '../../../api/axiosInstance';

/**
 * Login with phone & password → returns { access_token, token_type, user }
 */
export const loginUser = (phone, password) =>
  api.post('/auth/login', { phone, password });

/**
 * Register new passenger → returns user object
 * Backend forces role=USER, so no role field needed
 */
export const registerUser = (payload) =>
  api.post('/auth/register', payload);

/**
 * Get current user profile (requires auth token)
 */
export const getCurrentUser = () =>
  api.get('/auth/me');