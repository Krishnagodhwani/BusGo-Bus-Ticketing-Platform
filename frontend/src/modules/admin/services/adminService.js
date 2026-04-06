import api from '../../../api/axiosInstance';

/**
 * Fetch top level platform stats for Admin
 */
export const getPlatformAnalytics = () => api.get('/admin/analytics');

/**
 * Fetch all master cities
 */
export const getCities = () => api.get('/admin/cities');

/**
 * Create a new master city
 */
export const createCity = (payload) => api.post('/admin/cities', payload);

/**
 * Fetch all master bus types
 */
export const getBusTypes = () => api.get('/admin/bus-types');

/**
 * Create a new master bus type
 */
export const createBusType = (payload) => api.post('/admin/bus-types', payload);

/**
 * Fetch all registered operators
 */
export const getOperators = () => api.get('/admin/operators');

/**
 * Create a new operator
 * Note: Uses auth module endpoint but restricted to ADMIN
 */
export const createOperator = (payload) => api.post('/auth/create-operator', payload);

/**
 * Toggle Operator Status (Activate/Deactivate)
 */
export const toggleOperatorStatus = (operatorId) => api.put(`/admin/operators/${operatorId}/status`);
