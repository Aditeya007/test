// src/api/index.js

import { API_BASE_URL } from '../config';

/**
 * Generic API request function with error handling
 * @param {string} endpoint - API endpoint (e.g., '/user/me')
 * @param {Object} options - Request configuration
 * @returns {Promise<Object>} Response data
 * @throws {Error} API error with message
 */
export async function apiRequest(endpoint, { method = 'GET', token, data, params, ...custom } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const options = {
    method,
    headers,
    ...(data ? { body: JSON.stringify(data) } : {}),
    ...custom,
  };

  // Build URL with query params for GET requests
  let url = `${API_BASE_URL}${endpoint}`;
  if (params && typeof params === 'object') {
    const queryString = new URLSearchParams(params).toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  try {
    const res = await fetch(url, options);
    
    // Parse response
    let result;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      result = await res.json();
    } else {
      result = { message: await res.text() };
    }

    // Handle non-OK responses
    if (!res.ok) {
      const errorMessage = result.error || result.message || `API error: ${res.status}`;
      throw new Error(errorMessage);
    }

    return result;
  } catch (error) {
    // Re-throw with better error message
    if (error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
}

/**
 * Get all bots for a user (admin endpoint)
 * @param {string} userId - User ID
 * @param {string} token - JWT token
 * @returns {Promise<Object>} { bots: Array, count: number }
 */
export async function getUserBots(userId, token) {
  return apiRequest(`/users/${userId}/bots`, {
    method: 'GET',
    token
  });
}

/**
 * Get all bots for the current user (user endpoint)
 * @param {string} token - JWT token
 * @returns {Promise<Object>} { bots: Array, count: number }
 */
export async function getUserOwnBots(token) {
  return apiRequest('/bot', {
    method: 'GET',
    token
  });
}

/**
 * Create a new bot
 * @param {Object} data - Bot data (e.g., { scrapedWebsites: string[], name?: string })
 * @param {string} token - JWT token
 * @returns {Promise<Object>} { success: boolean, bot: Object }
 */
export async function createBot(data, token) {
  return apiRequest('/bot', {
    method: 'POST',
    token,
    data
  });
}

/**
 * Update a bot's configuration
 * @param {string} botId - Bot ID
 * @param {Object} data - Update data (e.g., { scrapedWebsites: string[] })
 * @param {string} token - JWT token
 * @returns {Promise<Object>} { success: boolean, bot: Object }
 */
export async function updateBot(botId, data, token) {
  return apiRequest(`/bot/${botId}`, {
    method: 'PUT',
    token,
    data
  });
}

