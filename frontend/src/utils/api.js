// frontend/src/utils/api.js

let inMemoryAccessToken = null;
let refreshPromise = null;
let onAuthFailureCallback = null;

export const setAccessToken = (token) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = () => inMemoryAccessToken;

export const setOnAuthFailure = (cb) => {
  onAuthFailureCallback = cb;
};

const BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Handles silent refresh deduplication.
 * Returns new accessToken or null if guest / expired.
 */
export const requestTokenRefresh = async () => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Sends HTTP-only refresh cookie
      });

      if (!res.ok) {
        setAccessToken(null);
        if (onAuthFailureCallback) onAuthFailureCallback();
        return null;
      }

      const json = await res.json();
      const newToken = json?.data?.accessToken || null;
      setAccessToken(newToken);
      return newToken;
    } catch {
      setAccessToken(null);
      if (onAuthFailureCallback) onAuthFailureCallback();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * Centralized fetch wrapper:
 * 1. Attaches Authorization: Bearer <token>
 * 2. On 401: calls POST /auth/refresh once with credentials: 'include'
 * 3. Retries original request once with new token
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const fetchOptions = {
    cache: 'no-store',
    ...options,
    headers,
    credentials: options.credentials || 'include',
  };

  let response = await fetch(url, fetchOptions);

  // 401 Interception: Attempt silent refresh and retry ONCE
  if (response.status === 401 && !options._isRetry) {
    const newToken = await requestTokenRefresh();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(url, {
        ...fetchOptions,
        headers,
        _isRetry: true,
      });
    }
  }

  return response;
};

export const api = {
  get: (endpoint, options) => apiFetch(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) =>
    apiFetch(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: (endpoint, body, options) =>
    apiFetch(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: (endpoint, options) => apiFetch(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
