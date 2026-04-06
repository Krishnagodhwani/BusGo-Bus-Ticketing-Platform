// frontend/src/modules/user/services/userService.js
// Central service layer for all user-facing API calls

import axiosInstance from '../../../api/axiosInstance';

// ==================== SEARCH ====================

export const getPublicCities = () =>
  axiosInstance.get('/booking/cities');

export const searchBuses = (originId, destinationId, date) =>
  axiosInstance.get('/booking/search', {
    params: { origin_id: originId, destination_id: destinationId, date }
  });

// ==================== TRIP DETAIL ====================

/**
 * Get all stops of a trip (for the route timeline display)
 * Returns: [{stop_id, city_name, stop_sequence, time_offset_mins, arrival_time}]
 */
export const getTripStops = (tripId) =>
  axiosInstance.get(`/booking/trip/${tripId}/stops`);

/**
 * Get seat map for a specific segment of a trip
 * boarding_stop_id and dropping_stop_id come from search results
 */
export const getSeatMap = (tripId, boardingStopId, droppingStopId) =>
  axiosInstance.get(`/booking/trip/${tripId}/seats`, {
    params: { boarding_stop_id: boardingStopId, dropping_stop_id: droppingStopId }
  });

// ==================== BOOKING ====================

/**
 * Create a booking
 * @param {Object} bookingData - { trip_id, boarding_stop_id, dropping_stop_id, seats, passengers, total_fare }
 */
export const createBooking = (bookingData) =>
  axiosInstance.post('/booking/book', bookingData);

/**
 * Get current user's bookings
 */
export const getMyBookings = () =>
  axiosInstance.get('/booking/my-bookings');

export const cancelMyBooking = (bookingId, payload = {}) =>
  axiosInstance.post(`/booking/my-bookings/${bookingId}/cancel`, payload);

export const getMyBookingRescheduleOptions = (bookingId) =>
  axiosInstance.get(`/booking/my-bookings/${bookingId}/reschedule-options`);

export const rescheduleMyBooking = (bookingId, payload) =>
  axiosInstance.post(`/booking/my-bookings/${bookingId}/reschedule`, payload);
