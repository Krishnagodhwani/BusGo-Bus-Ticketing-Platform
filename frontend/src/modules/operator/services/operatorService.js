import api from '../../../api/axiosInstance';

export const getOperatorDashboardSummary = () => api.get('/operator/dashboard-summary');
export const getOperatorAlerts = () => api.get('/operator/alerts');
export const getOperatorNotifications = (params = {}) => api.get('/operator/notifications', { params });
export const getOperatorNotificationSummary = () => api.get('/operator/notifications/summary');
export const markOperatorNotificationRead = (notificationId) => api.post(`/operator/notifications/${notificationId}/read`);
export const markAllOperatorNotificationsRead = () => api.post('/operator/notifications/read-all');
export const updateOperatorNotificationStatus = (notificationId, payload) => api.patch(`/operator/notifications/${notificationId}/status`, payload);

export const getMyBuses = () => api.get('/operator/buses');
export const createBus = (payload) => api.post('/operator/buses', payload);
export const updateBus = (busId, payload) => api.put(`/operator/buses/${busId}`, payload);
export const updateBusStatus = (busId, payload) => api.patch(`/operator/buses/${busId}/status`, payload);
export const cloneBus = (busId) => api.post(`/operator/buses/${busId}/clone`);
export const deleteBus = (busId, archiveIfUsed = true) => api.delete(`/operator/buses/${busId}`, { params: { archive_if_used: archiveIfUsed } });

export const getMyRoutes = () => api.get('/operator/routes');
export const createRoute = (payload) => api.post('/operator/routes', payload);
export const updateRoute = (routeId, payload) => api.put(`/operator/routes/${routeId}`, payload);
export const cloneRoute = (routeId) => api.post(`/operator/routes/${routeId}/clone`);
export const deleteRoute = (routeId, archiveIfUsed = true) => api.delete(`/operator/routes/${routeId}`, { params: { archive_if_used: archiveIfUsed } });

export const createTrip = (payload) => api.post('/operator/trips', payload);
export const createTripSchedule = (payload) => api.post('/operator/trips/schedule', payload);
export const getMyTrips = () => api.get('/operator/trips');
export const updateTrip = (tripId, payload) => api.put(`/operator/trips/${tripId}`, payload);
export const updateTripStatus = (tripId, payload) => api.patch(`/operator/trips/${tripId}/status`, payload);
export const cloneTrip = (tripId, payload = { days_offset: 1 }) => api.post(`/operator/trips/${tripId}/clone`, payload);
export const cancelTripSeries = (seriesCode) => api.post(`/operator/trips/series/${seriesCode}/cancel`);
export const deleteTrip = (tripId) => api.delete(`/operator/trips/${tripId}`);
export const getTripOperationsSummary = (tripId) => api.get(`/operator/trips/${tripId}/operations`);

export const getBookingSummary = () => api.get('/operator/bookings/summary');
export const getOperatorBookings = (params = {}) => api.get('/operator/bookings', { params });
export const exportOperatorBookings = (params = {}) => api.get('/operator/bookings/export', { params, responseType: 'blob' });
export const getOperatorBookingDetail = (bookingId) => api.get(`/operator/bookings/${bookingId}`);
export const getOperatorTicketDocument = (bookingId) => api.get(`/operator/bookings/${bookingId}/ticket-document`, { responseType: 'text' });
export const resendOperatorTicket = (bookingId, channel = 'SMS') => api.post(`/operator/bookings/${bookingId}/resend-ticket`, null, { params: { channel } });
export const updateOperatorBooking = (bookingId, payload) => api.patch(`/operator/bookings/${bookingId}`, payload);
export const cancelOperatorBooking = (bookingId, payload) => api.post(`/operator/bookings/${bookingId}/cancel`, payload);
export const getOperatorBookingRescheduleOptions = (bookingId) => api.get(`/operator/bookings/${bookingId}/reschedule-options`);
export const rescheduleOperatorBooking = (bookingId, payload) => api.post(`/operator/bookings/${bookingId}/reschedule`, payload);
export const getTripManifest = (tripId) => api.get(`/operator/trips/${tripId}/manifest`);
export const exportTripManifest = (tripId) => api.get(`/operator/trips/${tripId}/manifest/export`, { responseType: 'blob' });
export const getTripManifestDocument = (tripId, params = {}) => api.get(`/operator/trips/${tripId}/manifest-document`, { params, responseType: 'text' });

export const getFinancialSummary = () => api.get('/operator/financials/summary');
export const getFinancialTransactions = (params = {}) => api.get('/operator/financials/transactions', { params });
export const getFinancialTrends = () => api.get('/operator/financials/trends');
export const getFinancialPerformance = () => api.get('/operator/financials/performance');
export const exportFinancialTransactions = () => api.get('/operator/financials/export', { responseType: 'blob' });
export const exportDailyOperationsReport = () => api.get('/operator/reports/daily-operations', { responseType: 'blob' });
export const exportCancellationsRefundsReport = () => api.get('/operator/reports/cancellations-refunds', { responseType: 'blob' });
export const exportRoutePerformanceReport = () => api.get('/operator/reports/route-performance', { responseType: 'blob' });
export const getCompanyProfile = () => api.get('/operator/company-profile');
export const updateCompanyProfile = (payload) => api.put('/operator/company-profile', payload);
export const getOperatorCrew = () => api.get('/operator/crew');
export const createOperatorCrew = (payload) => api.post('/operator/crew', payload);
export const updateOperatorCrew = (crewId, payload) => api.put(`/operator/crew/${crewId}`, payload);
export const getBlockedSeats = () => api.get('/operator/blocked-seats');
export const createBlockedSeat = (payload) => api.post('/operator/blocked-seats', payload);
export const deleteBlockedSeat = (blockedSeatId) => api.delete(`/operator/blocked-seats/${blockedSeatId}`);

export const getAdminCities = () => api.get('/admin/cities');
export const getAdminBusTypes = () => api.get('/admin/bus-types');
