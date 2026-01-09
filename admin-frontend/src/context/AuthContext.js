// src/context/AuthContext.js

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';

const AuthContext = createContext();

// Helper to decode JWT token
function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('jwt') || '');
  const [loading, setLoading] = useState(true); // Add loading state
  const [activeTenant, setActiveTenantState] = useState(() => {
    const stored = localStorage.getItem('activeTenant');
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn('Failed to parse stored tenant:', error);
      localStorage.removeItem('activeTenant');
      return null;
    }
  });

  // On mount: fetch user if token exists
  useEffect(() => {
    async function fetchUser() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // Decode token to check if it's an agent token
        const decoded = decodeToken(token);
        
        if (decoded && decoded.role === 'agent') {
          // Agent token - use tenant data from localStorage
          const storedTenant = localStorage.getItem('agentTenant');
          
          if (storedTenant) {
            try {
              const tenantData = JSON.parse(storedTenant);
              // Set the tenant as the "user" for dashboard access
              const agentUser = {
                ...tenantData,
                role: 'agent', // Override role to agent
                agentId: decoded.agentId,
                agentUsername: decoded.username
              };
              setUser(agentUser);
              setActiveTenantState(tenantData); // Set tenant as active
            } catch (parseError) {
              console.error('Failed to parse tenant data:', parseError);
              // Clear invalid data
              setUser(null);
              setToken('');
              localStorage.removeItem('jwt');
              localStorage.removeItem('isAgent');
              localStorage.removeItem('agentTenant');
              setActiveTenantState(null);
              localStorage.removeItem('activeTenant');
            }
          } else {
            // No tenant data stored, token invalid
            setUser(null);
            setToken('');
            localStorage.removeItem('jwt');
            localStorage.removeItem('isAgent');
            setActiveTenantState(null);
            localStorage.removeItem('activeTenant');
          }
        } else {
          // Regular user/admin token
          const res = await fetch(`${API_BASE_URL}/user/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data);
            localStorage.removeItem('isAgent'); // Clean up agent flag
          } else {
            // Token invalid or expired
            setUser(null);
            setToken('');
            localStorage.removeItem('jwt');
            localStorage.removeItem('isAgent');
            setActiveTenantState(null);
            localStorage.removeItem('activeTenant');
          }
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [token]);

  // Login helper
  async function login(username, password, loginType = 'admin') {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, loginType }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setToken(data.token);
        localStorage.setItem('jwt', data.token);
        setUser(data.user || null);
        setActiveTenantState(null);
        localStorage.removeItem('activeTenant');
        return { success: true };
      } else {
        setUser(null);
        return { 
          success: false, 
          message: data.error || data.message || 'Login failed',
          redirectTo: data.redirectTo // Include redirect suggestion from backend
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  }

  // Register helper - backend expects: name, email, username, password
  async function register({ name, email, username, password }) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, username, password }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setToken(data.token);
        localStorage.setItem('jwt', data.token);
        setUser(data.user || null);
        setActiveTenantState(null);
        localStorage.removeItem('activeTenant');
        return { success: true };
      } else {
        setUser(null);
        return { success: false, message: data.error || data.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setUser(null);
    setToken('');
    localStorage.removeItem('jwt');
    localStorage.removeItem('isAgent');
    localStorage.removeItem('agentTenant');
    setActiveTenantState(null);
    localStorage.removeItem('activeTenant');
  }

  const setActiveTenant = useCallback((tenant) => {
    if (tenant) {
      setActiveTenantState(tenant);
      localStorage.setItem('activeTenant', JSON.stringify(tenant));
    } else {
      setActiveTenantState(null);
      localStorage.removeItem('activeTenant');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        activeTenant,
        setActiveTenant
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
