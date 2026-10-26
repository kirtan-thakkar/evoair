// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAccessToken, requestTokenRefresh, setOnAuthFailure } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setLocalAccessToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync token into api.js module and local React state
  const handleTokenUpdate = useCallback((token, userProfile = null) => {
    setAccessToken(token);
    setLocalAccessToken(token);
    if (userProfile) {
      setUser(userProfile);
    }
  }, []);

  // 1. Silent Initial Refresh on Mount
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const token = await requestTokenRefresh();
        if (token && isMounted) {
          // Fetch current user details with newly acquired token
          const res = await api.get('/api/v1/auth/me');
          if (res.ok) {
            const data = await res.json();
            if (isMounted) {
              handleTokenUpdate(token, data?.data?.user || null);
            }
          } else {
            handleTokenUpdate(token);
          }
        }
      } catch {
        // Silent catch for guests: no toasts, no console noise
        if (isMounted) {
          handleTokenUpdate(null, null);
        }
      } finally {
        if (isMounted) {
          setAuthReady(true);
        }
      }
    };

    // Register failure callback so unexpected 401s clear user cleanly
    setOnAuthFailure(() => {
      if (isMounted) {
        setUser(null);
        setLocalAccessToken(null);
      }
    });

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [handleTokenUpdate]);

  // 2. Login
  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/login', { email, password });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || 'Login failed');
      }

      const { user: userProfile, accessToken: token } = json.data;
      handleTokenUpdate(token, userProfile);
      return userProfile;
    } finally {
      setLoading(false);
    }
  };

  // 3. Register
  const register = async ({ name, email, password, phone }) => {
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/register', {
        name,
        email,
        password,
        phone: phone || undefined,
      });
      const json = await res.json();

      if (!res.ok) {
        const firstError = json.errors?.[0]?.message;
        throw new Error(firstError || json.message || 'Registration failed');
      }

      const { user: userProfile, accessToken: token } = json.data;
      handleTokenUpdate(token, userProfile);
      return userProfile;
    } finally {
      setLoading(false);
    }
  };

  // 4. Google Login
  const loginWithGoogle = async (credential) => {
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/google', { credential });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || 'Google authentication failed');
      }

      const { user: userProfile, accessToken: token } = json.data;
      handleTokenUpdate(token, userProfile);
      return userProfile;
    } finally {
      setLoading(false);
    }
  };

  // 5. Logout
  const logout = async () => {
    setLoading(true);
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      handleTokenUpdate(null, null);
      setLoading(false);
    }
  };

  const value = {
    user,
    accessToken,
    authReady,
    loading,
    isAuthenticated: Boolean(user && accessToken),
    login,
    loginWithGoogle,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
